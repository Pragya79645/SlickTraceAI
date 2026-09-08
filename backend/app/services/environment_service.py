"""
Environment Service — provides ocean surface currents and wind vectors for Lagrangian drift modeling.

Resolution order for a (lat, lon, timestamp) query:
1. Explicit disk override  — backend/data/environment/override_*.json  (deterministic demos)
2. Open-Meteo              — Marine API (surface currents) + Forecast/Archive API (10 m wind),
                             free, no key. Every response is cached on disk so a repeat query
                             (or a demo with no network) never re-fetches.
3. Regional prototype grid — calibrated constants for known Indian coastal corridors
4. Generic coastal profile — explicitly labeled fallback

Set SLICKTRACE_OFFLINE=1 to skip the network entirely (cache is still used).

Direction conventions (important for u/v decomposition):
- Ocean currents follow the oceanographic convention: direction the water flows TOWARD.
- Wind follows the meteorological convention: direction the wind blows FROM.
"""

from __future__ import annotations

import json
import math
import os
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

_BASE = Path(__file__).resolve().parents[2]   # …/backend
ENV_DATA_DIR = _BASE / "data" / "environment"
CACHE_DIR = ENV_DATA_DIR / "cache"

OPEN_METEO_MARINE_URL = "https://marine-api.open-meteo.com/v1/marine"
OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
OPEN_METEO_ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"

HTTP_TIMEOUT_S = 6.0          # fail fast on a dead venue network → fallback chain
ARCHIVE_LAG_DAYS = 6          # ERA5 archive lags real time by ~5 days
FORECAST_LOOKBACK_DAYS = 90   # forecast endpoint serves ~3 months of past data
DEFAULT_WIND_FACTOR = 0.03    # canonical 3 % wind-drift factor for surface oil


@dataclass
class EnvironmentalConditions:
    source: str
    current_u_ms: float
    current_v_ms: float
    wind_u_ms: float
    wind_v_ms: float
    wind_factor: float = DEFAULT_WIND_FACTOR
    quality: str = "prototype_regional_vector_field"
    confidence_score: float = 0.85
    notes: Optional[str] = None
    valid_time: Optional[str] = None      # UTC hour the vectors are valid for
    provider_detail: Optional[str] = None  # e.g. "open-meteo marine + era5 archive"


# ─── Prototype Regional Vector Field Grids ─────────────────────────────────────
# Used only when Open-Meteo is unreachable and nothing is cached.

PROTOTYPE_REGIONS = [
    {
        "name": "Arabian Sea / Mumbai Offshore Corridor",
        "lat_min": 18.0, "lat_max": 20.0, "lon_min": 71.5, "lon_max": 73.5,
        "current_u_ms": 0.18, "current_v_ms": 0.08,
        "wind_u_ms": 4.0, "wind_v_ms": 2.0,
        "quality": "calibrated_prototype_grid", "confidence": 0.70,
    },
    {
        "name": "Gulf of Khambhat / North Arabian Sea",
        "lat_min": 20.0, "lat_max": 22.5, "lon_min": 71.0, "lon_max": 73.5,
        "current_u_ms": 0.25, "current_v_ms": 0.12,
        "wind_u_ms": 5.2, "wind_v_ms": 2.8,
        "quality": "regional_hydrodynamic_estimate", "confidence": 0.60,
    },
    {
        "name": "Goa / South Konkan Coastal Waters",
        "lat_min": 15.0, "lat_max": 18.0, "lon_min": 72.5, "lon_max": 74.5,
        "current_u_ms": 0.14, "current_v_ms": 0.06,
        "wind_u_ms": 3.5, "wind_v_ms": 1.5,
        "quality": "regional_hydrodynamic_estimate", "confidence": 0.60,
    },
]


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _parse_timestamp(timestamp: str) -> datetime:
    ts_clean = timestamp.replace("Z", "+00:00")
    dt = datetime.fromisoformat(ts_clean)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _offline() -> bool:
    return os.environ.get("SLICKTRACE_OFFLINE", "").strip().lower() in {"1", "true", "yes"}


