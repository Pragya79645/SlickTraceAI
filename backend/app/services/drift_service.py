"""
Drift Service — 2D Lagrangian oil slick advection model.

Computes:
1. Combined surface advection: oil_velocity = current + 0.03 * wind
2. 6-hour backward hindcast trajectory (30-min steps) -> estimated origin
3. 6-hour forward forecast trajectory (30-min steps) -> forecast endpoint
4. Monte Carlo ensemble: N particles with perturbed forcing + turbulent diffusion,
   summarised as 50/80/95 % confidence ellipses per timestep and an origin corridor.
"""

from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple

import numpy as np
import shapely.geometry

from app.schemas.investigation import (
    CurrentVector,
    DriftAnalysis,
    DriftEnsemble,
    DriftMethod,
    DriftVector,
    EnsembleEllipse,
    EnsembleStep,
    Environment,
    Forecast,
    ForecastEndpoint,
    GeoTimestep,
    Hindcast,
    HindcastOrigin,
    Observation,
)
from app.services.environment_service import (
    EnvironmentalConditions,
    get_environment,
)

METERS_PER_DEG_LAT = 111195.0

# ─── Monte Carlo configuration ────────────────────────────────────────────────
# Parameter uncertainty is sampled once per particle (it represents our ignorance of
# the true forcing); turbulent diffusion is sampled every step (sub-grid eddies).

ENSEMBLE_PARTICLES = 500
ENSEMBLE_SEED = 42
CURRENT_SPEED_SIGMA = 0.25      # fractional std-dev of current speed
CURRENT_DIR_SIGMA_DEG = 20.0    # std-dev of current direction error
WIND_SPEED_SIGMA = 0.20         # fractional std-dev of wind speed
WIND_DIR_SIGMA_DEG = 15.0       # std-dev of wind direction error
WIND_FACTOR_RANGE = (0.02, 0.04)   # literature range for the surface-oil wind-drift factor
EDDY_DIFFUSIVITY_M2S = 10.0     # horizontal eddy diffusivity K; step σ = sqrt(2·K·Δt) per axis

# Chi-square quantiles with 2 degrees of freedom → scale of a 2-D Gaussian confidence ellipse
CHI2_2DOF = {0.50: 1.3863, 0.80: 3.2189, 0.95: 5.9915}
CONFIDENCE_BANDS: Tuple[float, ...] = (0.50, 0.80, 0.95)
ELLIPSE_VERTICES = 32
ORIGIN_PARTICLE_SAMPLE = 300


# ─── Ensemble helpers ─────────────────────────────────────────────────────────

def _xy_to_latlon(x_m: np.ndarray, y_m: np.ndarray, lat0: float, lon0: float, cos_lat: float):
    """Local equirectangular projection — identical to the deterministic trajectory's."""
    return lat0 + y_m / METERS_PER_DEG_LAT, lon0 + x_m / (METERS_PER_DEG_LAT * cos_lat)


def _fit_ellipse(
    pts_xy: np.ndarray, confidence: float, lat0: float, lon0: float, cos_lat: float
) -> EnsembleEllipse:
    """Fits a Gaussian confidence ellipse to an (N, 2) cloud of metre offsets."""
    mean = pts_xy.mean(axis=0)
    cov = np.cov(pts_xy, rowvar=False)
    cov = np.atleast_2d(cov) + np.eye(2) * 1e-6          # guard a degenerate cloud
    eigvals, eigvecs = np.linalg.eigh(cov)                # ascending
    scale = CHI2_2DOF[confidence]
    b_m = math.sqrt(max(eigvals[0], 0.0) * scale)         # semi-minor
    a_m = math.sqrt(max(eigvals[1], 0.0) * scale)         # semi-major
    major = eigvecs[:, 1]                                 # (x_east, y_north)
    minor = eigvecs[:, 0]

    t = np.linspace(0.0, 2.0 * math.pi, ELLIPSE_VERTICES, endpoint=False)
    ring_xy = mean + np.outer(np.cos(t) * a_m, major) + np.outer(np.sin(t) * b_m, minor)
    ring_lat, ring_lon = _xy_to_latlon(ring_xy[:, 0], ring_xy[:, 1], lat0, lon0, cos_lat)
    polygon = [[round(float(la), 6), round(float(lo), 6)] for la, lo in zip(ring_lat, ring_lon)]
    polygon.append(polygon[0])                            # close the ring

    c_lat, c_lon = _xy_to_latlon(mean[0], mean[1], lat0, lon0, cos_lat)
    bearing = math.degrees(math.atan2(major[0], major[1])) % 180.0

    return EnsembleEllipse(
        confidence=confidence,
        center_lat=round(float(c_lat), 6),
        center_lon=round(float(c_lon), 6),
        semi_major_km=round(a_m / 1000.0, 3),
        semi_minor_km=round(b_m / 1000.0, 3),
        orientation_deg=round(bearing, 1),
        area_km2=round(math.pi * a_m * b_m / 1e6, 3),
        polygon=polygon,
    )


