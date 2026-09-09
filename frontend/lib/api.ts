// ─── SlickTrace AI — API client ───────────────────────────────────────────────
// Fetches the unified investigation from the FastAPI backend.
// TypeScript types mirror the actual Pydantic schemas in backend/app/schemas/investigation.py

const BACKEND = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

// ── Phase 1 ──────────────────────────────────────────────────────────────────

export interface Centroid {
  pixel_x: number;
  pixel_y: number;
  lat: number | null;
  lon: number | null;
}

export interface SpillArea {
  pixels: number;
  km2: number;
  gsd_m_per_pixel: number;
}

export interface SpillPerimeter {
  pixels: number;
  km: number;
}

export interface AgeEstimate {
  category: string;
  edge_density: number;
  method: string;
  scientific_status: string;
}

export interface BonnVolumeEstimate {
  appearance_code: string; // Bonn Agreement Oil Appearance Code 1–5 (assumed, not observed)
  appearance_label: string;
  thickness_um_min: number;
  thickness_um_max: number;
  volume_m3_min: number;
  volume_m3_max: number;
  volume_tonnes_min: number;
  volume_tonnes_max: number;
  oil_density_kg_m3: number;
  basis: string;
}

export interface SpillDetection {
  spill_id: string;
  polygon: [number, number][]; // pixel coords at inference resolution
  centroid: Centroid;
  area: SpillArea;
  perimeter: SpillPerimeter;
  elongation_ratio: number;
  timestamp: string;
  confidence: number;
  age_estimate: AgeEstimate;
  polygon_latlon?: [number, number][] | null; // [[lat, lon], …] when the scene is georeferenced
  bonn_volume?: BonnVolumeEstimate | null;
  backscatter_damping_db?: number | null; // how much darker than surrounding water (SAR dark-spot test)
}

export interface SceneGeoreference {
  crs: string; // e.g. "EPSG:32643"
  transform: number[]; // GDAL affine at full resolution
  width: number;
  height: number;
  bounds_wgs84: [number, number, number, number]; // west, south, east, north
  gsd_m: number;
  inference_scale: number; // full-res pixels per inference pixel (≥ 1)
  timestamp?: string | null;
  timestamp_source: "tiff_tag" | "filename" | "none";
  source: string;
}

// ── Phase 2 ──────────────────────────────────────────────────────────────────

export interface GeoTimestep {
  timestamp: string;
  lat: number;
  lon: number;
  hours_before_observation?: number;
  hours_after_observation?: number;
}

export interface HindcastOrigin {
  timestamp: string;
  lat: number;
  lon: number;
  hours_before_observation: number;
}

export interface ForecastEndpoint {
  timestamp: string;
  lat: number;
  lon: number;
  hours_after_observation: number;
}

export interface Observation {
  timestamp: string;
  latitude: number;
  longitude: number;
  coordinate_source: string;
}

export interface VectorComponent {
  u_ms: number;
  v_ms: number;
}

export interface DriftVector {
  u_ms: number;
  v_ms: number;
  speed_ms: number;
}

export interface Environment {
  source: string; // "open_meteo" | "override_file:…" | "prototype_local_vector_field"
  current: VectorComponent;
  wind: VectorComponent;
  wind_factor: number;
  drift: DriftVector;
  quality?: string | null;
  confidence_score?: number | null;
  valid_time?: string | null; // UTC hour the vectors are valid for
  provider_detail?: string | null;
  notes?: string | null;
}

export interface Hindcast {
  duration_hours: number;
  step_minutes: number;
  trajectory: GeoTimestep[];
  estimated_origin: HindcastOrigin;
}

export interface Forecast {
  duration_hours: number;
  step_minutes: number;
  trajectory: GeoTimestep[];
  forecast_endpoint: ForecastEndpoint;
}

export interface DriftMethod {
  type: string;
  formula: string;
}

// ── Phase 2b: Monte Carlo Drift Ensemble ────────────────────────────────────

