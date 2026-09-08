from typing import Any, Dict, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.schemas.investigation import (
    AISCorrelationRequest,
    AnalysisResponse,
    DriftAnalysis,
    DriftRequest,
    EcologicalAssessment,
    EcologicalExposureRequest,
    EcologicalExposureResponse,
    EcologyRequest,
    InvestigationResponse,
    ModelMetrics,
    VesselAttribution,
)
from app.services.ais_service import correlate_vessels
from app.services.drift_service import compute_drift
from app.services.ecology_service import assess_ecological_threat
from app.services.inference_service import attach_live_results, is_live_id, run_sar_inference
from app.services.investigation_service import get_investigation

router = APIRouter(prefix="/api/investigations", tags=["investigations"])

MAX_UPLOAD_SIZE = 500 * 1024 * 1024  # 500 MB — a Sentinel-1 GRD subset / full IW scene
ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".tif", ".tiff"}


@router.post(
    "/analyze",
    response_model=AnalysisResponse,
    summary="Upload and analyze a SAR / EO image with YOLOv8-seg",
)
async def analyze_sar_image_endpoint(
    file: UploadFile = File(..., description="SAR or EO satellite image file (PNG/JPG/TIFF)"),
    latitude: Optional[float] = Form(None, description="Optional scene anchor latitude (-90 to 90)"),
    longitude: Optional[float] = Form(None, description="Optional scene anchor longitude (-180 to 180)"),
    timestamp: Optional[str] = Form(None, description="Optional observation timestamp (ISO 8601 UTC)"),
    appearance_code: str = Form("3", description="Bonn Agreement oil appearance code 1–5 for the volume bracket"),
) -> AnalysisResponse:
    """
    Accepts an uploaded SAR/EO image and runs real-time YOLOv8 instance segmentation.
    Extracts detected slick masks, polygon contours, area (km²), perimeter (km),
    elongation ratio, weathering age estimate, and a Bonn-Agreement volume bracket.

    **GeoTIFF uploads are georeferenced automatically**: the CRS and transform embedded in
    the file place every mask in WGS84, the primary slick's centroid becomes the scene
    anchor, and the acquisition time is read from TIFF tags or a Sentinel product name.
    Phases 2–4 (drift, AIS attribution, ecological exposure) then run in the same request.

    For plain PNG/JPEG scenes supply **latitude**/**longitude** to anchor manually; omit
    them to get Phase 1 only. Explicit coordinates always override the GeoTIFF anchor.
    """

    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided.")

    filename_lower = file.filename.lower()
    if not any(filename_lower.endswith(ext) for ext in ALLOWED_EXTENSIONS):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format '{file.filename}'. Allowed formats: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    try:
        content = await file.read()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to read uploaded file: {exc}") from exc

    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty (0 bytes).")

    if len(content) > MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File exceeds maximum allowed size of {MAX_UPLOAD_SIZE // (1024 * 1024)} MB.",
        )

    if latitude is not None and not (-90.0 <= latitude <= 90.0):
        raise HTTPException(status_code=400, detail=f"Latitude out of bounds [-90, 90]: {latitude}")
    if longitude is not None and not (-180.0 <= longitude <= 180.0):
        raise HTTPException(status_code=400, detail=f"Longitude out of bounds [-180, 180]: {longitude}")
    if (latitude is None) != (longitude is None):
        raise HTTPException(
            status_code=400,
            detail="Scene anchor requires both 'latitude' and 'longitude', or neither.",
        )

    try:
        return run_sar_inference(
            image_bytes=content,
            filename=file.filename,
            latitude=latitude,
            longitude=longitude,
            timestamp=timestamp,
            appearance_code=appearance_code,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Inference execution failed: {exc}",
        ) from exc


@router.post(
    "/drift",
    response_model=DriftAnalysis,
    summary="Run Phase 2 Lagrangian drift reconstruction from observation coordinates",
)
def compute_drift_endpoint(req: DriftRequest) -> DriftAnalysis:
    """
    Computes 2D Lagrangian oil slick hindcasting and forecasting for a given
    spill observation location and timestamp.
    Resolves ocean surface current and wind vectors via environment_service.
    """
    try:
        result = compute_drift(
            spill_id=req.spill_id,
            latitude=req.latitude,
            longitude=req.longitude,
            timestamp=req.timestamp,
            coordinate_source=req.coordinate_source or "scene_georeference_anchor",
        )
        if is_live_id(req.spill_id):
            attach_live_results(req.spill_id, drift=result)
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Drift computation failed: {exc}",
        ) from exc