def _vector_toward(speed_ms: float, direction_deg: float) -> Tuple[float, float]:
    """u/v components for a flow reported as the direction it moves TOWARD (ocean currents)."""
    rad = math.radians(direction_deg)
    return speed_ms * math.sin(rad), speed_ms * math.cos(rad)


def _vector_from(speed_ms: float, direction_deg: float) -> Tuple[float, float]:
    """u/v components for a flow reported as the direction it comes FROM (meteorological wind)."""
    rad = math.radians(direction_deg)
    return -speed_ms * math.sin(rad), -speed_ms * math.cos(rad)


def _to_ms(value: float, unit: str) -> float:
    """Normalises a speed to m/s based on the unit string Open-Meteo reports."""
    unit = (unit or "").strip().lower()
    if unit in {"m/s", "ms", "mps"}:
        return value
    if unit == "km/h":
        return value / 3.6
    if unit in {"kn", "knots", "kt"}:
        return value * 0.514444
    if unit == "mph":
        return value * 0.44704
    raise ValueError(f"Unrecognised speed unit from provider: {unit!r}")


def _nearest_hour_index(times: List[str], target: datetime) -> int:
    """Index of the hourly slot closest to *target* (times are ISO strings in UTC)."""
    best_i, best_dt = 0, None
    for i, t in enumerate(times):
        dt = datetime.fromisoformat(t).replace(tzinfo=timezone.utc)
        delta = abs((dt - target).total_seconds())
        if best_dt is None or delta < best_dt:
            best_i, best_dt = i, delta
    return best_i


# ─── Open-Meteo HTTP + cache ──────────────────────────────────────────────────

def _http_get_json(url: str, params: Dict[str, Any]) -> Dict[str, Any]:
    query = urllib.parse.urlencode(params, safe=",")
    req = urllib.request.Request(f"{url}?{query}", headers={"User-Agent": "SlickTrace-AI/1.0"})
    with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT_S) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    if payload.get("error"):
        raise RuntimeError(payload.get("reason", "provider returned an error"))
    return payload


def _cache_path(lat: float, lon: float, day: str) -> Path:
    # 0.05° ≈ 5 km grid — comfortably inside a single Open-Meteo model cell
    return CACHE_DIR / f"openmeteo_{round(lat / 0.05) * 0.05:.2f}_{round(lon / 0.05) * 0.05:.2f}_{day}.json"


def _load_cache(path: Path) -> Optional[Dict[str, Any]]:
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def _save_cache(path: Path, payload: Dict[str, Any]) -> None:
    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, indent=1), encoding="utf-8")
    except Exception:
        pass  # a failed cache write must never break a drift run


def _fetch_marine_day(lat: float, lon: float, day: str) -> Dict[str, Any]:
    return _http_get_json(
        OPEN_METEO_MARINE_URL,
        {
            "latitude": f"{lat:.4f}",
            "longitude": f"{lon:.4f}",
            "hourly": "ocean_current_velocity,ocean_current_direction",
            "start_date": day,
            "end_date": day,
            "timezone": "UTC",
        },
    )


def _fetch_wind_day(lat: float, lon: float, day: str, target: datetime) -> Tuple[Dict[str, Any], str]:
    """Pulls 10 m wind for a day, choosing the archive (ERA5) or forecast endpoint by date."""
    params = {
        "latitude": f"{lat:.4f}",
        "longitude": f"{lon:.4f}",
        "hourly": "wind_speed_10m,wind_direction_10m",
        "wind_speed_unit": "ms",
        "start_date": day,
        "end_date": day,
        "timezone": "UTC",
    }
    age_days = (datetime.now(timezone.utc) - target).days
    if age_days > FORECAST_LOOKBACK_DAYS:
        order = [("era5_archive", OPEN_METEO_ARCHIVE_URL)]
    elif age_days > ARCHIVE_LAG_DAYS:
        order = [("era5_archive", OPEN_METEO_ARCHIVE_URL), ("forecast", OPEN_METEO_FORECAST_URL)]
    else:
        order = [("forecast", OPEN_METEO_FORECAST_URL), ("era5_archive", OPEN_METEO_ARCHIVE_URL)]

    last_exc: Optional[Exception] = None
    for label, url in order:
        try:
            return _http_get_json(url, params), label
        except Exception as exc:
            last_exc = exc
    raise RuntimeError(f"wind fetch failed on all endpoints: {last_exc}")


