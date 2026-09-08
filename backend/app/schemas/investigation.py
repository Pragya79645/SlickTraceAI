"""
Pydantic response schemas for SlickTrace AI Investigation API.
All field names and types match the ACTUAL Phase 1–3 artifact structure.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel


# ─── Phase 1: Spill Characterisation ──────────────────────────────────────────

class Centroid(BaseModel):
    pixel_x: float
    pixel_y: float
    lat: Optional[float]
    lon: Optional[float]


class SpillArea(BaseModel):
    pixels: float
    km2: float
    gsd_m_per_pixel: float


class SpillPerimeter(BaseModel):
    pixels: float
    km: float


class AgeEstimate(BaseModel):
    category: str
    edge_density: float
    method: str
    scientific_status: str


class BonnVolumeEstimate(BaseModel):
    """
    Order-of-magnitude spill volume from slick area × film thickness, following the
    Bonn Agreement Oil Appearance Code (BAOAC). Without multispectral thickness data the
    appearance code is assumed, so this is a bracketed range, not a measurement.
    """
    appearance_code: str              # "3" = metallic (5–50 µm) is the default assumption for SAR-visible slicks
    appearance_label: str
    thickness_um_min: float
    thickness_um_max: float
    volume_m3_min: float
    volume_m3_max: float
    volume_tonnes_min: float
    volume_tonnes_max: float
    oil_density_kg_m3: float
    basis: str


class SceneGeoreference(BaseModel):
    crs: str
    transform: List[float]            # GDAL affine (x0, px_w, rot, y0, rot, px_h) at full resolution
    width: int
    height: int
    bounds_wgs84: List[float]         # west, south, east, north
    gsd_m: float
    inference_scale: float            # full-res pixels per inference pixel (≥ 1)
    timestamp: Optional[str] = None
    timestamp_source: str = "none"    # "tiff_tag" | "filename" | "none"
    source: str = "geotiff_embedded"


class SpillDetection(BaseModel):
    spill_id: str
    polygon: List[List[int]]          # pixel coordinates from Phase 1 (inference resolution)
    centroid: Centroid
    area: SpillArea
    perimeter: SpillPerimeter
    elongation_ratio: float
    timestamp: str
    confidence: float
    age_estimate: AgeEstimate
    polygon_latlon: Optional[List[List[float]]] = None   # [[lat, lon], …] when the scene is georeferenced
    bonn_volume: Optional[BonnVolumeEstimate] = None
    backscatter_damping_db: Optional[float] = None       # how much darker than surrounding water (SAR dark-spot test)


# ─── Phase 2: Lagrangian Hindcast / Forecast ──────────────────────────────────

class GeoTimestep(BaseModel):
    timestamp: str
    lat: float
    lon: float
    hours_before_observation: Optional[float] = None
    hours_after_observation: Optional[float] = None


class HindcastOrigin(BaseModel):
    timestamp: str
    lat: float
    lon: float
    hours_before_observation: float


class ForecastEndpoint(BaseModel):
    timestamp: str
    lat: float
    lon: float
    hours_after_observation: float


class Observation(BaseModel):
    timestamp: str
    latitude: float
    longitude: float
    coordinate_source: str


class CurrentVector(BaseModel):
    u_ms: float
    v_ms: float


class DriftVector(BaseModel):
    u_ms: float
    v_ms: float
    speed_ms: float


class Environment(BaseModel):
    source: str                                # "open_meteo" | "override_file:…" | "prototype_local_vector_field"
    current: CurrentVector
    wind: CurrentVector
    wind_factor: float
    drift: DriftVector
    quality: Optional[str] = None              # e.g. "reanalysis_model_grid", "calibrated_prototype_grid"
    confidence_score: Optional[float] = None
    valid_time: Optional[str] = None           # UTC hour the vectors are valid for
    provider_detail: Optional[str] = None      # human-readable provenance line
    notes: Optional[str] = None


class Hindcast(BaseModel):
    duration_hours: int
    step_minutes: int
    trajectory: List[GeoTimestep]
    estimated_origin: HindcastOrigin


class Forecast(BaseModel):
    duration_hours: int
    step_minutes: int
    trajectory: List[GeoTimestep]
    forecast_endpoint: ForecastEndpoint


class DriftMethod(BaseModel):
    type: str
    formula: str


# ─── Phase 2b: Monte Carlo Drift Ensemble ─────────────────────────────────────

class EnsembleEllipse(BaseModel):
    """Confidence ellipse of the particle cloud at one timestep (2-D Gaussian fit)."""
    confidence: float                 # 0.50 | 0.80 | 0.95
    center_lat: float
    center_lon: float
    semi_major_km: float
    semi_minor_km: float
    orientation_deg: float            # bearing of the semi-major axis, clockwise from north
    area_km2: float
    polygon: List[List[float]]        # closed ring of [lat, lon]


class EnsembleStep(BaseModel):
    timestamp: str
    hours_offset: float               # negative = hindcast, positive = forecast
    mean_lat: float
    mean_lon: float
    spread_km: float                  # RMS radial distance of particles from the mean
    ellipses: List[EnsembleEllipse]


class DriftEnsemble(BaseModel):
    n_particles: int
    seed: int
    method: str
    perturbations: Dict[str, str]     # human-readable description of each sampled parameter
    hindcast_steps: List[EnsembleStep]
    forecast_steps: List[EnsembleStep]
    origin_particles: List[List[float]]   # subsampled [lat, lon] cloud at the hindcast horizon
    origin_corridor: List[List[float]]    # convex hull of every hindcast particle position
    origin_80_area_km2: float             # area of the 80 % band at the hindcast horizon
    limitations: List[str]


class DriftAnalysis(BaseModel):
    spill_id: str
    observation: Observation
    environment: Environment
    hindcast: Hindcast
    forecast: Forecast
    method: DriftMethod
    prototype_limitations: List[str]
    ensemble: Optional[DriftEnsemble] = None


# ─── Phase 3: Vessel Attribution ──────────────────────────────────────────────

class ReconstructedOrigin(BaseModel):
    latitude: float
    longitude: float
    timestamp: str


class AttributionWeights(BaseModel):
    proximity_weight: int
    temporal_weight: int
    trajectory_weight: int
    behavioral_weight: int


class AISTrackPoint(BaseModel):
    timestamp: str
    lat: float
    lon: float
    sog_knots: float
    cog_degrees: float
    heading_degrees: float
    is_closest_approach: Optional[bool] = False
    is_speed_reduction: Optional[bool] = False
    is_corridor_crossing: Optional[bool] = False


class AISGap(BaseModel):
    """
    An anomalous AIS transmission gap — the interval exceeds the vessel's own
    reporting cadence by a wide margin, so it reads as a transponder switch-off
    rather than sparse reporting.
    """
    start_timestamp: str
    end_timestamp: str
    duration_hours: float
    start_lat: float
    start_lon: float
    end_lat: float
    end_lon: float
    spans_origin_time: bool                    # the estimated discharge time falls inside the silence
    inferred_lat: Optional[float] = None       # linear interpolation at the origin time (only when spanning)
    inferred_lon: Optional[float] = None
    inferred_distance_km: Optional[float] = None


class CandidateVessel(BaseModel):
    vessel_id: str                   # MMSI
    vessel_name: str
    vessel_type: Optional[str] = None
    flag: Optional[str] = None       # derived from the MMSI's MID prefix
    origin_band: Optional[str] = None  # tightest ensemble band containing the closest approach: "50%" | "80%" | "95%"
    ais_gaps: List[AISGap] = []
    went_dark: bool = False          # an anomalous gap spans the estimated discharge time
    evidence_basis: str = "measured" # "measured" | "inferred_during_silence"
    score: float
    risk: str
    min_distance_km: float
    time_difference_hours: float
    proximity_score: float
    temporal_score: float
    trajectory_score: float
    behavioral_score: float
    reasons: List[str]
    track: Optional[List[AISTrackPoint]] = None


class VesselAttribution(BaseModel):
    spill_id: str
    reconstructed_origin: ReconstructedOrigin
    method: AttributionWeights
    candidate_vessels: List[CandidateVessel]


# ─── AIS Summary (derived from CSV) ──────────────────────────────────────────

class AISSummary(BaseModel):
    total_records: int
    unique_vessels: int
    columns: List[str]
    vessel_names: List[str]


# ─── Phase 4: Ecological Threat Assessment (Phase 5E) ─────────────────────────

class NationalRamsarSite(BaseModel):
    name: str
    state: str
    designation_date: str
    area_hectares: Optional[float] = None
    status: str
    wetland_type: str
    source_url: str
    source: str = "Government of India / MoEFCC Ramsar Sites dataset"
    has_geometry: bool = False


class SensitiveHabitat(BaseModel):
    id: str
    name: str
    type: str
    latitude: float
    longitude: float
    protection_status: str
    impact_radius_km: float
    source: str


class HabitatImpact(BaseModel):
    habitat_id: str
    habitat_name: str
    type: str
    latitude: float
    longitude: float
    impact_radius_km: float
    minimum_distance_km: float
    estimated_time_to_impact_hours: Optional[float] = None
    threat_level: str               # "HIGH" | "MEDIUM" | "LOW"
    reason: str
    is_confirmed_impact: bool = False


class EcologicalAssessmentSummary(BaseModel):
    status: str = "SCREENED"
    response_priority: str          # "HIGH" | "MEDIUM" | "LOW"
    habitats_evaluated: int
    threatened_habitats: int


class EcologicalAssessment(BaseModel):
    assessment: EcologicalAssessmentSummary
    impacts: List[HabitatImpact]
    prototype_limitations: List[str] = [
        "Ecological screening uses prototype habitat screening radii.",
        "Forecast is based on the existing prototype drift model.",
        "Threat indicates potential exposure, not confirmed ecological damage."
    ]


class EcologyRequest(BaseModel):
    forecast_trajectory: List[GeoTimestep]
    habitats: Optional[List[SensitiveHabitat]] = None


# ─── National Ramsar GIS Spatial Exposure Engine (Phase 5E Part 3) ────────────

class RamsarThreatSite(BaseModel):
    site_name: str
    state: str
    threat_level: str               # "DIRECT_THREAT" | "NEAR_THREAT" | "LOW_EXPOSURE" | "NO_SIGNIFICANT_EXPOSURE"
    exposure_basis: str             # "CURRENT_OBSERVATION" | "FORECAST_INTERSECTION" | "PROXIMITY_ONLY" | "NO_EXPOSURE"
    minimum_distance_km: float
    estimated_time_to_impact_hours: Optional[float] = None
    intersection: bool
    area_hectares: Optional[float] = None
    wetland_type: Optional[str] = None
    status: Optional[str] = None
    source_url: Optional[str] = None
    geometry_type: str              # "Polygon" | "MultiPolygon"
    centroid_lat: float
    centroid_lon: float
    reason: str


class EcologicalExposureResponse(BaseModel):
    sites_analyzed: int
    threats: List[RamsarThreatSite]
    nearest_site: Optional[RamsarThreatSite] = None
    direct_threats_count: int
    near_threats_count: int
    response_priority: str          # "CRITICAL_ACTION" | "HIGH_PRIORITY" | "MONITORING" | "LOW"
    disclaimer: str = (
        "Ecological exposure assessment is a spatial screening layer based on physical drift trajectory "
        "and official MoEFCC / Bharatmaps Ramsar GIS polygons. It indicates potential geometric exposure, "
        "not confirmed ecological destruction or measured wildlife injury."
    )


class EcologicalExposureRequest(BaseModel):
    forecast_trajectory: List[GeoTimestep]


# ─── Unified Investigation Response ──────────────────────────────────────────

class InvestigationResponse(BaseModel):
    """
    Unified response for GET /api/investigations/{spill_id}.
    Combines Phase 1, 2, 3 outputs, AIS summary, and screened Ecological Assessment.
    """
    spill_id: str
    detection: SpillDetection
    drift: DriftAnalysis
    attribution: VesselAttribution
    ais_summary: AISSummary
    ecology: Optional[EcologicalAssessment] = None
    ecological_exposure: Optional[EcologicalExposureResponse] = None


# ─── Live Inference & Investigation Workflow Schema (Phase 4 Step 5C) ────────

class ImageDimensions(BaseModel):
    width: int
    height: int


class PipelineStageInfo(BaseModel):
    stage_key: str
    title: str
    status: str            # "complete" | "inputs_required" | "waiting" | "failed"
    status_label: str      # "✓ COMPLETE" | "⚠ INPUT REQUIRED" | "○ WAITING" | "✕ FAILED"
    summary: str
    prerequisites: List[str] = []
    missing_prerequisites: List[str] = []


class AnalysisResponse(BaseModel):
    """
    Response schema for POST /api/investigations/analyze and live investigation results.
    Contains real YOLOv8 segmentation inference output and explicit pipeline readiness.

    Phases 2–4 are populated only when the caller supplies a geographic scene anchor
    (latitude/longitude) alongside the image; without one the downstream fields stay
    None and the stage statuses report exactly which inputs are missing.
    """
    spill_id: str
    filename: str
    timestamp: str
    dimensions: ImageDimensions
    detection_count: int
    status: str
    pipeline_message: str
    has_drift_and_attribution: bool
    detection: Optional[SpillDetection] = None
    all_detections: List[SpillDetection] = []
    stages: List[PipelineStageInfo] = []
    phase2_status: str = "blocked_missing_inputs"
    phase2_explanation: str = ""
    phase2_prerequisites: List[str] = []
    phase3_status: str = "waiting_for_origin"
    phase3_explanation: str = ""
    phase3_prerequisites: List[str] = []

    # Populated when an anchored analysis runs the full chain in one request.
    drift: Optional[DriftAnalysis] = None
    attribution: Optional[VesselAttribution] = None
    ecology: Optional[EcologicalAssessment] = None
    ecological_exposure: Optional[EcologicalExposureResponse] = None
    chain_error: Optional[str] = None

    # Scene geolocation read from a GeoTIFF upload (None for plain PNG/JPEG)
    georeference: Optional[SceneGeoreference] = None
    anchor_source: str = "none"       # "geotiff" | "manual" | "none"

    # Inference-resolution previews as data URLs (JPEG). Stripped before persistence.
    preview_image: Optional[str] = None
    overlay_image: Optional[str] = None


# ─── Model card (read from the checkpoint) ────────────────────────────────────

class ModelEpochRow(BaseModel):
    epoch: int
    mask_map50: Optional[float] = None
    mask_precision: Optional[float] = None
    mask_recall: Optional[float] = None
    box_map50: Optional[float] = None
    train_seg_loss: Optional[float] = None
    val_seg_loss: Optional[float] = None


class ModelMetrics(BaseModel):
    model_file: str
    architecture: str
    task: str
    ultralytics_version: str
    trained_at: str
    epochs: int
    image_size: int
    batch_size: int
    optimizer: str
    dataset: str
    pretrained: bool
    seed: int
    box_precision: Optional[float] = None
    box_recall: Optional[float] = None
    box_map50: Optional[float] = None
    box_map50_95: Optional[float] = None
    mask_precision: Optional[float] = None
    mask_recall: Optional[float] = None
    mask_map50: Optional[float] = None
    mask_map50_95: Optional[float] = None
    fitness: Optional[float] = None
    history: List[ModelEpochRow] = []
    caveats: List[str] = []


# ─── Phase 2 Drift Request Schema (Phase 5C) ───────────────────────────────────

class DriftRequest(BaseModel):
    """
    Request schema for POST /api/investigations/drift.
    """
    spill_id: str
    latitude: float
    longitude: float
    timestamp: str
    coordinate_source: Optional[str] = "scene_georeference_anchor"


# ─── Phase 3 AIS Correlation Schema (Phase 5D) ────────────────────────────────

class AISOriginInput(BaseModel):
    latitude: float
    longitude: float
    timestamp: str


class AISCorrelationRequest(BaseModel):
    """
    Request schema for POST /api/investigations/ais.
    Receives reconstructed origin from Phase 2 to correlate with AIS telemetry.
    """
    spill_id: str
    origin: AISOriginInput
    max_distance_km: Optional[float] = 30.0
    max_time_window_hours: Optional[float] = 6.0
    # Optional Monte Carlo origin bands (from DriftAnalysis.ensemble.hindcast_steps[-1].ellipses)
    # so each candidate can be tagged with the probability band its closest approach falls in.
    origin_ellipses: Optional[List[EnsembleEllipse]] = None