export interface EnsembleEllipse {
  confidence: number; // 0.5 | 0.8 | 0.95
  center_lat: number;
  center_lon: number;
  semi_major_km: number;
  semi_minor_km: number;
  orientation_deg: number; // bearing of the semi-major axis, clockwise from north
  area_km2: number;
  polygon: [number, number][]; // closed ring of [lat, lon]
}

export interface EnsembleStep {
  timestamp: string;
  hours_offset: number; // negative = hindcast, positive = forecast
  mean_lat: number;
  mean_lon: number;
  spread_km: number; // RMS radial distance of particles from the mean
  ellipses: EnsembleEllipse[];
}

export interface DriftEnsemble {
  n_particles: number;
  seed: number;
  method: string;
  perturbations: Record<string, string>;
  hindcast_steps: EnsembleStep[];
  forecast_steps: EnsembleStep[];
  origin_particles: [number, number][]; // subsampled [lat, lon] cloud at the hindcast horizon
  origin_corridor: [number, number][]; // convex hull of every hindcast particle position
  origin_80_area_km2: number;
  limitations: string[];
}

export interface DriftAnalysis {
  spill_id: string;
  observation: Observation;
  environment: Environment;
  hindcast: Hindcast;
  forecast: Forecast;
  method: DriftMethod;
  prototype_limitations: string[];
  ensemble?: DriftEnsemble | null;
}

// ── Phase 3 ──────────────────────────────────────────────────────────────────

export interface ReconstructedOrigin {
  latitude: number;
  longitude: number;
  timestamp: string;
}

export interface AttributionWeights {
  proximity_weight: number;
  temporal_weight: number;
  trajectory_weight: number;
  behavioral_weight: number;
}

export interface AISTrackPoint {
  timestamp: string;
  lat: number;
  lon: number;
  sog_knots: number;
  cog_degrees: number;
  heading_degrees: number;
  is_closest_approach?: boolean;
  is_speed_reduction?: boolean;
  is_corridor_crossing?: boolean;
}

export interface AISGap {
  start_timestamp: string;
  end_timestamp: string;
  duration_hours: number;
  start_lat: number;
  start_lon: number;
  end_lat: number;
  end_lon: number;
  spans_origin_time: boolean; // the estimated discharge time falls inside the silence
  inferred_lat?: number | null; // linear interpolation at the origin time (only when spanning)
  inferred_lon?: number | null;
  inferred_distance_km?: number | null;
}

export interface CandidateVessel {
  vessel_id: string; // MMSI
  vessel_name: string;
  vessel_type?: string | null;
  flag?: string | null; // derived from the MMSI's MID prefix
  origin_band?: string | null; // tightest ensemble band containing the closest approach: "50%" | "80%" | "95%"
  ais_gaps?: AISGap[];
  went_dark?: boolean; // an anomalous gap spans the estimated discharge time
  evidence_basis?: "measured" | "inferred_during_silence";
  score: number;
  risk: "HIGH" | "MEDIUM" | "LOW";
  min_distance_km: number;
  time_difference_hours: number;
  proximity_score: number;
  temporal_score: number;
  trajectory_score: number;
  behavioral_score: number;
  reasons: string[];
  track?: AISTrackPoint[];
}

export interface VesselAttribution {
  spill_id: string;
  reconstructed_origin: ReconstructedOrigin;
  method: AttributionWeights;
  candidate_vessels: CandidateVessel[];
}

// ── AIS Summary ───────────────────────────────────────────────────────────────

export interface AISSummary {
  total_records: number;
  unique_vessels: number;
  columns: string[];
  vessel_names: string[];
}

// ── Phase 4: Ecological Threat Assessment (Phase 5E) ─────────────────────────

export interface SensitiveHabitat {
  id: string;
  name: string;
  type: string;
  latitude: number;
  longitude: number;
  protection_status: string;
  impact_radius_km: number;
  source: string;
}