def _get_open_meteo_day(lat: float, lon: float, target: datetime) -> Optional[Dict[str, Any]]:
    """Returns the cached-or-fetched marine + wind hourly payload for the target's UTC day."""
    day = target.strftime("%Y-%m-%d")
    path = _cache_path(lat, lon, day)

    cached = _load_cache(path)
    if cached is not None:
        cached["_from_cache"] = True
        return cached

    if _offline():
        return None

    try:
        marine = _fetch_marine_day(lat, lon, day)
        wind, wind_label = _fetch_wind_day(lat, lon, day, target)
    except (urllib.error.URLError, TimeoutError, RuntimeError, ValueError, OSError):
        return None

    payload = {
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "query": {"latitude": lat, "longitude": lon, "day": day},
        "marine": {"hourly": marine.get("hourly", {}), "hourly_units": marine.get("hourly_units", {})},
        "wind": {
            "endpoint": wind_label,
            "hourly": wind.get("hourly", {}),
            "hourly_units": wind.get("hourly_units", {}),
        },
    }
    _save_cache(path, payload)
    payload["_from_cache"] = False
    return payload


def _resolve_open_meteo(lat: float, lon: float, target: datetime) -> Optional[EnvironmentalConditions]:
    payload = _get_open_meteo_day(lat, lon, target)
    if payload is None:
        return None

    try:
        m_h, m_u = payload["marine"]["hourly"], payload["marine"]["hourly_units"]
        w_h, w_u = payload["wind"]["hourly"], payload["wind"]["hourly_units"]

        mi = _nearest_hour_index(m_h["time"], target)
        wi = _nearest_hour_index(w_h["time"], target)

        cur_speed = m_h["ocean_current_velocity"][mi]
        cur_dir = m_h["ocean_current_direction"][mi]
        wind_speed = w_h["wind_speed_10m"][wi]
        wind_dir = w_h["wind_direction_10m"][wi]

        # Open-Meteo returns null over land / outside model coverage
        if None in (cur_speed, cur_dir, wind_speed, wind_dir):
            return None

        cur_u, cur_v = _vector_toward(_to_ms(float(cur_speed), m_u.get("ocean_current_velocity", "km/h")), float(cur_dir))
        wind_u, wind_v = _vector_from(_to_ms(float(wind_speed), w_u.get("wind_speed_10m", "m/s")), float(wind_dir))
    except (KeyError, IndexError, TypeError, ValueError):
        return None

    wind_endpoint = payload["wind"].get("endpoint", "forecast")
    provider = f"open-meteo marine + {'ERA5 archive' if wind_endpoint == 'era5_archive' else 'forecast'} wind"
    return EnvironmentalConditions(
        source="open_meteo",
        current_u_ms=cur_u,
        current_v_ms=cur_v,
        wind_u_ms=wind_u,
        wind_v_ms=wind_v,
        wind_factor=DEFAULT_WIND_FACTOR,
        quality="reanalysis_model_grid",
        confidence_score=0.90,
        notes=("Served from local cache" if payload.get("_from_cache") else "Fetched live") + f" ({provider})",
        valid_time=m_h["time"][mi] + "Z",
        provider_detail=provider,
    )


# ─── Disk override ────────────────────────────────────────────────────────────

