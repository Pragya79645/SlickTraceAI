"""
Inference Service — runs real YOLOv8 segmentation on uploaded SAR/EO imagery.

Uses the trained model at: backend/models/oilspill_yolov8_seg_best.pt
Extracts real segmentation masks, polygon contours, confidence scores,
and geometric characterization (area, perimeter, elongation, age estimate).
Tracks pipeline readiness and prerequisite requirements for Phase 2/3.
"""

from __future__ import annotations

import base64
import json
import math
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

import cv2
import numpy as np
from ultralytics import YOLO

from app.schemas.investigation import (
    AgeEstimate,
    AnalysisResponse,
    Centroid,
    DriftAnalysis,
    EcologicalAssessment,
    EcologicalExposureResponse,
    ImageDimensions,
    PipelineStageInfo,
    SceneGeoreference,
    SpillArea,
    SpillDetection,
    SpillPerimeter,
    VesselAttribution,
)
from app.services.georef_service import (
    SceneGeoreference as _RasterGeoref,
    decode_geotiff,
    is_geotiff_name,
    pixels_to_lonlat,
)
from app.services.volume_service import estimate_bonn_volume

PREVIEW_MAX_SIDE = 1024
PREVIEW_JPEG_QUALITY = 82

# Tiled inference — the model was trained on 256-px crops, so a whole satellite scene
# is sliced into overlapping windows near that scale and the masks are merged.
TILE_SIZE = 256                   # = training crop size, so a slick fills a tile the way it did in training
TILE_OVERLAP = 64
SINGLE_PASS_MAX_SIDE = 512        # frames up to this size are inferred in one pass
MIN_MASK_AREA_PX = 40             # drop merged fragments smaller than this
TILE_BATCH = 16
TILE_CONF_FLOOR = 0.30            # whole-scene tiles see far more open water: raise the bar
MAX_TILE_FILL = 0.85              # a mask covering ≥ this fraction of its tile is "the tile", not a slick
# Physical gate for whole scenes: oil damps capillary waves, so a real slick is darker
# than the water around it. Merged instances that fail this are texture, not oil.
MIN_DAMPING_DB = 2.0              # real slicks damp 3–10 dB; ~1 dB is clutter variation
RING_WIDTH_PX = 24

# ─── Paths ────────────────────────────────────────────────────────────────────

_BASE = Path(__file__).resolve().parents[2]   # …/backend
MODEL_PATH = _BASE / "models" / "oilspill_yolov8_seg_best.pt"
UPLOADS_DIR = _BASE / "uploads"
LIVE_STORE_FILE = UPLOADS_DIR / "live_investigations.json"

# Cap on persisted live investigations (oldest evicted first). The whole store is
# rewritten on every upload, and a full-chain anchored record runs ~150 KB (99-site
# Ramsar exposure + AIS tracks), so keep this modest.
MAX_LIVE_RECORDS = 25

_MODEL_INSTANCE: Optional[YOLO] = None
_LIVE_CACHE: Dict[str, AnalysisResponse] = {}


def get_yolo_model() -> YOLO:
    """Lazy-loads and caches the YOLOv8 segmentation model in memory."""
    global _MODEL_INSTANCE
    if _MODEL_INSTANCE is None:
        if not MODEL_PATH.exists():
            raise FileNotFoundError(f"Trained YOLO model not found at: {MODEL_PATH}")
        _MODEL_INSTANCE = YOLO(str(MODEL_PATH))
    return _MODEL_INSTANCE


# ─── Live Investigation Storage ───────────────────────────────────────────────