export interface HabitatImpact {
  habitat_id: string;
  habitat_name: string;
  type: string;
  latitude: number;
  longitude: number;
  impact_radius_km: number;
  minimum_distance_km: number;
  estimated_time_to_impact_hours?: number | null;
  threat_level: "HIGH" | "MEDIUM" | "LOW";
  reason: string;
  is_confirmed_impact: boolean;
}

export interface EcologicalAssessmentSummary {
  status: string;
  response_priority: "HIGH" | "MEDIUM" | "LOW";
  habitats_evaluated: number;
  threatened_habitats: number;
}

export interface EcologicalAssessment {
  assessment: EcologicalAssessmentSummary;
  impacts: HabitatImpact[];
  prototype_limitations: string[];
}

export interface EcologyRequest {
  forecast_trajectory: GeoTimestep[];
  habitats?: SensitiveHabitat[];
  spill_id?: string; // a live SPILL-LIVE-… id persists the result onto that record
}

// ── National Ramsar GIS Spatial Exposure Layer (Phase 5E Part 3) ─────────────

export interface RamsarThreatSite {
  site_name: string;
  state: string;
  threat_level: "DIRECT_THREAT" | "NEAR_THREAT" | "LOW_EXPOSURE" | "NO_SIGNIFICANT_EXPOSURE";
  exposure_basis: "CURRENT_OBSERVATION" | "FORECAST_INTERSECTION" | "PROXIMITY_ONLY" | "NO_EXPOSURE";
  minimum_distance_km: number;
  estimated_time_to_impact_hours?: number | null;
  intersection: boolean;
  area_hectares?: number | null;
  wetland_type?: string | null;
  status?: string | null;
  source_url?: string | null;
  geometry_type: "Polygon" | "MultiPolygon";
  centroid_lat: number;
  centroid_lon: number;
  reason: string;
}

export interface EcologicalExposureResponse {
  sites_analyzed: number;
  threats: RamsarThreatSite[];
  nearest_site?: RamsarThreatSite | null;
  direct_threats_count: number;
  near_threats_count: number;
  response_priority: "CRITICAL_ACTION" | "HIGH_PRIORITY" | "MONITORING" | "LOW";
  disclaimer: string;
}

export interface EcologicalExposureRequest {
  forecast_trajectory: GeoTimestep[];
}

// ── Unified Response ─────────────────────────────────────────────────────────

export interface InvestigationResponse {
  spill_id: string;
  detection: SpillDetection;
  drift: DriftAnalysis;
  attribution: VesselAttribution;
  ais_summary: AISSummary;
  ecology?: EcologicalAssessment;
  ecological_exposure?: EcologicalExposureResponse;

  // Set when the case is a live upload (SPILL-LIVE-…) rather than a bundled scenario
  is_live?: boolean;
  filename?: string | null;
  anchor_source?: "geotiff" | "manual" | "none" | null;
  georeference?: SceneGeoreference | null;
  overlay_image?: string | null;
}

export const LIVE_CASE_PREFIX = "SPILL-LIVE-";
export const isLiveCaseId = (id?: string | null) => !!id && id.startsWith(LIVE_CASE_PREFIX);

// ── Live Inference Response ──────────────────────────────────────────────────

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface PipelineStageInfo {
  stage_key: string;
  title: string;
  status: "complete" | "inputs_required" | "waiting" | "failed";
  status_label: string;
  summary: string;
  prerequisites: string[];
  missing_prerequisites: string[];
}

export interface AnalysisResponse {
  spill_id: string;
  filename: string;
  timestamp: string;
  dimensions: ImageDimensions;
  detection_count: number;
  status: string;
  pipeline_message: string;
  has_drift_and_attribution: boolean;
  detection: SpillDetection | null;
  all_detections: SpillDetection[];
  stages: PipelineStageInfo[];
  phase2_status: string;
  phase2_explanation: string;
  phase2_prerequisites: string[];
  phase3_status: string;
  phase3_explanation: string;
  phase3_prerequisites: string[];