@router.post(
    "/ais",
    response_model=VesselAttribution,
    summary="Run Phase 3 AIS vessel correlation and explainable attribution scoring",
)
def correlate_ais_endpoint(req: AISCorrelationRequest) -> VesselAttribution:
    """
    Correlates AIS vessel telemetry records with the reconstructed spill origin corridor.
    Calculates geodesic proximity, temporal delta, trajectory corridor overlap, and behavioural anomalies.
    Returns ranked candidate vessels with explainable evidence.
    """
    try:
        result = correlate_vessels(
            spill_id=req.spill_id,
            origin_lat=req.origin.latitude,
            origin_lon=req.origin.longitude,
            origin_timestamp=req.origin.timestamp,
            max_distance_km=req.max_distance_km or 30.0,
            max_time_window_hours=req.max_time_window_hours or 6.0,
            origin_ellipses=req.origin_ellipses,
        )
        if is_live_id(req.spill_id):
            attach_live_results(req.spill_id, attribution=result)
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=f"AIS dataset missing: {exc}") from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"AIS correlation failed: {exc}",
        ) from exc


@router.post(
    "/ecology",
    response_model=EcologicalAssessment,
    summary="Assess ecological threat & sensitive habitat exposure from forecast trajectory",
)
def assess_ecology_endpoint(req: EcologyRequest) -> EcologicalAssessment:
    """
    Evaluates potential exposure of sensitive marine habitats to the forecast drift trajectory.
    Calculates geodesic distance, time to first impact, threat classification, and response priority.
    """
    try:
        result = assess_ecological_threat(
            forecast_trajectory=req.forecast_trajectory,
            habitats=req.habitats,
        )
        if is_live_id(req.spill_id):
            attach_live_results(req.spill_id, ecology=result)
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=f"Habitat dataset missing: {exc}") from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Ecological threat screening failed: {exc}",
        ) from exc


@router.post(
    "/ecological-exposure",
    response_model=EcologicalExposureResponse,
    summary="Compute generic spatial exposure against national Ramsar GIS polygons",
)
def assess_ecological_exposure_endpoint(req: EcologicalExposureRequest) -> EcologicalExposureResponse:
    """
    Computes spatial intersection and geodesic proximity between the forecast oil drift trajectory
    and official MoEFCC / Bharatmaps Ramsar wetland GIS polygons across India.
    """
    from app.services.ecological_service import assess_trajectory_exposure

    try:
        result = assess_trajectory_exposure(req.forecast_trajectory)
        if is_live_id(req.spill_id):
            attach_live_results(req.spill_id, ecological_exposure=result)
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=f"Ramsar GIS dataset missing: {exc}") from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Ramsar spatial exposure analysis failed: {exc}",
        ) from exc


@router.get(
    "/ramsar-geojson",
    summary="Get verified national Ramsar wetland GeoJSON FeatureCollection",
)
def get_ramsar_geojson_endpoint() -> Dict[str, Any]:
    """
    Returns the verified 99-feature Ramsar wetland polygon spatial layer for map rendering.
    """
    from app.services.ecological_service import load_ramsar_geojson

    try:
        return load_ramsar_geojson()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=f"Ramsar GeoJSON file missing: {exc}") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to load Ramsar GeoJSON: {exc}") from exc


@router.get(
    "/model/metrics",
    response_model=ModelMetrics,
    summary="Training record and validation metrics embedded in the segmentation checkpoint",
)
def get_model_metrics_endpoint() -> ModelMetrics:
    from app.services.model_service import get_model_metrics

    try:
        return get_model_metrics()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not read model checkpoint: {exc}") from exc


@router.get(
    "/live/{spill_id}",
    response_model=AnalysisResponse,
    summary="Get persisted live investigation by ID",
)
def get_live_investigation_endpoint(spill_id: str) -> AnalysisResponse:
    """
    Returns the live Phase 1 analysis result and pipeline state for a live investigation ID.
    """
    from app.services.inference_service import get_live_investigation

    res = get_live_investigation(spill_id)
    if not res:
        raise HTTPException(status_code=404, detail=f"Live investigation not found: '{spill_id}'")
    return res


@router.get(
    "/{spill_id}",
    response_model=InvestigationResponse,
    summary="Get unified investigation for a spill ID",
)
def get_investigation_endpoint(spill_id: str) -> InvestigationResponse:
    """
    Returns the combined Phase 1–4 investigation for the given spill ID.

    Bundled scenarios: **SPILL-001**, **SPILL-TEST-002**, **SPILL-TEST-003**.
    Live uploads: any persisted **SPILL-LIVE-…** id whose drift has been reconstructed
    (anchored GeoTIFF, or Phase 2 run from the upload page).
    """
    try:
        return get_investigation(spill_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Demo artifact not found on disk: {exc}",
        ) from exc
