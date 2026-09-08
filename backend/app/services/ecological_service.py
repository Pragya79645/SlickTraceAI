"""
National Ecological GIS Spatial Exposure Service (Phase 5E — Part 3)

Integrates authoritative MoEFCC / Bharatmaps Ramsar wetland GIS polygons
(backend/data/environment/ramsar_sites_india.geojson) with 2D Lagrangian oil drift trajectories.

Calculates:
- Precise geometric intersection (trajectory LineString vs Ramsar MultiPolygon)
- Geodesic minimum distance (in kilometers, using Haversine projection)
- First contact timestep (estimated_time_to_impact_hours)
- Screening threat categories: DIRECT_THREAT, NEAR_THREAT, LOW_EXPOSURE, NO_SIGNIFICANT_EXPOSURE
- Generic operation across all 99 Ramsar GIS features in India (zero hardcoding)
"""

from __future__ import annotations

import json
import math
import re
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import shapely.geometry
import shapely.ops

from app.schemas.investigation import (
    EcologicalExposureResponse,
    GeoTimestep,
    RamsarThreatSite,
)

_BASE = Path(__file__).resolve().parents[2]   # …/backend
DEFAULT_GEOJSON_PATH = _BASE / "data" / "environment" / "ramsar_sites_india.geojson"
DEFAULT_REGISTRY_PATH = _BASE / "data" / "environment" / "ramsar_sites_india.json"


# ─── Geodesic Haversine Distance ──────────────────────────────────────────────