def _summarise_step(
    pts_xy: np.ndarray, timestamp: str, hours_offset: float, lat0: float, lon0: float, cos_lat: float
) -> EnsembleStep:
    mean = pts_xy.mean(axis=0)
    spread_m = float(np.sqrt(((pts_xy - mean) ** 2).sum(axis=1).mean()))
    m_lat, m_lon = _xy_to_latlon(mean[0], mean[1], lat0, lon0, cos_lat)
    return EnsembleStep(
        timestamp=timestamp,
        hours_offset=hours_offset,
        mean_lat=round(float(m_lat), 6),
        mean_lon=round(float(m_lon), 6),
        spread_km=round(spread_m / 1000.0, 3),
        ellipses=[_fit_ellipse(pts_xy, c, lat0, lon0, cos_lat) for c in CONFIDENCE_BANDS],
    )


def compute_ensemble(
    latitude: float,
    longitude: float,
    obs_dt: datetime,
    environment: EnvironmentalConditions,
    duration_hours: int = 6,
    step_minutes: int = 30,
    n_particles: int = ENSEMBLE_PARTICLES,
    seed: int = ENSEMBLE_SEED,
) -> DriftEnsemble:
    """
    Monte Carlo drift ensemble. Each particle advects with its own perturbed current/wind
    vectors and wind-drift factor, plus a per-step random walk for turbulent diffusion.
    The cloud is integrated both backward (hindcast) and forward (forecast) from the
    observation, and summarised as confidence ellipses at every timestep.
    """
    rng = np.random.default_rng(seed)
    dt_s = step_minutes * 60.0
    num_steps = int(round(duration_hours * 60 / step_minutes))
    cos_lat = max(abs(math.cos(math.radians(latitude))), 1e-6)

    # --- per-particle forcing perturbations (fixed over the run) ------------------
    cur_speed = math.hypot(environment.current_u_ms, environment.current_v_ms)
    cur_dir = math.atan2(environment.current_u_ms, environment.current_v_ms)
    wind_speed = math.hypot(environment.wind_u_ms, environment.wind_v_ms)
    wind_dir = math.atan2(environment.wind_u_ms, environment.wind_v_ms)

    cur_s = cur_speed * np.clip(rng.normal(1.0, CURRENT_SPEED_SIGMA, n_particles), 0.3, 1.7)
    cur_d = cur_dir + np.radians(rng.normal(0.0, CURRENT_DIR_SIGMA_DEG, n_particles))
    wnd_s = wind_speed * np.clip(rng.normal(1.0, WIND_SPEED_SIGMA, n_particles), 0.4, 1.6)
    wnd_d = wind_dir + np.radians(rng.normal(0.0, WIND_DIR_SIGMA_DEG, n_particles))
    wfac = rng.uniform(WIND_FACTOR_RANGE[0], WIND_FACTOR_RANGE[1], n_particles)

    u = cur_s * np.sin(cur_d) + wfac * wnd_s * np.sin(wnd_d)   # east  (m/s)
    v = cur_s * np.cos(cur_d) + wfac * wnd_s * np.cos(wnd_d)   # north (m/s)
    step_dx, step_dy = u * dt_s, v * dt_s
    diff_sigma = math.sqrt(2.0 * EDDY_DIFFUSIVITY_M2S * dt_s)

    # --- integrate ------------------------------------------------------------------
    def integrate(sign: float) -> List[np.ndarray]:
        pos = np.zeros((n_particles, 2))
        cloud = [pos.copy()]
        for _ in range(num_steps):
            pos = pos + sign * np.column_stack((step_dx, step_dy)) + rng.normal(0.0, diff_sigma, (n_particles, 2))
            cloud.append(pos.copy())
        return cloud

    hind_cloud = integrate(-1.0)
    fore_cloud = integrate(+1.0)

    hind_steps = [
        _summarise_step(
            pts, (obs_dt - timedelta(minutes=step_minutes * k)).isoformat(),
            -round(k * step_minutes / 60.0, 1), latitude, longitude, cos_lat,
        )
        for k, pts in enumerate(hind_cloud)
    ]
    fore_steps = [
        _summarise_step(
            pts, (obs_dt + timedelta(minutes=step_minutes * k)).isoformat(),
            round(k * step_minutes / 60.0, 1), latitude, longitude, cos_lat,
        )
        for k, pts in enumerate(fore_cloud)
    ]

    # --- origin cloud, corridor hull -------------------------------------------------
    origin_xy = hind_cloud[-1]
    sample_idx = rng.choice(n_particles, size=min(ORIGIN_PARTICLE_SAMPLE, n_particles), replace=False)
    o_lat, o_lon = _xy_to_latlon(origin_xy[sample_idx, 0], origin_xy[sample_idx, 1], latitude, longitude, cos_lat)
    origin_particles = [[round(float(a), 6), round(float(b), 6)] for a, b in zip(o_lat, o_lon)]

    all_hind = np.vstack(hind_cloud)
    h_lat, h_lon = _xy_to_latlon(all_hind[:, 0], all_hind[:, 1], latitude, longitude, cos_lat)
    hull = shapely.geometry.MultiPoint(list(zip(h_lon.tolist(), h_lat.tolist()))).convex_hull
    corridor = [[round(y, 6), round(x, 6)] for x, y in hull.exterior.coords] if hull.geom_type == "Polygon" else []

    origin_80 = next(e for e in hind_steps[-1].ellipses if e.confidence == 0.80)

    return DriftEnsemble(
        n_particles=n_particles,
        seed=seed,
        method="Monte Carlo Lagrangian ensemble with perturbed forcing and random-walk eddy diffusion",
        perturbations={
            "current_speed": f"× N(1, {CURRENT_SPEED_SIGMA}) clipped [0.3, 1.7]",
            "current_direction": f"± N(0, {CURRENT_DIR_SIGMA_DEG:.0f}°)",
            "wind_speed": f"× N(1, {WIND_SPEED_SIGMA}) clipped [0.4, 1.6]",
            "wind_direction": f"± N(0, {WIND_DIR_SIGMA_DEG:.0f}°)",
            "wind_drift_factor": f"U({WIND_FACTOR_RANGE[0]}, {WIND_FACTOR_RANGE[1]})",
            "eddy_diffusion": f"K = {EDDY_DIFFUSIVITY_M2S:.0f} m²/s → σ = {diff_sigma:.0f} m per {step_minutes}-min step",
        },
        hindcast_steps=hind_steps,
        forecast_steps=fore_steps,
        origin_particles=origin_particles,
        origin_corridor=corridor,
        origin_80_area_km2=origin_80.area_km2,
        limitations=[
            "Perturbation magnitudes are literature-typical priors, not calibrated to local model skill",
            "Forcing is held constant in time for each particle; no temporal variability within the window",
            "Diffusion is isotropic and does not resolve coastal boundaries or bathymetry",
        ],
    )