  // Populated only when /analyze is called with a geographic scene anchor,
  // in which case the backend runs Phases 2-4 in the same request.
  drift?: DriftAnalysis | null;
  attribution?: VesselAttribution | null;
  ecology?: EcologicalAssessment | null;
  ecological_exposure?: EcologicalExposureResponse | null;
  chain_error?: string | null;

  // Scene geolocation read from a GeoTIFF upload (null for plain PNG/JPEG)
  georeference?: SceneGeoreference | null;
  anchor_source?: "geotiff" | "manual" | "none";

  // Inference-resolution previews as JPEG data URLs
  preview_image?: string | null;
  overlay_image?: string | null; // masks painted onto the scene
}

// ── Model card (read from the checkpoint) ────────────────────────────────────

export interface ModelEpochRow {
  epoch: number;
  mask_map50?: number | null;
  mask_precision?: number | null;
  mask_recall?: number | null;
  box_map50?: number | null;
  train_seg_loss?: number | null;
  val_seg_loss?: number | null;
}

export interface ModelMetrics {
  model_file: string;
  architecture: string;
  task: string;
  ultralytics_version: string;
  trained_at: string;
  epochs: number;
  image_size: number;
  batch_size: number;
  optimizer: string;
  dataset: string;
  pretrained: boolean;
  seed: number;
  box_precision?: number | null;
  box_recall?: number | null;
  box_map50?: number | null;
  box_map50_95?: number | null;
  mask_precision?: number | null;
  mask_recall?: number | null;
  mask_map50?: number | null;
  mask_map50_95?: number | null;
  fitness?: number | null;
  history: ModelEpochRow[];
  caveats: string[];
}