def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculates the great-circle distance between two GPS coordinates in kilometers."""
    R = 6371.0  # Earth's radius in km
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)

    a = (
        math.sin(dphi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c


# ─── Name Normalizer for Registry Matching ─────────────────────────────────────

def _normalize_name(name: str) -> str:
    n = name.lower()
    n = re.sub(r"[\(\),-]", " ", n)
    n = re.sub(
        r"\b(wetland|bird sanctuary|wildlife sanctuary|national park|lake|reservoir|gorge|reserve|complex|mangroves?|marsh)\b",
        "",
        n,
    )
    return " ".join(n.split())


# ─── Data Loaders ─────────────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def load_ramsar_geojson(geojson_path: Optional[Path] = None) -> Dict[str, Any]:
    """Loads and validates the authoritative Ramsar GeoJSON file."""
    path = geojson_path or DEFAULT_GEOJSON_PATH
    if not path.is_file():
        raise FileNotFoundError(f"Ramsar GeoJSON not found at: {path}")

    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    if data.get("type") != "FeatureCollection" or "features" not in data:
        raise ValueError("Invalid GeoJSON: must be a FeatureCollection")

    return data


@lru_cache(maxsize=1)
def load_registry_lookup(registry_path: Optional[Path] = None) -> Dict[str, Dict[str, Any]]:
    """Builds a normalized lookup dictionary from the official MoEFCC Ramsar registry."""
    path = registry_path or DEFAULT_REGISTRY_PATH
    if not path.is_file():
        return {}

    with open(path, "r", encoding="utf-8") as f:
        registry = json.load(f)

    lookup: Dict[str, Dict[str, Any]] = {}
    for item in registry:
        name = item.get("name", "")
        norm = _normalize_name(name)
        lookup[norm] = item
        lookup[name.lower()] = item
    return lookup


# ─── Core Spatial Exposure Calculation ────────────────────────────────────────

def assess_trajectory_exposure(
    forecast_trajectory: List[GeoTimestep],
    geojson_path: Optional[Path] = None,
    registry_path: Optional[Path] = None,
    max_return_count: int = 15,
) -> EcologicalExposureResponse:
    """
    Evaluates potential exposure of all Ramsar wetland polygons to a forecast trajectory.
    Operates generically across India without hardcoded site rules.
    """
    geojson_data = load_ramsar_geojson(geojson_path)
    reg_lookup = load_registry_lookup(registry_path)

    features = geojson_data.get("features", [])
    if not features:
        return EcologicalExposureResponse(
            sites_analyzed=0,
            threats=[],
            nearest_site=None,
            direct_threats_count=0,
            near_threats_count=0,
            response_priority="LOW",
        )

    if not forecast_trajectory:
        return EcologicalExposureResponse(
            sites_analyzed=len(features),
            threats=[],
            nearest_site=None,
            direct_threats_count=0,
            near_threats_count=0,
            response_priority="LOW",
        )

    # Validate coordinate bounds
    for pt in forecast_trajectory:
        if not (-90.0 <= pt.lat <= 90.0 and -180.0 <= pt.lon <= 180.0):
            raise ValueError(f"Invalid coordinate in forecast trajectory: lat={pt.lat}, lon={pt.lon}")

    # Build trajectory LineString and points
    pts = [(step.lon, step.lat) for step in forecast_trajectory]
    if len(pts) >= 2:
        trajectory_geom = shapely.geometry.LineString(pts)
    else:
        trajectory_geom = shapely.geometry.Point(pts[0])

    threat_sites: List[RamsarThreatSite] = []

    for feat in features:
        props = feat.get("properties", {})
        raw_geom = feat.get("geometry", {})
        try:
            poly_geom = shapely.geometry.shape(raw_geom)
            if not poly_geom.is_valid:
                poly_geom = shapely.make_valid(poly_geom)
        except Exception:
            continue

        site_name = props.get("name", "Unnamed Ramsar Wetland")
        state = props.get("state", "India")
        
        # Match metadata from registry
        norm_name = _normalize_name(site_name)
        reg_info = reg_lookup.get(norm_name) or reg_lookup.get(site_name.lower()) or {}

        # Centroid coordinates
        centroid = poly_geom.centroid
        c_lat = float(centroid.y)
        c_lon = float(centroid.x)

        # 1. Intersection & Geodesic Distance
        intersects = bool(trajectory_geom.intersects(poly_geom))
        
        if intersects:
            min_dist_km = 0.0
        else:
            # Nearest points in geographic coordinates
            p_traj, p_poly = shapely.ops.nearest_points(trajectory_geom, poly_geom)
            min_dist_km = haversine_km(p_traj.y, p_traj.x, p_poly.y, p_poly.x)

        # 2. Check if observation location (t=0h) is already inside or touching polygon
        t0_step = forecast_trajectory[0]
        t0_pt = shapely.geometry.Point(t0_step.lon, t0_step.lat)
        t0_inside = bool(poly_geom.contains(t0_pt) or poly_geom.distance(t0_pt) < 1e-7)

        # 3. Categorize Exposure Basis, Threat Level, and Time to Impact
        impact_time: Optional[float] = None

        if intersects:
            threat_level = "DIRECT_THREAT"
            if t0_inside:
                exposure_basis = "CURRENT_OBSERVATION"
                impact_time = 0.0
                reason = (
                    f"Observed spill location (t=0h) already overlaps or directly intersects official "
                    f"{site_name} polygon boundary. Drift forecast tracks continued transit through protected area."
                )
            else:
                exposure_basis = "FORECAST_INTERSECTION"
                # Search earliest t > 0 timestep entering polygon
                future_impact_time: Optional[float] = None
                for step in forecast_trajectory[1:]:
                    pt_geom = shapely.geometry.Point(step.lon, step.lat)
                    if poly_geom.contains(pt_geom) or poly_geom.distance(pt_geom) < 1e-7:
                        future_impact_time = float(step.hours_after_observation if step.hours_after_observation is not None else 0.0)
                        break

                # If inside intermediate forecast segment
                if future_impact_time is None and len(forecast_trajectory) >= 2:
                    for i in range(len(forecast_trajectory) - 1):
                        s1 = forecast_trajectory[i]
                        s2 = forecast_trajectory[i + 1]
                        seg = shapely.geometry.LineString([(s1.lon, s1.lat), (s2.lon, s2.lat)])
                        if seg.intersects(poly_geom):
                            future_impact_time = float(s2.hours_after_observation if s2.hours_after_observation is not None else 0.0)
                            break

                impact_time = future_impact_time
                t_str = f"+{impact_time:.1f}h" if impact_time is not None else "future forecast window"
                reason = (
                    f"Predicted hydrodynamic forecast trajectory enters official {site_name} polygon boundary. "
                    f"Estimated first contact at {t_str}."
                )
        elif min_dist_km <= 30.0:
            exposure_basis = "PROXIMITY_ONLY"
            impact_time = None
            if min_dist_km <= 10.0:
                threat_level = "NEAR_THREAT"
                reason = (
                    f"Predicted trajectory passes within {min_dist_km:.1f} km of {site_name} boundary "
                    f"(within 10 km prototype screening corridor) without intersecting the surveyed polygon."
                )
            else:
                threat_level = "LOW_EXPOSURE"
                reason = (
                    f"Predicted trajectory is {min_dist_km:.1f} km from {site_name} boundary "
                    f"(within 30 km regional monitoring corridor)."
                )
        else:
            exposure_basis = "NO_EXPOSURE"
            threat_level = "NO_SIGNIFICANT_EXPOSURE"
            impact_time = None
            reason = f"Ramsar site is remote from predicted trajectory ({min_dist_km:.1f} km away)."

        threat_sites.append(
            RamsarThreatSite(
                site_name=site_name,
                state=state,
                threat_level=threat_level,
                exposure_basis=exposure_basis,
                minimum_distance_km=round(min_dist_km, 2),
                estimated_time_to_impact_hours=impact_time,
                intersection=intersects,
                area_hectares=reg_info.get("area_hectares") or props.get("st_area_sh"),
                wetland_type=reg_info.get("wetland_type"),
                status=reg_info.get("status"),
                source_url=reg_info.get("source_url"),
                geometry_type=poly_geom.geom_type,
                centroid_lat=round(c_lat, 5),
                centroid_lon=round(c_lon, 5),
                reason=reason,
            )
        )

    # Sort all sites by minimum distance ascending
    threat_sites.sort(key=lambda s: s.minimum_distance_km)

    direct_count = sum(1 for s in threat_sites if s.threat_level == "DIRECT_THREAT")
    near_count = sum(1 for s in threat_sites if s.threat_level == "NEAR_THREAT")

    if direct_count > 0:
        response_priority = "CRITICAL_ACTION"
    elif near_count > 0:
        response_priority = "HIGH_PRIORITY"
    elif any(s.threat_level == "LOW_EXPOSURE" for s in threat_sites):
        response_priority = "MONITORING"
    else:
        response_priority = "LOW"

    nearest = threat_sites[0] if threat_sites else None

    return EcologicalExposureResponse(
        sites_analyzed=len(features),
        threats=threat_sites[:max_return_count],
        nearest_site=nearest,
        direct_threats_count=direct_count,
        near_threats_count=near_count,
        response_priority=response_priority,
    )