def _persist_live_investigation(record: AnalysisResponse) -> None:
    """
    Persists live investigation records in-memory and to disk.

    The disk store is capped at MAX_LIVE_RECORDS (oldest evicted first, by insertion
    order) so repeated uploads cannot grow the file without bound.
    """
    _LIVE_CACHE[record.spill_id] = record
    try:
        UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
        # Load existing disk store if any
        data: Dict[str, Any] = {}
        if LIVE_STORE_FILE.exists():
            try:
                with open(LIVE_STORE_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if not isinstance(data, dict):
                    data = {}
            except Exception:
                data = {}

        data.pop(record.spill_id, None)          # re-insert so it counts as newest
        # The raw preview is transient UI payload; the mask overlay is kept so a live case
        # can show its own detection in the story dashboard.
        data[record.spill_id] = record.model_dump(exclude={"preview_image"})

        while len(data) > MAX_LIVE_RECORDS:
            oldest = next(iter(data))
            data.pop(oldest)
            _LIVE_CACHE.pop(oldest, None)

        with open(LIVE_STORE_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    except Exception as exc:
        print(f"Warning: could not persist live investigation to disk: {exc}")


LIVE_PREFIX = "SPILL-LIVE-"


def is_live_id(spill_id: Optional[str]) -> bool:
    return bool(spill_id) and str(spill_id).startswith(LIVE_PREFIX)


def attach_live_results(spill_id: str, **fields: Any) -> Optional[AnalysisResponse]:
    """
    Merges downstream results (drift, attribution, ecology, ecological_exposure) that were
    produced by the step-wise endpoints onto the persisted live record, and rebuilds the
    stage statuses so the record stays truthful. Returns None for unknown ids.
    """
    rec = get_live_investigation(spill_id)
    if rec is None:
        return None

    updates = {k: v for k, v in fields.items() if v is not None}
    if not updates:
        return rec
    merged = rec.model_copy(update=updates)

    stages = _build_stages(
        detections=merged.all_detections,
        primary_detection=merged.detection,
        drift=merged.drift,
        attribution=merged.attribution,
        chain_error=merged.chain_error,
    )
    merged = merged.model_copy(
        update={
            "stages": stages,
            "has_drift_and_attribution": merged.drift is not None and merged.attribution is not None,
            "phase2_status": "complete" if merged.drift is not None else merged.phase2_status,
            "phase3_status": "complete" if merged.attribution is not None else merged.phase3_status,
        }
    )
    _persist_live_investigation(merged)
    return merged


def get_live_investigation(spill_id: str) -> Optional[AnalysisResponse]:
    """Retrieves a persisted live investigation by ID."""
    if spill_id in _LIVE_CACHE:
        return _LIVE_CACHE[spill_id]
    if LIVE_STORE_FILE.exists():
        try:
            with open(LIVE_STORE_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                if spill_id in data:
                    res = AnalysisResponse(**data[spill_id])
                    _LIVE_CACHE[spill_id] = res
                    return res
        except Exception:
            pass
    return None


# ─── Live telemetry ───────────────────────────────────────────────────────────

class Telemetry:
    """
    Emits real pipeline milestones as they happen, with wall-clock timings measured
    server-side. Every value reported here is read back off the object the stage just
    produced — nothing is scripted or padded. With no sink attached it is a no-op, so
    the non-streaming code path is unaffected.
    """

    def __init__(self, sink: Optional[Callable[[Dict[str, Any]], None]] = None) -> None:
        self._sink = sink
        self._t0 = time.perf_counter()

    @property
    def elapsed_ms(self) -> float:
        return round((time.perf_counter() - self._t0) * 1000.0, 1)

    def stage(self, key: str, label: str, message: str, **extra: Any) -> None:
        if self._sink is None:
            return
        self._sink(
            {
                "type": "stage",
                "key": key,
                "label": label,
                "message": message,
                "elapsed_ms": self.elapsed_ms,
                **extra,
            }
        )


# ─── Downstream Chain (Phases 2–4) ────────────────────────────────────────────

def _run_downstream_chain(
    spill_id: str,
    latitude: float,
    longitude: float,
    timestamp: str,
    coordinate_source: str,
    tel: Optional[Telemetry] = None,
) -> Tuple[DriftAnalysis, VesselAttribution, EcologicalAssessment, EcologicalExposureResponse]:
    """
    Runs Phase 2 (drift) → Phase 3 (AIS attribution) → Phase 4 (ecological screening)
    for an anchored scene. Imported lazily to keep module import cost on the YOLO path.

    AIS correlation runs against the bundled demo telemetry dataset — the same source
    the standalone POST /ais endpoint uses.
    """
    from app.services.ais_service import correlate_vessels
    from app.services.drift_service import compute_drift
    from app.services.ecological_service import assess_trajectory_exposure
    from app.services.ecology_service import assess_ecological_threat

    tel = tel or Telemetry()

    drift = compute_drift(
        spill_id=spill_id,
        latitude=latitude,
        longitude=longitude,
        timestamp=timestamp,
        coordinate_source=coordinate_source,
    )

    env = drift.environment
    tel.stage(
        "environment",
        "OCEAN FORCING",
        f"{env.provider_detail or env.source}: current u={env.current.u_ms:+.3f} v={env.current.v_ms:+.3f} m/s, "
        f"wind u={env.wind.u_ms:+.2f} v={env.wind.v_ms:+.2f} m/s"
        + (f", valid {env.valid_time[:16].replace('T', ' ')}Z" if env.valid_time else ""),
        detail=env.quality,
    )

    origin = drift.hindcast.estimated_origin
    ens = drift.ensemble
    band80 = (
        next((e for e in ens.hindcast_steps[-1].ellipses if e.confidence == 0.80), None) if ens else None
    )
    tel.stage(
        "drift",
        "LAGRANGIAN DRIFT",
        f"{ens.n_particles if ens else 0}-particle ensemble advected back "
        f"{drift.hindcast.duration_hours} h → origin {origin.lat:.5f}°N {origin.lon:.5f}°E"
        + (f" · 80% band {band80.area_km2} km²" if band80 else ""),
        detail=drift.method.formula,
    )

    attribution = correlate_vessels(
        spill_id=spill_id,
        origin_lat=origin.lat,
        origin_lon=origin.lon,
        origin_timestamp=origin.timestamp,
        origin_ellipses=ens.hindcast_steps[-1].ellipses if ens else None,
    )

    top = attribution.candidate_vessels[0] if attribution.candidate_vessels else None
    dark = sum(1 for c in attribution.candidate_vessels if c.went_dark)
    tel.stage(
        "ais",
        "AIS ATTRIBUTION",
        f"{len(attribution.candidate_vessels)} vessel track(s) scored on the 4-factor matrix"
        + (f" · {dark} with transponder silence spanning the discharge window" if dark else ""),
        detail=f"weights {attribution.method.proximity_weight}/{attribution.method.temporal_weight}/"
        f"{attribution.method.trajectory_weight}/{attribution.method.behavioral_weight}",
    )

    ecology = assess_ecological_threat(drift.forecast.trajectory)
    exposure = assess_trajectory_exposure(drift.forecast.trajectory)
    tel.stage(
        "ecology",
        "ECOLOGICAL SCREEN",
        f"{exposure.sites_analyzed} Ramsar polygons intersected · "
        f"{exposure.direct_threats_count} direct / {exposure.near_threats_count} near threat"
        + (
            f" · nearest {exposure.nearest_site.site_name} at {exposure.nearest_site.minimum_distance_km} km"
            if exposure.nearest_site
            else ""
        ),
        detail=f"response priority {exposure.response_priority}",
    )

    if top is not None:
        tel.stage(
            "suspect",
            "PRIMARY SUSPECT",
            f"{top.vessel_name} · MMSI {top.vessel_id}"
            + (f" · {top.flag}" if top.flag else "")
            + f" · score {top.score}/100 ({top.risk} risk)",
            detail=top.reasons[0] if top.reasons else None,
        )

    return drift, attribution, ecology, exposure


def _build_stages(
    detections: List[SpillDetection],
    primary_detection: Optional[SpillDetection],
    drift: Optional[DriftAnalysis],
    attribution: Optional[VesselAttribution],
    chain_error: Optional[str],
) -> List[PipelineStageInfo]:
    """Builds the five pipeline stages, reflecting which phases actually completed."""

    # ① Detection
    detection_stage = PipelineStageInfo(
        stage_key="detection",
        title="Satellite Detection",
        status="complete" if detections else "failed",
        status_label="✓ COMPLETE" if detections else "✕ NO SPILL DETECTED",
        summary=(
            f"YOLOv8 instance segmentation identified {len(detections)} slick region(s) "
            f"with peak confidence {(primary_detection.confidence * 100):.1f}%."
            if primary_detection
            else "YOLOv8 segmentation evaluated the scene: no oil spill signature detected above confidence threshold."
        ),
        prerequisites=["Input SAR/EO image"],
        missing_prerequisites=[],
    )

    # ② Characterisation
    characterisation_stage = PipelineStageInfo(
        stage_key="characterisation",
        title="Slick Characterisation",
        status="complete" if detections else "waiting",
        status_label="✓ COMPLETE" if detections else "○ WAITING",
        summary=(
            f"Extracted geometric metrics: {primary_detection.area.km2:.4f} km² area, "
            f"{primary_detection.perimeter.km:.2f} km perimeter, "
            f"elongation {primary_detection.elongation_ratio}, "
            f"age estimate '{primary_detection.age_estimate.category.upper()}'."
            if primary_detection
            else "Awaiting valid slick polygon segmentation."
        ),
        prerequisites=["Segmentation mask polygons"],
        missing_prerequisites=[],
    )

    # ③ Origin reconstruction (Phase 2)
    phase2_reqs = [
        "Geographic scene anchor (latitude, longitude)",
        "Observation timestamp (UTC)",
        "Ocean surface current vector field (u, v)",
        "Ocean surface wind vector field (u, v)",
    ]
    if drift is not None:
        origin = drift.hindcast.estimated_origin
        origin_stage = PipelineStageInfo(
            stage_key="origin_reconstruction",
            title="Origin Reconstruction (Phase 2)",
            status="complete",
            status_label="✓ ORIGIN RECONSTRUCTED",
            summary=(
                f"Estimated origin ({origin.lat:.4f}°, {origin.lon:.4f}°) at "
                f"{origin.hours_before_observation}h before observation, via "
                f"{drift.method.type} using {drift.environment.source}."
            ),
            prerequisites=phase2_reqs,
            missing_prerequisites=[],
        )
    elif chain_error:
        origin_stage = PipelineStageInfo(
            stage_key="origin_reconstruction",
            title="Origin Reconstruction (Phase 2)",
            status="failed",
            status_label="✕ RECONSTRUCTION FAILED",
            summary=f"Drift reconstruction could not be completed: {chain_error}",
            prerequisites=phase2_reqs,
            missing_prerequisites=[],
        )
    else:
        origin_stage = PipelineStageInfo(
            stage_key="origin_reconstruction",
            title="Origin Reconstruction (Phase 2)",
            status="inputs_required" if detections else "waiting",
            status_label="⚠ INPUT REQUIRED" if detections else "○ WAITING",
            summary=(
                "Origin reconstruction requires a verified geographic scene anchor (latitude/longitude), "
                "observation time, and local ocean current and surface wind velocity vector fields."
            ),
            prerequisites=phase2_reqs,
            missing_prerequisites=[
                "Geographic scene anchor (latitude, longitude)",
                "Ocean surface current vector field (u, v)",
                "Ocean surface wind vector field (u, v)",
            ],
        )

    # ④ AIS correlation (Phase 3)
    phase3_reqs = [
        "Phase 2 reconstructed spill origin corridor",
        "Spatio-temporal AIS vessel telemetry records",
        "4-factor attribution weighting matrix",
    ]
    if attribution is not None:
        ais_stage = PipelineStageInfo(
            stage_key="ais_correlation",
            title="AIS Traffic Correlation (Phase 3)",
            status="complete",
            status_label="✓ AIS CORRELATED",
            summary=(
                f"Correlated AIS telemetry across {len(attribution.candidate_vessels)} vessel track(s) "
                "within the origin corridor search radius."
            ),
            prerequisites=phase3_reqs,
            missing_prerequisites=[],
        )
    else:
        ais_stage = PipelineStageInfo(
            stage_key="ais_correlation",
            title="AIS Traffic Correlation (Phase 3)",
            status="waiting",
            status_label="○ WAITING FOR ORIGIN",
            summary=(
                "Vessel attribution requires the reconstructed origin corridor from Phase 2 to query and "
                "correlate vessel tracks within the candidate spatio-temporal window."
            ),
            prerequisites=phase3_reqs,
            missing_prerequisites=[
                "Phase 2 reconstructed spill origin corridor",
                "Co-located AIS vessel telemetry",
            ],
        )

    # ⑤ Vessel attribution & ranking
    attribution_reqs = ["Correlated candidate vessel tracks", "4-factor attribution weights"]
    top = attribution.candidate_vessels[0] if attribution and attribution.candidate_vessels else None
    if top is not None:
        attribution_stage = PipelineStageInfo(
            stage_key="vessel_attribution",
            title="Vessel Attribution & Ranking",
            status="complete",
            status_label="✓ ATTRIBUTED",
            summary=(
                f"Top candidate {top.vessel_name} ({top.vessel_id}) scored {top.score}/100 — {top.risk} risk, "
                f"closest approach {top.min_distance_km} km at Δt {top.time_difference_hours} h."
            ),
            prerequisites=attribution_reqs,
            missing_prerequisites=[],
        )
    elif attribution is not None:
        attribution_stage = PipelineStageInfo(
            stage_key="vessel_attribution",
            title="Vessel Attribution & Ranking",
            status="failed",
            status_label="✕ NO CANDIDATES",
            summary="No vessel tracks fell within the origin corridor search radius; attribution is inconclusive.",
            prerequisites=attribution_reqs,
            missing_prerequisites=[],
        )
    else:
        attribution_stage = PipelineStageInfo(
            stage_key="vessel_attribution",
            title="Vessel Attribution & Ranking",
            status="waiting",
            status_label="○ WAITING FOR AIS CORRELATION",
            summary=(
                "Attribution scoring evaluates proximity, temporal overlap, track corridor, "
                "and speed reduction for candidate vessels."
            ),
            prerequisites=attribution_reqs,
            missing_prerequisites=["Correlated candidate vessel tracks"],
        )

    return [detection_stage, characterisation_stage, origin_stage, ais_stage, attribution_stage]


# ─── Segmentation (single-pass or tiled) ──────────────────────────────────────

def _rasterise_result(
    result,
    mask: np.ndarray,
    conf_map: np.ndarray,
    ox: int,
    oy: int,
    gray_tile: Optional[np.ndarray] = None,
) -> Tuple[int, int]:
    """
    Paints one ultralytics result's polygons into the global mask / confidence map.
    With *gray_tile*, each instance must pass the dark-spot test against the water
    around it inside the tile before it is painted. Returns (kept, rejected).
    """
    if result.masks is None or len(result.masks) == 0:
        return 0, 0
    confs = result.boxes.conf.tolist() if result.boxes is not None else []
    kept = rejected = 0
    for i, poly in enumerate(result.masks.xy):
        if len(poly) < 3:
            continue
        pts = np.round(np.asarray(poly, dtype=np.float32)).astype(np.int32)

        if gray_tile is not None:
            comp = np.zeros(gray_tile.shape, np.uint8)
            cv2.fillPoly(comp, [pts.reshape(-1, 1, 2)], 1)
            # Whole-tile masks and regions no darker than their surroundings are not slicks
            if comp.mean() >= MAX_TILE_FILL or _backscatter_damping_db(gray_tile, comp) < MIN_DAMPING_DB:
                rejected += 1
                continue

        pts[:, 0] += ox
        pts[:, 1] += oy
        local = np.zeros(mask.shape, np.uint8)
        cv2.fillPoly(local, [pts.reshape(-1, 1, 2)], 1)
        conf = float(confs[i]) if i < len(confs) else 0.0
        mask[local == 1] = 1
        conf_map[local == 1] = np.maximum(conf_map[local == 1], conf)
        kept += 1
    return kept, rejected


def _tile_windows(width: int, height: int) -> List[Tuple[int, int]]:
    """Top-left corners of overlapping tiles that cover the frame edge-to-edge."""
    stride = TILE_SIZE - TILE_OVERLAP
    xs = list(range(0, max(width - TILE_SIZE, 0) + 1, stride))
    ys = list(range(0, max(height - TILE_SIZE, 0) + 1, stride))
    if xs[-1] + TILE_SIZE < width:
        xs.append(width - TILE_SIZE)
    if ys[-1] + TILE_SIZE < height:
        ys.append(height - TILE_SIZE)
    return [(x, y) for y in ys for x in xs]


def segment_scene(
    model: YOLO,
    img: np.ndarray,
    confidence_threshold: float,
    physical_gray: Optional[np.ndarray] = None,
    tel: Optional["Telemetry"] = None,
) -> Tuple[np.ndarray, np.ndarray, str]:
    """
    Runs the segmentation model over the whole frame and returns
    (binary mask HxW, per-pixel confidence HxW, strategy label).
    *img* is what the model sees; *physical_gray* is the true radiometry used by the
    dark-spot gate in tiled mode (defaults to a grayscale of *img*).
    """
    h, w = img.shape[:2]
    mask = np.zeros((h, w), np.uint8)
    conf_map = np.zeros((h, w), np.float32)

    if max(h, w) <= SINGLE_PASS_MAX_SIDE or min(h, w) < TILE_SIZE:
        res = model.predict(img, conf=confidence_threshold, imgsz=640, verbose=False)[0]
        _rasterise_result(res, mask, conf_map, 0, 0)
        return mask, conf_map, "single_pass_640"

    windows = _tile_windows(w, h)
    conf = max(confidence_threshold, TILE_CONF_FLOOR)
    gray = physical_gray if physical_gray is not None else cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    kept = rejected = 0
    if tel is not None:
        tel.stage(
            "tiles",
            "TILED INFERENCE",
            f"{len(windows)} overlapping {TILE_SIZE}px tiles ({TILE_OVERLAP}px overlap) queued at conf ≥ {conf:.2f}",
        )
    for start in range(0, len(windows), TILE_BATCH):
        batch = windows[start:start + TILE_BATCH]
        crops = [np.ascontiguousarray(img[y:y + TILE_SIZE, x:x + TILE_SIZE]) for x, y in batch]
        results = model.predict(crops, conf=conf, imgsz=TILE_SIZE, verbose=False)
        for (x, y), res in zip(batch, results):
            k, rj = _rasterise_result(res, mask, conf_map, x, y, gray_tile=gray[y:y + TILE_SIZE, x:x + TILE_SIZE])
            kept += k
            rejected += rj
        if tel is not None:
            done = min(start + TILE_BATCH, len(windows))
            tel.stage(
                "tiles_progress",
                "TILED INFERENCE",
                f"tile {done}/{len(windows)} · {kept} candidate mask(s) kept, {rejected} rejected by the dark-spot gate",
                progress=round(done / len(windows), 3),
                replaces="tiles_progress",
            )

    return mask, conf_map, (
        f"tiled_{TILE_SIZE}px_{len(windows)}_tiles_conf{conf:.2f}"
        f"_darkspot_gate_{MIN_DAMPING_DB:.0f}dB(kept={kept},rejected={rejected})"
    )


def _backscatter_damping_db(gray: np.ndarray, comp: np.ndarray) -> float:
    """
    Intensity contrast between a component and a ring of water around it, in dB.
    Positive = the region is darker than its surroundings (what oil does to SAR).
    """
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (RING_WIDTH_PX * 2 + 1, RING_WIDTH_PX * 2 + 1))
    ring = cv2.dilate(comp, kernel) - comp
    inside = gray[comp == 1]
    around = gray[ring == 1]
    if inside.size == 0 or around.size == 0:
        return 0.0
    mean_in = max(float(inside.mean()), 1e-3)
    mean_out = max(float(around.mean()), 1e-3)
    return 10.0 * math.log10(mean_out / mean_in)


def _mask_to_instances(
    mask: np.ndarray, conf_map: np.ndarray, gray: Optional[np.ndarray] = None, apply_damping_gate: bool = False
) -> List[Tuple[np.ndarray, float, Optional[float]]]:
    """
    Connected components of the merged mask → (contour, max confidence, damping_dB).
    With *apply_damping_gate*, components that are not darker than their surroundings
    by MIN_DAMPING_DB are discarded as sea texture.
    """
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    out: List[Tuple[np.ndarray, float, Optional[float]]] = []
    for cnt in contours:
        if len(cnt) < 3 or cv2.contourArea(cnt) < MIN_MASK_AREA_PX:
            continue
        comp = np.zeros(mask.shape, np.uint8)
        cv2.drawContours(comp, [cnt], -1, 1, -1)
        conf = float(conf_map[comp == 1].max()) if (comp == 1).any() else 0.0
        damping = _backscatter_damping_db(gray, comp) if gray is not None else None
        if apply_damping_gate and damping is not None and damping < MIN_DAMPING_DB:
            continue
        out.append((cnt.reshape(-1, 2).astype(np.float32), conf, round(damping, 2) if damping is not None else None))
    return out


# ─── Previews ─────────────────────────────────────────────────────────────────

def _to_jpeg_data_url(img_bgr: np.ndarray) -> str:
    h, w = img_bgr.shape[:2]
    scale = min(1.0, PREVIEW_MAX_SIDE / max(h, w))
    if scale < 1.0:
        img_bgr = cv2.resize(img_bgr, (max(1, int(w * scale)), max(1, int(h * scale))), interpolation=cv2.INTER_AREA)
    ok, buf = cv2.imencode(".jpg", img_bgr, [int(cv2.IMWRITE_JPEG_QUALITY), PREVIEW_JPEG_QUALITY])
    if not ok:
        return ""
    return "data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode("ascii")


def _render_overlay(img_bgr: np.ndarray, detections: List[SpillDetection]) -> np.ndarray:
    """Paints each slick mask onto the scene: translucent fill, outline, centroid, label."""
    out = img_bgr.copy()
    fill = out.copy()
    for i, det in enumerate(detections):
        pts = np.array(det.polygon, dtype=np.int32).reshape(-1, 1, 2)
        colour = (0, 0, 255) if i == 0 else (0, 140, 255)          # BGR: red primary, orange others
        cv2.fillPoly(fill, [pts], colour)
    cv2.addWeighted(fill, 0.38, out, 0.62, 0, out)

    for i, det in enumerate(detections):
        pts = np.array(det.polygon, dtype=np.int32).reshape(-1, 1, 2)
        colour = (0, 255, 255) if i == 0 else (0, 200, 255)
        cv2.polylines(out, [pts], True, colour, 2, cv2.LINE_AA)
        cx, cy = int(round(det.centroid.pixel_x)), int(round(det.centroid.pixel_y))
        cv2.drawMarker(out, (cx, cy), (255, 255, 255), cv2.MARKER_CROSS, 14, 2, cv2.LINE_AA)
        label = f"#{i + 1} {det.confidence * 100:.0f}%  {det.area.km2:.2f} km2"
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 2)
        x, y = max(0, min(cx + 10, out.shape[1] - tw - 6)), max(th + 6, cy - 10)
        cv2.rectangle(out, (x - 3, y - th - 4), (x + tw + 3, y + 4), (0, 0, 0), -1)
        cv2.putText(out, label, (x, y), cv2.FONT_HERSHEY_SIMPLEX, 0.55, colour, 2, cv2.LINE_AA)
    return out


# ─── Inference & Characterization ─────────────────────────────────────────────

def run_sar_inference(
    image_bytes: bytes,
    filename: str,
    confidence_threshold: float = 0.15,
    gsd_m_per_pixel: float = 10.0,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    timestamp: Optional[str] = None,
    coordinate_source: str = "scene_georeference_anchor",
    appearance_code: str = "3",
    tel: Optional[Telemetry] = None,
) -> AnalysisResponse:
    """
    Executes real YOLOv8 segmentation on the uploaded image bytes.
    Computes geometric properties (area in km², perimeter in km, elongation, age).

    Anchoring, in priority order:
      1. explicit *latitude*/*longitude* (manual anchor)
      2. a GeoTIFF's embedded georeference — the primary slick's centroid becomes the anchor
    With an anchor, Phases 2–4 (drift, AIS attribution, ecological exposure) run in the
    same request. Without one, those phases report the specific inputs they are missing.
    """
    tel = tel or Telemetry()

    # 1. Decode — GeoTIFFs go through rasterio (georeference, SAR stretch, decimation);
    #    everything else through OpenCV.
    raster_georef: Optional[_RasterGeoref] = None
    polarity = "as_is"
    if is_geotiff_name(filename):
        try:
            scene = decode_geotiff(image_bytes, filename)
        except Exception as exc:
            raise ValueError(f"Could not decode GeoTIFF '{filename}': {exc}") from exc
        img = cv2.cvtColor(scene.image_rgb, cv2.COLOR_RGB2BGR)        # model input
        physical_gray = scene.physical_gray                            # true radiometry
        display_img = cv2.cvtColor(physical_gray, cv2.COLOR_GRAY2BGR)  # previews show the real SAR look
        raster_georef = scene.georef
        polarity = scene.polarity

        if raster_georef is not None:
            tel.stage(
                "io",
                "SATELLITE I/O",
                f"GeoTIFF parsed via rasterio · {raster_georef.crs} · "
                f"{raster_georef.width}×{raster_georef.height} px at {raster_georef.gsd_m} m/px",
                detail=(
                    f"acquisition {raster_georef.timestamp[:19].replace('T', ' ')}Z from {raster_georef.timestamp_source}"
                    if raster_georef.timestamp
                    else "no acquisition time in metadata"
                ),
            )
        else:
            tel.stage("io", "SATELLITE I/O", f"TIFF decoded ({len(image_bytes) / 1e6:.1f} MB) — no CRS embedded")

        tel.stage(
            "filter",
            "RADAR FILTER",
            f"Lee speckle filter (7×7) + percentile stretch, then dark-spot enhancement for the model",
            detail=f"polarity {polarity} · decimated 1/{raster_georef.inference_scale:.2f}" if raster_georef else polarity,
        )
    else:
        np_arr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Could not decode image bytes. Please ensure the file is a valid PNG, JPEG, or GeoTIFF.")
        physical_gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        display_img = img
        tel.stage(
            "io",
            "SATELLITE I/O",
            f"{filename} decoded ({len(image_bytes) / 1e6:.2f} MB) — no embedded georeference",
            detail="scene anchor must be supplied manually",
        )

    height, width = img.shape[:2]
    if raster_georef is not None:
        # metres per INFERENCE pixel — the decimated array the model actually sees
        gsd_m_per_pixel = raster_georef.gsd_m * raster_georef.inference_scale

    # Acquisition time: explicit > GeoTIFF tag/filename > now
    scene_timestamp = timestamp or (raster_georef.timestamp if raster_georef else None)
    timestamp_str = scene_timestamp or datetime.now(timezone.utc).isoformat()

    # 2. Run the YOLOv8-seg model — one pass for small frames, overlapping tiles for
    #    whole scenes — and merge everything into one instance list.
    model = get_yolo_model()
    tel.stage(
        "model",
        "NEURAL ENGINE",
        f"YOLOv8n-seg weights resident · running forward pass over a {width}×{height} px frame",
        detail=f"confidence floor {confidence_threshold}",
    )
    scene_mask, conf_map, strategy = segment_scene(model, img, confidence_threshold, physical_gray, tel)
    strategy += f"_polarity_{polarity}"
    # Tiled scenes were gated per instance inside segment_scene; here damping is measured
    # on the merged shapes for reporting only — always against the true radiometry.
    instances = _mask_to_instances(scene_mask, conf_map, physical_gray, apply_damping_gate=False)

    spill_id = f"SPILL-LIVE-{uuid.uuid4().hex[:6].upper()}"

    detections: List[SpillDetection] = []

    # 3. Characterise each merged instance
    if instances:
        for i, (poly, conf, damping_db) in enumerate(instances):
            cnt = np.array(poly, dtype=np.float32)

            # Area & Perimeter
            area_px = float(cv2.contourArea(cnt))
            if area_px <= 0:
                continue

            peri_px = float(cv2.arcLength(cnt, True))
            area_km2 = float(area_px * (gsd_m_per_pixel ** 2) / 1e6)
            peri_km = float(peri_px * gsd_m_per_pixel / 1000.0)

            # Centroid
            M = cv2.moments(cnt)
            if M["m00"] != 0:
                cx = float(M["m10"] / M["m00"])
                cy = float(M["m01"] / M["m00"])
            else:
                cx = float(np.mean(poly[:, 0]))
                cy = float(np.mean(poly[:, 1]))

            # Elongation ratio (via minimum area bounding rectangle)
            rect = cv2.minAreaRect(cnt)
            rw, rh = rect[1]
            elongation = float(max(rw, rh) / max(min(rw, rh), 1e-3))
            elongation = round(elongation, 3)

            # Heuristic age estimate (fractal edge density)
            edge_density = float(peri_px / max(area_px, 1.0))
            age_cat = "fresh" if edge_density > 0.035 else "older"

            # Convert polygon coords to int [x, y] list
            poly_coords = [[int(round(pt[0])), int(round(pt[1]))] for pt in poly]

            # Georeference the mask when the scene carries a CRS
            cen_lat = cen_lon = None
            poly_latlon: Optional[List[List[float]]] = None
            if raster_georef is not None:
                lonlats = pixels_to_lonlat(raster_georef, [cx] + [p[0] for p in poly_coords], [cy] + [p[1] for p in poly_coords])
                cen_lon, cen_lat = lonlats[0]
                poly_latlon = [[round(la, 6), round(lo, 6)] for lo, la in lonlats[1:]]
                cen_lat, cen_lon = round(cen_lat, 6), round(cen_lon, 6)

            det = SpillDetection(
                spill_id=f"{spill_id}-OBJ{i+1}",
                polygon=poly_coords,
                polygon_latlon=poly_latlon,
                bonn_volume=estimate_bonn_volume(area_km2, appearance_code),
                backscatter_damping_db=damping_db,
                centroid=Centroid(pixel_x=round(cx, 2), pixel_y=round(cy, 2), lat=cen_lat, lon=cen_lon),
                area=SpillArea(pixels=round(area_px, 1), km2=round(area_km2, 4), gsd_m_per_pixel=round(gsd_m_per_pixel, 3)),
                perimeter=SpillPerimeter(pixels=round(peri_px, 2), km=round(peri_km, 4)),
                elongation_ratio=elongation,
                timestamp=timestamp_str,
                confidence=round(conf, 4),
                age_estimate=AgeEstimate(
                    category=age_cat,
                    edge_density=round(edge_density, 5),
                    method="edge_density_heuristic",
                    scientific_status="prototype_estimate",
                ),
            )
            detections.append(det)

    # Sort detections by area descending (primary slick first)
    detections.sort(key=lambda d: d.area.km2, reverse=True)
    primary_detection = detections[0] if detections else None

    if primary_detection is not None:
        bv = primary_detection.bonn_volume
        tel.stage(
            "masks",
            "MASK EXTRACT",
            f"{len(detections)} slick polygon(s) segmented · largest {primary_detection.area.km2:.4f} km² "
            f"at {primary_detection.confidence * 100:.2f}% confidence"
            + (f" · {primary_detection.backscatter_damping_db:+.1f} dB vs surrounding water" if primary_detection.backscatter_damping_db is not None else ""),
            detail=(
                f"Bonn code {bv.appearance_code} → {bv.volume_tonnes_min}–{bv.volume_tonnes_max} t"
                if bv
                else None
            ),
        )
    else:
        tel.stage(
            "masks",
            "MASK EXTRACT",
            "No slick signature above the confidence floor survived the dark-spot gate",
            detail="scene reads as clean water",
        )

    # 4. Resolve the scene anchor: manual coordinates win; otherwise a georeferenced
    #    scene anchors itself on the primary slick's centroid.
    anchor_source = "none"
    if latitude is not None and longitude is not None:
        anchor_source = "manual"
    elif (
        raster_georef is not None
        and primary_detection is not None
        and primary_detection.centroid.lat is not None
        and primary_detection.centroid.lon is not None
    ):
        latitude, longitude = primary_detection.centroid.lat, primary_detection.centroid.lon
        coordinate_source = "geotiff_embedded_georeference"
        anchor_source = "geotiff"
        tel.stage(
            "anchor",
            "SCENE ANCHOR",
            f"Slick centroid georeferenced to {latitude:.5f}°N {longitude:.5f}°E from the embedded transform",
            detail="no manual coordinate entry required",
        )
    elif anchor_source == "manual":
        tel.stage(
            "anchor",
            "SCENE ANCHOR",
            f"Operator-supplied anchor {latitude:.5f}°N {longitude:.5f}°E",
        )

    # 5. Downstream chain — runs whenever an anchor exists (Phase 2's missing input otherwise)
    drift: Optional[DriftAnalysis] = None
    attribution: Optional[VesselAttribution] = None
    ecology: Optional[EcologicalAssessment] = None
    exposure: Optional[EcologicalExposureResponse] = None
    chain_error: Optional[str] = None

    if detections and latitude is not None and longitude is not None:
        try:
            drift, attribution, ecology, exposure = _run_downstream_chain(
                spill_id=spill_id,
                latitude=latitude,
                longitude=longitude,
                timestamp=timestamp_str,
                coordinate_source=coordinate_source,
                tel=tel,
            )
        except Exception as exc:  # keep Phase 1 results even if the chain fails
            chain_error = f"{type(exc).__name__}: {exc}"
            tel.stage("error", "CHAIN HALTED", chain_error, level="error")
    elif detections:
        tel.stage(
            "blocked",
            "AWAITING ANCHOR",
            "Detection complete — origin reconstruction needs a scene anchor before it can run",
            level="warn",
        )

    # 6. Previews (inference resolution → ≤1024 px JPEG): the scene as an analyst expects
    #    to see it (true radiometry), raw and with painted masks
    preview_image = _to_jpeg_data_url(display_img)
    overlay_image = _to_jpeg_data_url(_render_overlay(display_img, detections)) if detections else None

    georeference = (
        SceneGeoreference(
            crs=raster_georef.crs,
            transform=list(raster_georef.transform),
            width=raster_georef.width,
            height=raster_georef.height,
            bounds_wgs84=list(raster_georef.bounds_wgs84),
            gsd_m=raster_georef.gsd_m,
            inference_scale=raster_georef.inference_scale,
            timestamp=raster_georef.timestamp,
            timestamp_source=raster_georef.timestamp_source,
            source=raster_georef.source,
        )
        if raster_georef is not None
        else None
    )

    # 7. Build stage progression reflecting what actually ran
    stages = _build_stages(
        detections=detections,
        primary_detection=primary_detection,
        drift=drift,
        attribution=attribution,
        chain_error=chain_error,
    )

    phase2_reqs = [
        "Geographic scene anchor (latitude, longitude)",
        "Observation timestamp (UTC)",
        "Ocean surface current vector field (u, v)",
        "Ocean surface wind vector field (u, v)",
    ]
    phase3_reqs = [
        "Phase 2 reconstructed spill origin corridor",
        "Spatio-temporal AIS vessel telemetry records",
        "4-factor attribution weighting matrix",
    ]

    if drift is not None:
        phase2_status = "complete"
        phase2_explanation = (
            f"Origin reconstructed at ({drift.hindcast.estimated_origin.lat:.4f}°, "
            f"{drift.hindcast.estimated_origin.lon:.4f}°), "
            f"{drift.hindcast.estimated_origin.hours_before_observation}h before observation, "
            f"using {drift.environment.source}."
        )
    else:
        phase2_status = "blocked_missing_inputs"
        phase2_explanation = (
            "Origin reconstruction requires a verified geographic scene anchor (latitude/longitude), "
            "observation time, and local ocean current and surface wind velocity vector fields."
        )

    if attribution is not None:
        phase3_status = "complete"
        top = attribution.candidate_vessels[0] if attribution.candidate_vessels else None
        phase3_explanation = (
            f"Correlated {len(attribution.candidate_vessels)} vessel track(s) against the origin corridor; "
            f"top candidate {top.vessel_name} scored {top.score} ({top.risk} risk)."
            if top
            else "AIS correlation completed: no vessel tracks fell within the origin search radius."
        )
    else:
        phase3_status = "waiting_for_origin"
        phase3_explanation = (
            "Vessel attribution requires the reconstructed origin corridor from Phase 2 to query and "
            "correlate vessel tracks within the candidate spatio-temporal window."
        )

    status = "spill_detected" if detections else "no_spill_detected"

    if not detections:
        pipeline_msg = (
            "Phase 1 real-time YOLOv8 segmentation completed: "
            "No suspicious oil slicks detected above confidence threshold."
        )
    elif chain_error:
        pipeline_msg = (
            f"Satellite detection and slick characterisation are complete ({len(detections)} slick region(s) identified). "
            f"Downstream reconstruction was attempted but failed: {chain_error}"
        )
    elif attribution is not None:
        pipeline_msg = (
            f"Full investigation chain complete: {len(detections)} slick region(s) detected, origin reconstructed, "
            f"and {len(attribution.candidate_vessels)} candidate vessel(s) scored against the origin corridor."
        )
    elif drift is not None:
        pipeline_msg = (
            f"Detection, characterisation, and origin reconstruction are complete "
            f"({len(detections)} slick region(s) identified). AIS correlation did not return an attribution."
        )
    else:
        pipeline_msg = (
            f"Satellite detection and slick characterisation are complete ({len(detections)} slick region(s) identified). "
            "Physical origin reconstruction cannot yet run because this uploaded scene carries no georeference "
            "(plain PNG/JPEG) and no manual anchor was supplied — upload a GeoTIFF or enter the scene coordinates."
        )
    if anchor_source == "geotiff" and georeference is not None:
        pipeline_msg += (
            f" Scene auto-georeferenced from the GeoTIFF ({georeference.crs}, {georeference.gsd_m} m/px"
            f"{', acquisition time from ' + georeference.timestamp_source if georeference.timestamp else ''})."
        )
    pipeline_msg += f" Segmentation strategy: {strategy}."

    response = AnalysisResponse(
        spill_id=spill_id,
        filename=filename,
        timestamp=timestamp_str,
        dimensions=ImageDimensions(width=width, height=height),
        detection_count=len(detections),
        status=status,
        pipeline_message=pipeline_msg,
        has_drift_and_attribution=drift is not None and attribution is not None,
        detection=primary_detection,
        all_detections=detections,
        stages=stages,
        phase2_status=phase2_status,
        phase2_explanation=phase2_explanation,
        phase2_prerequisites=phase2_reqs,
        phase3_status=phase3_status,
        phase3_explanation=phase3_explanation,
        phase3_prerequisites=phase3_reqs,
        drift=drift,
        attribution=attribution,
        ecology=ecology,
        ecological_exposure=exposure,
        chain_error=chain_error,
        georeference=georeference,
        anchor_source=anchor_source,
        preview_image=preview_image,
        overlay_image=overlay_image,
    )

    # Persist live investigation result
    _persist_live_investigation(response)

    tel.stage(
        "done",
        "INVESTIGATION READY",
        f"{spill_id} persisted"
        + (
            " · full chain complete, dossier available"
            if response.has_drift_and_attribution
            else " · Phase 1 complete"
        ),
        level="success",
    )

    return response