def _check_disk_override(latitude: float, longitude: float) -> Optional[EnvironmentalConditions]:
    """
    An explicit operator override: backend/data/environment/override_*.json with
    {"current": {"u_ms", "v_ms"}, "wind": {"u_ms", "v_ms"}, optional "wind_factor",
     optional "bbox": [lat_min, lon_min, lat_max, lon_max]}.
    Wins over Open-Meteo so a demo can be pinned to deterministic numbers.
    """
    if not ENV_DATA_DIR.exists():
        return None

    for env_file in sorted(ENV_DATA_DIR.glob("override_*.json")):
        try:
            data = json.loads(env_file.read_text(encoding="utf-8"))
            if "current" not in data or "wind" not in data:
                continue
            bbox = data.get("bbox")
            if bbox and not (bbox[0] <= latitude <= bbox[2] and bbox[1] <= longitude <= bbox[3]):
                continue
            return EnvironmentalConditions(
                source=f"override_file:{env_file.name}",
                current_u_ms=float(data["current"]["u_ms"]),
                current_v_ms=float(data["current"]["v_ms"]),
                wind_u_ms=float(data["wind"]["u_ms"]),
                wind_v_ms=float(data["wind"]["v_ms"]),
                wind_factor=float(data.get("wind_factor", DEFAULT_WIND_FACTOR)),
                quality="operator_override",
                confidence_score=1.0,
                notes=data.get("notes", "Operator-supplied vector field"),
            )
        except Exception:
            continue
    return None


# ─── Public API ───────────────────────────────────────────────────────────────

def get_environment(
    latitude: float,
    longitude: float,
    timestamp: str,
) -> EnvironmentalConditions:
    """
    Returns ocean surface current and wind vector fields for the specified
    spatio-temporal coordinates, walking the resolution chain documented at module top.

    Raises ValueError if coordinates are outside valid geographic ranges (-90 to 90, -180 to 180)
    or if timestamp format is invalid.
    """
    if not (-90.0 <= latitude <= 90.0):
        raise ValueError(f"Latitude must be between -90.0 and 90.0, got {latitude}")
    if not (-180.0 <= longitude <= 180.0):
        raise ValueError(f"Longitude must be between -180.0 and 180.0, got {longitude}")

    try:
        target = _parse_timestamp(timestamp)
    except Exception as exc:
        raise ValueError(f"Invalid ISO timestamp '{timestamp}'. Expected format YYYY-MM-DDTHH:MM:SS: {exc}") from exc

    # 1. Operator override
    override = _check_disk_override(latitude, longitude)
    if override:
        return override

    # 2. Open-Meteo (cache → network)
    live = _resolve_open_meteo(latitude, longitude, target)
    if live:
        return live

    # 3. Regional prototype grids
    for region in PROTOTYPE_REGIONS:
        if region["lat_min"] <= latitude <= region["lat_max"] and region["lon_min"] <= longitude <= region["lon_max"]:
            return EnvironmentalConditions(
                source="prototype_local_vector_field",
                current_u_ms=region["current_u_ms"],
                current_v_ms=region["current_v_ms"],
                wind_u_ms=region["wind_u_ms"],
                wind_v_ms=region["wind_v_ms"],
                wind_factor=DEFAULT_WIND_FACTOR,
                quality=region["quality"],
                confidence_score=region["confidence"],
                notes=f"Open-Meteo unavailable; regional fallback from {region['name']}",
            )

    # 4. Generic coastal profile
    return EnvironmentalConditions(
        source="prototype_local_vector_field",
        current_u_ms=0.18,
        current_v_ms=0.08,
        wind_u_ms=4.0,
        wind_v_ms=2.0,
        wind_factor=DEFAULT_WIND_FACTOR,
        quality="prototype_default_coastal_profile",
        confidence_score=0.50,
        notes="Open-Meteo unavailable; generic coastal profile applied (outside calibrated regional grids)",
    )
