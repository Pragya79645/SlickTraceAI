"""
Investigation Service — loads SPILL-001 demo artifacts and SPILL-TEST-002 validation scenario from disk.

Reads the ACTUAL saved Phase 1–3 JSON files and AIS CSV datasets.
Does NOT fabricate or mock values.
"""

from __future__ import annotations

import csv
import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict

from app.schemas.investigation import (
    AISSummary,
    DriftAnalysis,
    InvestigationResponse,
    SpillDetection,
    VesselAttribution,
)

# ─── Paths ────────────────────────────────────────────────────────────────────

_BASE = Path(__file__).resolve().parents[2]   # …/backend
DEMO_DIR = _BASE / "data" / "demo"

_PHASE1_FILE = DEMO_DIR / "spill_characterization_SPILL-001.json"
_PHASE2_FILE = DEMO_DIR / "phase2_hindcast_forecast_SPILL-001.json"
_PHASE3_FILE = DEMO_DIR / "phase3_vessel_attribution_SPILL-001.json"
_AIS_FILE_001 = DEMO_DIR / "ais_demo_dataset.csv"
_AIS_FILE_002 = DEMO_DIR / "ais_test_scenario_002.csv"
_AIS_FILE_003 = DEMO_DIR / "ais_test_scenario_003.csv"


# ─── Loaders ──────────────────────────────────────────────────────────────────

@lru_cache(maxsize=4)
def _load_json(path: Path) -> Dict[str, Any]:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=4)
def _load_ais_summary(csv_path: Path) -> AISSummary:
    with open(csv_path, encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    vessel_names = sorted({r["vessel_name"] for r in rows})
    return AISSummary(
        total_records=len(rows),
        unique_vessels=len(vessel_names),
        columns=list(rows[0].keys()) if rows else [],
        vessel_names=vessel_names,
    )


@lru_cache(maxsize=1)
def _cached_ensemble(lat: float, lon: float, timestamp: str, cu: float, cv: float, wu: float, wv: float, wf: float):
    """
    The demo artifact stores a deterministic trajectory only. Build the Monte Carlo
    ensemble around the *same* saved forcing so the bands stay consistent with the
    saved origin — this must not re-resolve the environment, which could differ.
    """
    from datetime import datetime, timezone
    from app.services.drift_service import compute_ensemble
    from app.services.environment_service import EnvironmentalConditions

    obs_dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    if obs_dt.tzinfo is None:
        obs_dt = obs_dt.replace(tzinfo=timezone.utc)
    env = EnvironmentalConditions(
        source="saved_artifact", current_u_ms=cu, current_v_ms=cv, wind_u_ms=wu, wind_v_ms=wv, wind_factor=wf
    )
    return compute_ensemble(lat, lon, obs_dt, env)


def _attach_ensemble(drift: DriftAnalysis) -> DriftAnalysis:
    if drift.ensemble is not None:
        return drift
    o, e = drift.observation, drift.environment
    ensemble = _cached_ensemble(
        o.latitude, o.longitude, o.timestamp,
        e.current.u_ms, e.current.v_ms, e.wind.u_ms, e.wind.v_ms, e.wind_factor,
    )
    return drift.model_copy(update={"ensemble": ensemble})


# ─── Scenario registry ────────────────────────────────────────────────────────
# All scenarios deliberately share the same Phase 1 detection and Phase 2 drift
# artifacts: the TEST scenarios are *controlled attribution validations*, holding the
# observed slick and reconstructed origin fixed while substituting a different AIS
# traffic picture. That isolates the Phase 3 scorer as the only variable. Every test
# CSV is built around the SPILL-001 hindcast origin
# (19.043471 N, 72.907286 E @ 2026-08-28T15:02:13Z).
#
# SPILL-TEST-002 — MV WESTERN PEARL transits the origin corridor at the origin time
#                  with a ~80 % speed reduction, against six decoys.
# SPILL-TEST-003 — "dark vessel": MT JALDHARA never reports near the origin. Its only
#                  signature is a 3 h transponder silence spanning the discharge time
#                  whose interpolated path crosses the origin. MV GODAVARI STAR is the
#                  decoy — continuous AIS, 3.5 km from the origin at the right time —
#                  and MT NARMADA SPIRIT has a gap that does *not* span the discharge.

SCENARIOS: Dict[str, Dict[str, Any]] = {
    "SPILL-001": {
        "ais_csv": _AIS_FILE_001,
        "description": "Reference baseline investigation",
    },
    "SPILL-TEST-002": {
        "ais_csv": _AIS_FILE_002,
        "description": "Controlled multi-vessel attribution validation (shares SPILL-001 detection/drift)",
    },
    "SPILL-TEST-003": {
        "ais_csv": _AIS_FILE_003,
        "description": "Dark-vessel validation: culprit identifiable only via AIS silence spanning the discharge time",
    },
}

KNOWN_IDS = frozenset(SCENARIOS)


# ─── Public API ───────────────────────────────────────────────────────────────

def get_investigation(spill_id: str) -> InvestigationResponse:
    """
    Return the unified investigation object for *spill_id*.
    Raises ValueError for unknown IDs.
    """
    scenario = SCENARIOS.get(spill_id)
    if scenario is None:
        raise ValueError(
            f"Unknown spill_id: {spill_id!r}. Known scenarios: {', '.join(sorted(KNOWN_IDS))}"
        )

    from app.services.volume_service import estimate_bonn_volume

    p1 = _load_json(_PHASE1_FILE)
    p2 = _load_json(_PHASE2_FILE)
    detection = SpillDetection(**p1)
    if detection.bonn_volume is None:
        detection = detection.model_copy(update={"bonn_volume": estimate_bonn_volume(detection.area.km2)})
    drift = _attach_ensemble(DriftAnalysis(**p2))

    from app.services.ais_service import correlate_vessels
    from app.services.ecology_service import assess_ecological_threat
    from app.services.ecological_service import assess_trajectory_exposure

    ais_csv: Path = scenario["ais_csv"]
    origin = drift.hindcast.estimated_origin

    attribution = correlate_vessels(
        spill_id=spill_id,
        origin_lat=origin.lat,
        origin_lon=origin.lon,
        origin_timestamp=origin.timestamp,
        csv_path=ais_csv,
        origin_ellipses=drift.ensemble.hindcast_steps[-1].ellipses if drift.ensemble else None,
    )
    ais = _load_ais_summary(ais_csv)

    ecology = assess_ecological_threat(drift.forecast.trajectory)
    ecological_exposure = assess_trajectory_exposure(drift.forecast.trajectory)

    return InvestigationResponse(
        spill_id=spill_id,
        detection=detection,
        drift=drift,
        attribution=attribution,
        ais_summary=ais,
        ecology=ecology,
        ecological_exposure=ecological_exposure,
    )