export async function fetchModelMetrics(): Promise<ModelMetrics> {
  const res = await fetch(`${BACKEND}/api/investigations/model/metrics`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch model metrics: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<ModelMetrics>;
}

// ── Demo scenarios served by GET /api/investigations/{id} ────────────────────

export interface DemoCase {
  id: string;
  label: string; // short button label
  headline: string; // what the scenario demonstrates
  accent: "amber" | "indigo" | "red" | "emerald";
}

export const DEMO_CASES: DemoCase[] = [
  {
    id: "SPILL-001",
    label: "SPILL-001",
    headline: "Baseline — MV OCEAN STAR caught on AIS at the origin with a 79% speed drop",
    accent: "amber",
  },
  {
    id: "SPILL-TEST-002",
    label: "SCENARIO 2",
    headline: "Multi-vessel validation — MV WESTERN PEARL against six decoys",
    accent: "indigo",
  },
  {
    id: "SPILL-TEST-003",
    label: "SCENARIO 3 · DARK",
    headline: "Dark vessel — MT JALDHARA went silent for 3 h across the discharge time",
    accent: "red",
  },
];

/** The switchable case list: an optional live upload first, then the bundled scenarios. */
export function buildCaseList(liveCaseId?: string | null, liveFilename?: string | null): DemoCase[] {
  if (!isLiveCaseId(liveCaseId)) return DEMO_CASES;
  return [
    {
      id: liveCaseId as string,
      label: "LIVE CASE",
      headline: `Your live upload${liveFilename ? ` — ${liveFilename}` : ""}`,
      accent: "emerald",
    },
    ...DEMO_CASES,
  ];
}

export function nextDemoCase(currentId: string, cases: DemoCase[] = DEMO_CASES): DemoCase {
  const idx = cases.findIndex((c) => c.id === currentId);
  return cases[(idx + 1) % cases.length];
}

// ── Fetchers ──────────────────────────────────────────────────────────────────

export async function fetchInvestigation(
  spillId: string
): Promise<InvestigationResponse> {
  const res = await fetch(`${BACKEND}/api/investigations/${spillId}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(
      `Failed to fetch investigation ${spillId}: ${res.status} ${res.statusText}`
    );
  }
  return res.json() as Promise<InvestigationResponse>;
}

export async function fetchLiveInvestigation(
  spillId: string
): Promise<AnalysisResponse> {
  const res = await fetch(`${BACKEND}/api/investigations/live/${spillId}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(
      `Failed to fetch live investigation ${spillId}: ${res.status} ${res.statusText}`
    );
  }
  return res.json() as Promise<AnalysisResponse>;
}

export interface DriftRequest {
  spill_id: string;
  latitude: number;
  longitude: number;
  timestamp: string;
  coordinate_source?: string;
}

export interface SceneAnchor {
  latitude: number;
  longitude: number;
  timestamp?: string;
}

/**
 * Runs Phase 1 segmentation on an uploaded scene.
 *
 * Pass `anchor` to have the backend also run Phases 2-4 (drift, AIS attribution,
 * ecological exposure) in the same request — results arrive on the `drift`,
 * `attribution`, and `ecology` fields. Omit it for a Phase 1-only analysis.
 */
export async function analyzeSpillImage(
  file: File,
  anchor?: SceneAnchor
): Promise<AnalysisResponse> {
  const formData = new FormData();
  formData.append("file", file);
  if (anchor) {
    formData.append("latitude", String(anchor.latitude));
    formData.append("longitude", String(anchor.longitude));
    if (anchor.timestamp) formData.append("timestamp", anchor.timestamp);
  }

  const res = await fetch(`${BACKEND}/api/investigations/analyze`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    let errorDetail = `${res.status} ${res.statusText}`;
    try {
      const errJson = await res.json();
      if (errJson.detail) errorDetail = errJson.detail;
    } catch {
      // ignore
    }
    throw new Error(`Inference failed: ${errorDetail}`);
  }

  return res.json() as Promise<AnalysisResponse>;
}

// ── Live pipeline telemetry (Server-Sent Events) ─────────────────────────────

export type PipelineLevel = "info" | "warn" | "error" | "success";

/** One real milestone emitted by the backend as the pipeline executes. */
export interface PipelineStageEvent {
  type: "stage";
  key: string;
  label: string;
  message: string;
  detail?: string | null;
  elapsed_ms: number;
  /** 0–1, present on stages that report incremental progress (tiled inference). */
  progress?: number;
  level?: PipelineLevel;
  /** When set, this line supersedes the previous line with the same key. */
  replaces?: string;
}

export type PipelineEvent =
  | { type: "open" }
  | PipelineStageEvent
  | { type: "result"; data: AnalysisResponse }
  | { type: "error"; message: string };

/**
 * Runs the analysis with live telemetry.
 *
 * Streams real backend milestones — each one timed server-side and carrying values read
 * back off the stage that produced it — then resolves with the finished AnalysisResponse.
 * `onEvent` is called for every stage as it arrives.
 */
export async function analyzeSpillImageStream(
  file: File,
  anchor: SceneAnchor | undefined,
  onEvent: (event: PipelineStageEvent) => void,
  signal?: AbortSignal
): Promise<AnalysisResponse> {
  const formData = new FormData();
  formData.append("file", file);
  if (anchor) {
    formData.append("latitude", String(anchor.latitude));
    formData.append("longitude", String(anchor.longitude));
    if (anchor.timestamp) formData.append("timestamp", anchor.timestamp);
  }

  const res = await fetch(`${BACKEND}/api/investigations/analyze/stream`, {
    method: "POST",
    body: formData,
    signal,
  });

  if (!res.ok || !res.body) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const errJson = await res.json();
      if (errJson.detail) detail = errJson.detail;
    } catch {
      // response wasn't JSON — keep the status line
    }
    throw new Error(detail);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: AnalysisResponse | null = null;
  let failure: string | null = null;

  const consume = (raw: string) => {
    // SSE frames are separated by a blank line; we only emit single `data:` lines.
    for (const line of raw.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload) continue;

      let event: PipelineEvent;
      try {
        event = JSON.parse(payload) as PipelineEvent;
      } catch {
        continue; // ignore a malformed frame rather than killing the run
      }

      if (event.type === "stage") onEvent(event);
      else if (event.type === "result") result = event.data;
      else if (event.type === "error") failure = event.message;
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let split = buffer.indexOf("\n\n");
    while (split !== -1) {
      consume(buffer.slice(0, split));
      buffer = buffer.slice(split + 2);
      split = buffer.indexOf("\n\n");
    }
  }
  if (buffer.trim()) consume(buffer);

  if (failure) throw new Error(failure);
  if (!result) throw new Error("Pipeline stream ended without returning a result.");
  return result;
}