def compute_drift(
    spill_id: str,
    latitude: float,
    longitude: float,
    timestamp: str,
    coordinate_source: str = "prototype_scene_georeference",
    environment: Optional[EnvironmentalConditions] = None,
    duration_hours: int = 6,
    step_minutes: int = 30,
    include_ensemble: bool = True,
) -> DriftAnalysis:
    """
    Executes 2D Lagrangian advection hindcasting and forecasting for an observed oil spill.
    The deterministic trajectory uses the mean forcing; the attached Monte Carlo ensemble
    quantifies how uncertain the origin and forecast positions are.
    """
    # 1. Parse and validate timestamp
    ts_clean = timestamp.replace("Z", "+00:00")
    try:
        obs_dt = datetime.fromisoformat(ts_clean)
    except Exception as exc:
        raise ValueError(f"Invalid observation timestamp '{timestamp}': {exc}") from exc

    if obs_dt.tzinfo is None:
        obs_dt = obs_dt.replace(tzinfo=timezone.utc)

    # 2. Resolve environmental vectors
    if environment is None:
        environment = get_environment(latitude, longitude, timestamp)

    # 3. Compute combined oil velocity vector (Lagrangian advection)
    # oil_velocity = current + wind_factor * wind
    drift_u = environment.current_u_ms + (environment.wind_factor * environment.wind_u_ms)
    drift_v = environment.current_v_ms + (environment.wind_factor * environment.wind_v_ms)
    drift_speed = math.sqrt(drift_u**2 + drift_v**2)

    # 4. Compute coordinate delta per timestep (30 min = 1800 s)
    dt_seconds = step_minutes * 60
    dy_meters = drift_v * dt_seconds  # North-South displacement
    dx_meters = drift_u * dt_seconds  # East-West displacement

    dlat_step = dy_meters / METERS_PER_DEG_LAT
    cos_lat = math.cos(math.radians(latitude))
    # Prevent division by zero near poles
    if abs(cos_lat) < 1e-6:
        cos_lat = 1e-6
    dlon_step = dx_meters / (METERS_PER_DEG_LAT * cos_lat)

    num_steps = int(round((duration_hours * 60) / step_minutes))

    # 5. Build Hindcast (Backward in time to estimate spill origin)
    hindcast_traj: List[GeoTimestep] = []
    for k in range(num_steps + 1):
        step_time = obs_dt - timedelta(minutes=step_minutes * k)
        step_lat = round(latitude - (dlat_step * k), 6)
        step_lon = round(longitude - (dlon_step * k), 6)
        hours_before = round(k * (step_minutes / 60.0), 1)

        hindcast_traj.append(
            GeoTimestep(
                timestamp=step_time.isoformat(),
                lat=step_lat,
                lon=step_lon,
                hours_before_observation=hours_before,
            )
        )

    origin_step = hindcast_traj[-1]
    estimated_origin = HindcastOrigin(
        timestamp=origin_step.timestamp,
        lat=origin_step.lat,
        lon=origin_step.lon,
        hours_before_observation=float(duration_hours),
    )

    # 6. Build Forecast (Forward in time to predict slick movement)
    forecast_traj: List[GeoTimestep] = []
    for k in range(num_steps + 1):
        step_time = obs_dt + timedelta(minutes=step_minutes * k)
        step_lat = round(latitude + (dlat_step * k), 6)
        step_lon = round(longitude + (dlon_step * k), 6)
        hours_after = round(k * (step_minutes / 60.0), 1)

        forecast_traj.append(
            GeoTimestep(
                timestamp=step_time.isoformat(),
                lat=step_lat,
                lon=step_lon,
                hours_after_observation=hours_after,
            )
        )

    endpoint_step = forecast_traj[-1]
    forecast_endpoint = ForecastEndpoint(
        timestamp=endpoint_step.timestamp,
        lat=endpoint_step.lat,
        lon=endpoint_step.lon,
        hours_after_observation=float(duration_hours),
    )

    # 7. Monte Carlo ensemble around the same forcing
    ensemble = (
        compute_ensemble(latitude, longitude, obs_dt, environment, duration_hours, step_minutes)
        if include_ensemble
        else None
    )

    # 8. Construct DriftAnalysis response
    return DriftAnalysis(
        spill_id=spill_id,
        observation=Observation(
            timestamp=obs_dt.isoformat(),
            latitude=round(latitude, 6),
            longitude=round(longitude, 6),
            coordinate_source=coordinate_source,
        ),
        environment=Environment(
            source=environment.source,
            current=CurrentVector(
                u_ms=round(environment.current_u_ms, 3),
                v_ms=round(environment.current_v_ms, 3),
            ),
            wind=CurrentVector(
                u_ms=round(environment.wind_u_ms, 3),
                v_ms=round(environment.wind_v_ms, 3),
            ),
            wind_factor=environment.wind_factor,
            drift=DriftVector(
                u_ms=round(drift_u, 3),
                v_ms=round(drift_v, 3),
                speed_ms=round(drift_speed, 6),
            ),
            quality=environment.quality,
            confidence_score=environment.confidence_score,
            valid_time=environment.valid_time,
            provider_detail=environment.provider_detail,
            notes=environment.notes,
        ),
        hindcast=Hindcast(
            duration_hours=duration_hours,
            step_minutes=step_minutes,
            trajectory=hindcast_traj,
            estimated_origin=estimated_origin,
        ),
        forecast=Forecast(
            duration_hours=duration_hours,
            step_minutes=step_minutes,
            trajectory=forecast_traj,
            forecast_endpoint=forecast_endpoint,
        ),
        method=DriftMethod(
            type="Lagrangian_advection",
            formula="oil_velocity = current + 0.03 * wind",
        ),
        prototype_limitations=[
            "Geographic coordinates are scene georeferencing anchors",
            (
                f"Ocean current and wind vectors from {environment.provider_detail} (valid {environment.valid_time})"
                if environment.source == "open_meteo"
                else f"Ocean current and wind vectors sourced from {environment.source} — {environment.notes or 'prototype values'}"
            ),
            "Forecast uses constant steady-state advection; dynamic weather variability is a prototype limitation",
            "Hindcast origin is an estimate, not a confirmed spill source",
        ],
        ensemble=ensemble,
    )