export async function runDriftReconstruction(
  req: DriftRequest
): Promise<DriftAnalysis> {
  const res = await fetch(`${BACKEND}/api/investigations/drift`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(req),
  });

  if (!res.ok) {
    let errorDetail = `${res.status} ${res.statusText}`;
    try {
      const errJson = await res.json();
      if (errJson.detail) errorDetail = errJson.detail;
    } catch {
      // ignore
    }
    throw new Error(`Drift reconstruction failed: ${errorDetail}`);
  }

  return res.json() as Promise<DriftAnalysis>;
}

export interface AISCorrelationRequest {
  spill_id: string;
  origin: {
    latitude: number;
    longitude: number;
    timestamp: string;
  };
  max_distance_km?: number;
  max_time_window_hours?: number;
  // Pass drift.ensemble.hindcast_steps.at(-1).ellipses so candidates get an origin_band tag
  origin_ellipses?: EnsembleEllipse[];
}

export async function runAISCorrelation(
  req: AISCorrelationRequest
): Promise<VesselAttribution> {
  const res = await fetch(`${BACKEND}/api/investigations/ais`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(req),
  });

  if (!res.ok) {
    let errorDetail = `${res.status} ${res.statusText}`;
    try {
      const errJson = await res.json();
      if (errJson.detail) errorDetail = errJson.detail;
    } catch {
      // ignore
    }
    throw new Error(`AIS correlation failed: ${errorDetail}`);
  }

  return res.json() as Promise<VesselAttribution>;
}

export async function runEcologicalAssessment(
  req: EcologyRequest
): Promise<EcologicalAssessment> {
  const res = await fetch(`${BACKEND}/api/investigations/ecology`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(req),
  });

  if (!res.ok) {
    let errorDetail = `${res.status} ${res.statusText}`;
    try {
      const errJson = await res.json();
      if (errJson.detail) errorDetail = errJson.detail;
    } catch {
      // ignore
    }
    throw new Error(`Ecological assessment failed: ${errorDetail}`);
  }

  return res.json() as Promise<EcologicalAssessment>;
}

export async function runEcologicalExposure(
  req: EcologicalExposureRequest
): Promise<EcologicalExposureResponse> {
  const res = await fetch(`${BACKEND}/api/investigations/ecological-exposure`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(req),
  });

  if (!res.ok) {
    let errorDetail = `${res.status} ${res.statusText}`;
    try {
      const errJson = await res.json();
      if (errJson.detail) errorDetail = errJson.detail;
    } catch {
      // ignore
    }
    throw new Error(`Ramsar ecological exposure calculation failed: ${errorDetail}`);
  }

  return res.json() as Promise<EcologicalExposureResponse>;
}

export interface GeoJSONFeatureCollection {
  type: string;
  features: Array<{
    type: string;
    geometry: unknown;
    properties?: Record<string, unknown>;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

export async function fetchRamsarGeoJSON(): Promise<GeoJSONFeatureCollection> {
  const res = await fetch(`${BACKEND}/api/investigations/ramsar-geojson`);
  if (!res.ok) {
    throw new Error(`Failed to fetch Ramsar GeoJSON: ${res.statusText}`);
  }
  return res.json() as Promise<GeoJSONFeatureCollection>;
}
