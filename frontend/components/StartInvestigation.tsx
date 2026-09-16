"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useState, useRef, useMemo, ChangeEvent, DragEvent } from "react";
import {
  analyzeSpillImageStream,
  runDriftReconstruction,
  runAISCorrelation,
  runEcologicalAssessment,
  type AnalysisResponse,
  type CandidateVessel,
  type DriftAnalysis,
  type EcologicalAssessment,
  type InvestigationResponse,
  type PipelineStageEvent,
  type PipelineStageInfo,
  type VesselAttribution,
} from "@/lib/api";

import {
  Droplets,
  FileImage,
  MapPin,
  Satellite,
  Ship,
  TriangleAlert,
  Waves,
  Zap,
} from "lucide-react";

import ModelMetricsPanel from "@/components/ModelMetricsPanel";
import DossierButton from "@/components/DossierButton";
import PipelineHUD from "@/components/PipelineHUD";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";

// Leaflet map component (client-only, SSR-safe)
const SpillMap = dynamic(() => import("@/components/SpillMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-80 flex items-center justify-center bg-paper-alt rounded-xs text-ink-soft text-xs font-mono tracking-wider border border-grid">
      Loading interactive geospatial map…
    </div>
  ),
});

const STAGE_BADGE_STYLE: Record<string, string> = {
  complete: "bg-paper text-safe border-grid font-semibold",
  inputs_required: "bg-paper text-pending border-grid font-semibold",
  waiting: "bg-paper-alt text-ink-soft border-grid font-normal",
  failed: "bg-paper text-hazard border-hazard font-semibold",
};

const UPLOAD_STEPS = [
  { n: "01", t: "Segment", d: "YOLOv8 finds and measures every slick in the scene." },
  { n: "02", t: "Locate", d: "A GeoTIFF georeferences itself; a plain image asks you for the anchor." },
  { n: "03", t: "Reconstruct", d: "Drift runs backwards 6 h with a 500-particle uncertainty ensemble." },
  { n: "04", t: "Attribute", d: "AIS traffic is scored against the origin and ranked with its evidence." },
];

const RISK_BADGE: Record<string, string> = {
  HIGH: "bg-paper text-hazard border-hazard font-bold",
  MEDIUM: "bg-paper text-pending border-pending font-bold",
  LOW: "bg-paper text-ink-soft border-grid font-normal",
};

export default function StartInvestigation() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showRawScene, setShowRawScene] = useState(false);
  const [pipelineEvents, setPipelineEvents] = useState<PipelineStageEvent[]>([]);
  const [pipelineSummary, setPipelineSummary] = useState<string | null>(null);

  // Phase 2 Drift State
  const [latitude, setLatitude] = useState<string>("19.070667");
  const [longitude, setLongitude] = useState<string>("72.968941");
  const [timestamp, setTimestamp] = useState<string>(new Date().toISOString().slice(0, 19) + "Z");
  const [isDrifting, setIsDrifting] = useState(false);
  const [driftResult, setDriftResult] = useState<DriftAnalysis | null>(null);
  const [driftError, setDriftError] = useState<string | null>(null);

  // Phase 3 AIS Attribution State
  const [isCorrelating, setIsCorrelating] = useState(false);
  const [aisResult, setAisResult] = useState<VesselAttribution | null>(null);
  const [aisError, setAisError] = useState<string | null>(null);
  const [selectedVesselId, setSelectedVesselId] = useState<string | null>(null);

  // Phase 4 Ecological Impact State
  const [ecologyResult, setEcologyResult] = useState<EcologicalAssessment | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadSectionRef = useRef<HTMLDivElement>(null);

  const handleFileSelect = (selectedFile: File) => {
    if (
      !selectedFile.type.startsWith("image/") &&
      !selectedFile.name.endsWith(".tif") &&
      !selectedFile.name.endsWith(".tiff")
    ) {
      alert("Please upload a valid image file (PNG, JPG, or GeoTIFF).");
      return;
    }
    setFile(selectedFile);
    setAnalysisResult(null);
    setDriftResult(null);
    setAisResult(null);
    setSelectedVesselId(null);
    setErrorMessage(null);
    setDriftError(null);
    setAisError(null);

    if (selectedFile.type.startsWith("image/")) {
      const url = URL.createObjectURL(selectedFile);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }
  };

  const onFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelect(e.target.files[0]);
    }
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  /** Appends a telemetry line, or updates in place when the stage supersedes itself. */
  const pushPipelineEvent = (event: PipelineStageEvent) => {
    setPipelineEvents((prev) => {
      if (event.replaces) {
        const from = prev.length - 1;
        for (let i = from; i >= 0; i--) {
          if (prev[i].key === event.replaces) {
            const next = [...prev];
            next[i] = event;
            return next;
          }
        }
      }
      return [...prev, event];
    });
  };

  const handleAnalyzeClick = async () => {
    if (!file) return;

    setIsAnalyzing(true);
    setErrorMessage(null);
    setDriftResult(null);
    setAisResult(null);
    setSelectedVesselId(null);
    setPipelineEvents([]);
    setPipelineSummary(null);

    try {
      const result = await analyzeSpillImageStream(file, undefined, pushPipelineEvent);
      setAnalysisResult(result);
      setPipelineSummary(
        result.attribution?.candidate_vessels[0]
          ? `${result.spill_id} — primary suspect ${result.attribution.candidate_vessels[0].vessel_name} (MMSI ${result.attribution.candidate_vessels[0].vessel_id}) at ${result.attribution.candidate_vessels[0].score}/100`
          : `${result.spill_id} — ${result.detection_count} slick region(s) detected`
      );
      if (result.timestamp) {
        setTimestamp(result.timestamp);
      }

      if (result.anchor_source === "geotiff" && result.detection?.centroid.lat != null && result.detection.centroid.lon != null) {
        setLatitude(result.detection.centroid.lat.toFixed(6));
        setLongitude(result.detection.centroid.lon.toFixed(6));
      }
      if (result.drift) setDriftResult(result.drift);
      if (result.ecology) setEcologyResult(result.ecology);
      if (result.attribution) {
        setAisResult(result.attribution);
        setSelectedVesselId(result.attribution.candidate_vessels[0]?.vessel_id ?? null);
      }
      if (result.chain_error) setDriftError(result.chain_error);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Inference failed";
      setErrorMessage(message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleRunDrift = async () => {
    if (!analysisResult) return;
    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);

    if (isNaN(lat) || lat < -90 || lat > 90) {
      setDriftError("Please enter a valid latitude between -90.0 and 90.0");
      return;
    }
    if (isNaN(lon) || lon < -180 || lon > 180) {
      setDriftError("Please enter a valid longitude between -180.0 and 180.0");
      return;
    }

    setIsDrifting(true);
    setDriftError(null);
    setAisResult(null);
    setSelectedVesselId(null);

    try {
      const res = await runDriftReconstruction({
        spill_id: analysisResult.spill_id,
        latitude: lat,
        longitude: lon,
        timestamp: timestamp || new Date().toISOString(),
        coordinate_source: "investigator_scene_anchor",
      });
      setDriftResult(res);

      try {
        const eco = await runEcologicalAssessment({
          forecast_trajectory: res.forecast.trajectory,
          spill_id: analysisResult.spill_id,
        });
        setEcologyResult(eco);
      } catch {
        // non-blocking
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Drift calculation failed";
      setDriftError(message);
    } finally {
      setIsDrifting(false);
    }
  };

  const handleRunAIS = async () => {
    if (!analysisResult || !driftResult) return;

    setIsCorrelating(true);
    setAisError(null);

    try {
      const res = await runAISCorrelation({
        spill_id: analysisResult.spill_id,
        estimated_origin: driftResult.hindcast.estimated_origin,
        discharge_window: {
          start_time: new Date(
            new Date(driftResult.hindcast.estimated_origin.timestamp).getTime() - 2 * 3600 * 1000
          ).toISOString(),
          end_time: new Date(
            new Date(driftResult.hindcast.estimated_origin.timestamp).getTime() + 2 * 3600 * 1000
          ).toISOString(),
        },
      });
      setAisResult(res);
      if (res.candidate_vessels.length > 0) {
        setSelectedVesselId(res.candidate_vessels[0].vessel_id);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "AIS correlation failed";
      setAisError(message);
    } finally {
      setIsCorrelating(false);
    }
  };

  const handlePreFillMumbai = () => {
    setLatitude("18.952000");
    setLongitude("72.821000");
    setTimestamp(new Date(Date.now() - 6 * 3600 * 1000).toISOString().slice(0, 19) + "Z");
    setDriftError(null);
  };

  const handleReset = () => {
    setFile(null);
    setPreviewUrl(null);
    setAnalysisResult(null);
    setDriftResult(null);
    setAisResult(null);
    setEcologyResult(null);
    setSelectedVesselId(null);
    setPipelineEvents([]);
    setPipelineSummary(null);
    setErrorMessage(null);
    setDriftError(null);
    setAisError(null);
  };

  // Selected candidate vessel (defaults to top candidate)
  const selectedVessel = useMemo(() => {
    if (!aisResult || aisResult.candidate_vessels.length === 0) return null;
    if (!selectedVesselId) return aisResult.candidate_vessels[0];
    return (
      aisResult.candidate_vessels.find((v) => v.vessel_id === selectedVesselId) ||
      aisResult.candidate_vessels[0]
    );
  }, [aisResult, selectedVesselId]);

  // Combined Investigation Object for Leaflet Map
  const liveMapData: InvestigationResponse | null = useMemo(() => {
    if (!analysisResult?.detection || !driftResult || !aisResult) return null;
    return {
      spill_id: analysisResult.spill_id,
      detection: analysisResult.detection,
      drift: driftResult,
      attribution: aisResult,
      ais_summary: {
        total_records: 495,
        unique_vessels: aisResult.candidate_vessels.length,
        columns: ["MMSI", "vessel_name", "timestamp", "latitude", "longitude", "SOG_knots", "COG_degrees", "heading_degrees"],
        vessel_names: aisResult.candidate_vessels.map((v) => v.vessel_name),
      },
      ecology: ecologyResult || undefined,
    };
  }, [analysisResult, driftResult, aisResult, ecologyResult]);

  // Dynamic Pipeline Stages
  const stages: PipelineStageInfo[] = analysisResult
    ? analysisResult.stages.map((stg) => {
        if (aisResult) {
          if (stg.stage_key === "origin_reconstruction") {
            return {
              ...stg,
              status: "complete" as const,
              status_label: "ORIGIN RECONSTRUCTED",
            };
          }
          if (stg.stage_key === "ais_correlation") {
            return {
              ...stg,
              status: "complete" as const,
              status_label: `${aisResult.candidate_vessels.length} VESSELS CORRELATED`,
              summary: `Correlated AIS telemetry across ${aisResult.candidate_vessels.length} vessels in the origin corridor.`,
            };
          }
          if (stg.stage_key === "vessel_attribution") {
            const top = aisResult.candidate_vessels[0];
            return {
              ...stg,
              status: "complete" as const,
              status_label: "SUSPECTS RANKED",
              summary: `Top ranked: ${top ? top.vessel_name : "None"} (${top ? top.score : 0}/100 - ${top ? top.risk : "LOW"})`,
            };
          }
        } else if (driftResult) {
          if (stg.stage_key === "origin_reconstruction") {
            return {
              ...stg,
              status: "complete" as const,
              status_label: "RECONSTRUCTED",
              summary: `Estimated Origin: (${driftResult.hindcast.estimated_origin.lat.toFixed(4)}°N, ${driftResult.hindcast.estimated_origin.lon.toFixed(4)}°E) at ${driftResult.hindcast.estimated_origin.hours_before_observation}h before observation.`,
            };
          }
          if (stg.stage_key === "ais_correlation") {
            return {
              ...stg,
              status: "inputs_required" as const,
              status_label: "READY FOR AIS INGESTION",
              summary: "Origin corridor reconstructed. Ready to correlate with spatio-temporal AIS vessel telemetry stream.",
            };
          }
        }
        return stg;
      })
    : [];

  return (
    <div className="min-h-screen bg-paper text-ink font-body cartographic-grid flex flex-col selection:bg-ink selection:text-paper">
      <SiteNav />

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 pt-28 sm:pt-32 pb-16">
        {/* Page header (upload state only) */}
        {!analysisResult && (
          <div className="mb-9 text-center max-w-2xl mx-auto">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-grid bg-paper-alt text-ink-soft text-[11px] font-mono font-semibold uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" />
              New investigation
            </div>
            <h1 className="mt-5 text-3xl sm:text-4xl font-display font-black tracking-tight text-ink">
              Upload a satellite scene
            </h1>
            <p className="mt-3 text-sm text-ink-soft leading-relaxed">
              A georeferenced GeoTIFF runs the entire chain in one request — detection, origin
              reconstruction, vessel attribution and ecological screening. A plain PNG or JPEG runs
              detection first, then asks you where the scene is.
            </p>
          </div>
        )}

        {/* Start Investigation Upload Zone / Live Console */}
        <div ref={uploadSectionRef} id="upload-section">
          {analysisResult ? (
            /* Live Investigation Console */
            <div className="rounded-xs border border-grid bg-paper-alt/30 backdrop-blur-xs p-6 sm:p-8 space-y-8 shadow-xs">
              {/* Live Investigation Header */}
              <div className="border-b border-grid pb-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <span className="px-2.5 py-0.5 rounded-xs text-[11px] font-mono font-bold bg-paper border border-grid text-ink uppercase tracking-wider">
                        LIVE INVESTIGATION
                      </span>
                      <span className="text-xs text-ink-soft font-mono">
                        Source: {analysisResult.filename} ({analysisResult.dimensions.width}×{analysisResult.dimensions.height} px)
                      </span>
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-display font-black text-ink mt-1.5 tracking-tight">
                      {analysisResult.spill_id}
                    </h2>
                    <p className="text-xs text-ink-soft mt-1">
                      Results computed in real time from this uploaded SAR/EO satellite scene.
                    </p>
                  </div>

                    <span className={`px-3 py-1 rounded-xs text-xs font-mono font-black border tracking-wider self-start sm:self-auto flex items-center gap-1.5 ${
                    analysisResult.status === "spill_detected"
                      ? "bg-hazard/10 text-hazard border-hazard/40"
                      : "bg-safe/10 text-safe border-safe/30"
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                      analysisResult.status === "spill_detected" ? "bg-hazard" : "bg-safe"
                    }`} />
                    {analysisResult.status === "spill_detected"
                      ? "⚠ SPILL DETECTED"
                      : "✓ NO SPILL DETECTED"}
                  </span>
                </div>

                {/* Pipeline Status Strip */}
                <div className="mt-5 p-3.5 rounded-xs bg-paper border border-grid overflow-x-auto">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 text-xs">
                    {stages.map((stg: PipelineStageInfo, idx: number) => (
                      <div key={stg.stage_key} className="flex items-center gap-2 flex-none">
                        <span
                          className={`px-2.5 py-1 rounded-xs border text-[11px] font-mono tracking-wide ${
                            STAGE_BADGE_STYLE[stg.status] || STAGE_BADGE_STYLE.waiting
                          }`}
                        >
                          {stg.status_label}
                        </span>
                        {idx < stages.length - 1 && (
                          <span className="text-grid-strong hidden sm:inline">→</span>
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-ink-soft mt-2 font-medium">
                    From satellite detection to vessel attribution, each stage adds independent physical and analytical evidence.
                  </p>
                </div>
              </div>

              {/* STAGE 01 — DETECT */}
              <div className="p-6 rounded-xs border border-grid bg-paper space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-grid pb-3">
                  <div>
                    <h3 className="text-base font-display font-bold text-ink flex items-center gap-2">
                      <span className="w-5 h-5 bg-ink text-paper text-xs flex items-center justify-center font-mono rounded-xs">01</span>
                      <span>DETECT &amp; CHARACTERISE</span>
                    </h3>
                    <p className="text-xs text-ink-soft mt-0.5">
                      YOLOv8 instance segmentation neural network identifies and characterises the visible oil slick.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    {liveMapData && <DossierButton data={liveMapData} />}
                    <span className="text-[11px] font-mono text-safe font-bold bg-safe/10 px-2 py-0.5 rounded-xs border border-safe/30">
                      Phase 1 Complete
                    </span>
                  </div>
                </div>

                {/* Pipeline HUD */}
                {pipelineEvents.length > 0 && (
                  <PipelineHUD
                    events={pipelineEvents}
                    running={false}
                    summary={pipelineSummary}
                    error={null}
                  />
                )}

                <ModelMetricsPanel compact />

                {/* Scene preview with mask */}
                {(analysisResult.overlay_image || analysisResult.preview_image) && (
                  <div className="rounded-xs border border-grid bg-paper overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-grid text-[11px] font-mono">
                      <span className="text-ink font-bold">
                        {showRawScene || !analysisResult.overlay_image ? "RAW SCENE" : "SEGMENTATION MASK OVERLAY"}
                        <span className="text-ink-soft font-normal"> · {analysisResult.dimensions.width}×{analysisResult.dimensions.height} px inference frame</span>
                      </span>
                      {analysisResult.overlay_image && (
                        <button
                          type="button"
                          onClick={() => setShowRawScene((v) => !v)}
                          className="px-2 py-0.5 rounded-xs bg-paper-alt hover:bg-paper text-ink border border-grid cursor-pointer"
                        >
                          {showRawScene ? "Show mask" : "Show raw"}
                        </button>
                      )}
                    </div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={(showRawScene ? analysisResult.preview_image : analysisResult.overlay_image) ?? analysisResult.preview_image ?? ""}
                      alt="Analysed scene"
                      className="w-full max-h-[440px] object-contain bg-black"
                    />
                    {(analysisResult.georeference || analysisResult.detection?.bonn_volume) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 border-t border-grid text-[11px] font-mono">
                        {analysisResult.georeference && (
                          <div className="p-2.5 rounded-xs bg-paper-alt border border-grid text-ink">
                            <div className="font-bold text-safe flex items-center gap-1.5"><MapPin size={12} strokeWidth={1.75} />AUTO-GEOREFERENCED FROM GEOTIFF</div>
                            <div className="text-ink-soft mt-0.5">
                              {analysisResult.georeference.crs} · {analysisResult.georeference.gsd_m} m/px native · {analysisResult.georeference.width}×{analysisResult.georeference.height} px scene
                              {analysisResult.georeference.inference_scale > 1 && <> · inferred at 1/{analysisResult.georeference.inference_scale.toFixed(2)}</>}
                            </div>
                            {analysisResult.detection?.centroid.lat != null && (
                              <div className="text-ink mt-0.5 font-semibold">
                                Slick centroid {analysisResult.detection.centroid.lat.toFixed(5)}°N, {analysisResult.detection.centroid.lon?.toFixed(5)}°E
                                {analysisResult.georeference.timestamp && <> · acquired {analysisResult.georeference.timestamp.slice(0, 16).replace("T", " ")}Z</>}
                              </div>
                            )}
                          </div>
                        )}
                        {analysisResult.detection?.bonn_volume && (
                          <div className="p-2.5 rounded-xs bg-paper-alt border border-grid text-ink">
                            <div className="font-bold text-ink flex items-center gap-1.5"><Droplets size={12} strokeWidth={1.75} />ESTIMATED VOLUME (BONN AGREEMENT)</div>
                            <div className="text-ink text-base font-bold mt-0.5">
                              {analysisResult.detection.bonn_volume.volume_tonnes_min.toLocaleString()}–{analysisResult.detection.bonn_volume.volume_tonnes_max.toLocaleString()} t
                              <span className="text-ink-soft text-[10px] font-normal ml-1.5">({analysisResult.detection.bonn_volume.volume_m3_min}–{analysisResult.detection.bonn_volume.volume_m3_max} m³)</span>
                            </div>
                            <div className="text-ink-soft mt-0.5">
                              Code {analysisResult.detection.bonn_volume.appearance_code} “{analysisResult.detection.bonn_volume.appearance_label}” · {analysisResult.detection.bonn_volume.thickness_um_min}–{analysisResult.detection.bonn_volume.thickness_um_max} µm
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {analysisResult.detection ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                    <div className="p-3 rounded-xs bg-paper border border-grid">
                      <p className="text-[10px] text-ink-soft uppercase font-bold tracking-wider">
                        Detection Confidence
                      </p>
                      <p className="text-2xl font-bold text-safe mt-1">
                        {(analysisResult.detection.confidence * 100).toFixed(1)}%
                      </p>
                      <p className="text-[10px] text-ink-soft mt-0.5">
                        YOLOv8-seg inference
                      </p>
                    </div>

                    <div className="p-3 rounded-xs bg-paper border border-grid">
                      <p className="text-[10px] text-ink-soft uppercase font-bold tracking-wider">
                        Estimated Area
                      </p>
                      <p className="text-2xl font-bold text-ink mt-1">
                        {analysisResult.detection.area.km2.toFixed(3)}{" "}
                        <span className="text-xs font-normal text-ink-soft">km²</span>
                      </p>
                      <p className="text-[10px] text-ink-soft mt-0.5">
                        {analysisResult.detection.area.pixels.toLocaleString()} px (10m GSD)
                      </p>
                    </div>

                    <div className="p-3 rounded-xs bg-paper border border-grid">
                      <p className="text-[10px] text-ink-soft uppercase font-bold tracking-wider">
                        Perimeter &amp; Shape
                      </p>
                      <p className="text-xl font-bold text-ink mt-1">
                        {analysisResult.detection.perimeter.km.toFixed(2)} km
                      </p>
                      <p className="text-[10px] text-ink-soft mt-0.5">
                        Elongation: {analysisResult.detection.elongation_ratio.toFixed(2)}
                      </p>
                    </div>

                    <div className="p-3 rounded-xs bg-paper border border-grid">
                      <p className="text-[10px] text-ink-soft uppercase font-bold tracking-wider">
                        Weathering Category
                      </p>
                      <p className="text-xl font-bold text-ink uppercase mt-1">
                        {analysisResult.detection.age_estimate.category}
                      </p>
                      <p className="text-[10px] text-ink-soft mt-0.5">
                        Edge Density: {analysisResult.detection.age_estimate.edge_density}
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* STAGE 02 — TRACE */}
              <div className="p-6 rounded-xs border border-grid bg-paper space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-grid pb-3">
                  <div>
                    <h3 className="text-base font-display font-bold text-ink flex items-center gap-2">
                      <span className="w-5 h-5 bg-ink text-paper text-xs flex items-center justify-center font-mono rounded-xs">02</span>
                      <span>LAGRANGIAN DRIFT RECONSTRUCTION</span>
                    </h3>
                    <p className="text-xs text-ink-soft mt-0.5">
                      Backward hydrodynamic drift reconstruction estimates where the slick may have originated.
                    </p>
                  </div>
                  {driftResult ? (
                    <span className="text-[11px] font-mono text-safe font-bold bg-safe/10 px-2 py-0.5 rounded-xs border border-safe/30 self-start sm:self-auto">
                      Phase 2 Complete
                    </span>
                  ) : (
                    <span className="text-[11px] font-mono text-pending font-bold bg-pending/10 px-2 py-0.5 rounded-xs border border-pending/30 self-start sm:self-auto">
                      Input Required
                    </span>
                  )}
                </div>

                {driftResult ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono">
                      <div className="p-3.5 rounded-xs bg-paper border border-grid">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-ink-soft uppercase font-bold tracking-wider">
                            Estimated Origin
                          </span>
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-xs bg-pending/10 text-pending border border-pending/30">
                            ESTIMATED
                          </span>
                        </div>
                        <p className="text-xl font-bold text-ink mt-1">
                          {driftResult.hindcast.estimated_origin.lat.toFixed(4)}°N, {driftResult.hindcast.estimated_origin.lon.toFixed(4)}°E
                        </p>
                        <p className="text-[10px] text-ink-soft mt-0.5">
                          6.0h prior to observation
                        </p>
                      </div>

                      <div className="p-3.5 rounded-xs bg-paper border border-grid">
                        <span className="text-[10px] text-ink-soft uppercase font-bold tracking-wider block">
                          Combined Drift Velocity
                        </span>
                        <p className="text-xl font-bold text-ink mt-1">
                          {driftResult.environment.drift.speed_ms.toFixed(4)} m/s
                        </p>
                        <p className="text-[10px] text-ink-soft mt-0.5">
                          u={driftResult.environment.drift.u_ms} m/s, v={driftResult.environment.drift.v_ms} m/s
                        </p>
                      </div>

                      <div className="p-3.5 rounded-xs bg-paper border border-grid">
                        <span className="text-[10px] text-ink-soft uppercase font-bold tracking-wider block">
                          6h Forecast Endpoint
                        </span>
                        <p className="text-xl font-bold text-safe mt-1">
                          {driftResult.forecast.forecast_endpoint.lat.toFixed(4)}°N, {driftResult.forecast.forecast_endpoint.lon.toFixed(4)}°E
                        </p>
                        <p className="text-[10px] text-ink-soft mt-0.5">
                          Forward trajectory prediction
                        </p>
                      </div>
                    </div>

                    <div className="text-[11px] text-ink-soft bg-paper-alt/50 p-3 rounded-xs border border-grid font-mono">
                      <strong className="text-ink">Hydrodynamic Context:</strong> Surface currents ({driftResult.environment.current.u_ms}, {driftResult.environment.current.v_ms} m/s) and wind vectors ({driftResult.environment.wind.u_ms}, {driftResult.environment.wind.v_ms} m/s)
                      {driftResult.environment.source === "open_meteo" ? (
                        <> from <span className="text-safe font-semibold">{driftResult.environment.provider_detail}</span>, valid {driftResult.environment.valid_time}.</>
                      ) : (
                        <> via regional fallback ({driftResult.environment.source}).</>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <p className="text-xs text-ink-soft">
                        {analysisResult?.anchor_source === "geotiff" ? (
                          <><span className="text-safe font-semibold">Anchor auto-filled from GeoTIFF georeference</span> — adjust only if needed:</>
                        ) : (
                          <>Scene has no embedded georeference. Enter observation coordinates and timestamp to resolve hydrodynamic forcing:</>
                        )}
                      </p>
                      <button
                        type="button"
                        onClick={handlePreFillMumbai}
                        className="text-xs font-mono font-medium px-3 py-1 rounded-xs bg-paper hover:bg-paper-alt text-ink border border-grid transition-colors cursor-pointer self-start sm:self-auto"
                      >
                        <MapPin size={12} className="inline mr-1 -mt-0.5 text-ink-soft" />
                        Pre-fill Offshore Mumbai Anchor
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs">
                      <div>
                        <label className="block text-[11px] text-ink-soft font-bold mb-1">
                          Observation Latitude (°N)
                        </label>
                        <input
                          type="text"
                          value={latitude}
                          onChange={(e) => setLatitude(e.target.value)}
                          placeholder="e.g. 19.070667"
                          className="w-full px-3 py-2 rounded-xs bg-paper border border-grid text-ink font-mono text-xs focus:outline-none focus:border-grid-strong"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] text-ink-soft font-bold mb-1">
                          Observation Longitude (°E)
                        </label>
                        <input
                          type="text"
                          value={longitude}
                          onChange={(e) => setLongitude(e.target.value)}
                          placeholder="e.g. 72.968941"
                          className="w-full px-3 py-2 rounded-xs bg-paper border border-grid text-ink font-mono text-xs focus:outline-none focus:border-grid-strong"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] text-ink-soft font-bold mb-1">
                          Observation Timestamp (UTC)
                        </label>
                        <input
                          type="text"
                          value={timestamp}
                          onChange={(e) => setTimestamp(e.target.value)}
                          placeholder="YYYY-MM-DDTHH:MM:SSZ"
                          className="w-full px-3 py-2 rounded-xs bg-paper border border-grid text-ink font-mono text-xs focus:outline-none focus:border-grid-strong"
                        />
                      </div>
                    </div>

                    {driftError && (
                      <div className="p-2.5 rounded-xs bg-hazard/10 border border-hazard/30 text-xs text-hazard font-mono flex items-center gap-1.5">
                        <TriangleAlert size={14} className="shrink-0" />
                        <span>{driftError}</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[11px] text-ink-soft font-mono">
                        Lagrangian advection with 3% wind leeway factor.
                      </span>

                      <button
                        type="button"
                        onClick={handleRunDrift}
                        disabled={isDrifting}
                        className="px-5 py-2 rounded-xs bg-ink hover:bg-ink-soft text-paper font-mono font-bold text-xs tracking-wider transition-all flex items-center gap-2 cursor-pointer shadow-xs disabled:opacity-50"
                      >
                        {isDrifting ? (
                          <>
                            <span className="inline-block w-3 h-3 border-2 border-paper border-t-transparent rounded-full animate-spin" />
                            <span>RECONSTRUCTING DRIFT…</span>
                          </>
                        ) : (
                          <>
                            <span>RUN DRIFT RECONSTRUCTION</span>
                            <Waves size={14} />
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* STAGE 03 — ATTRIBUTE */}
              <div className="p-6 rounded-xs border border-grid bg-paper space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-grid pb-3">
                  <div>
                    <h3 className="text-base font-display font-bold text-ink flex items-center gap-2">
                      <span className="w-5 h-5 bg-ink text-paper text-xs flex items-center justify-center font-mono rounded-xs">03</span>
                      <span>AIS VESSEL ATTRIBUTION &amp; EVIDENCE</span>
                    </h3>
                    <p className="text-xs text-ink-soft mt-0.5">
                      Correlates historical AIS vessel telemetry around the reconstructed origin window to identify candidate vessels.
                    </p>
                  </div>
                  {aisResult ? (
                    <span className="text-[11px] font-mono text-safe font-bold bg-safe/10 px-2 py-0.5 rounded-xs border border-safe/30 self-start sm:self-auto">
                      Phase 3 Complete
                    </span>
                  ) : driftResult ? (
                    <span className="text-[11px] font-mono text-pending font-bold bg-pending/10 px-2 py-0.5 rounded-xs border border-pending/30 self-start sm:self-auto">
                      Ready for AIS
                    </span>
                  ) : (
                    <span className="text-[11px] font-mono text-ink-soft bg-paper-alt px-2 py-0.5 rounded-xs border border-grid self-start sm:self-auto">
                      Waiting for Origin
                    </span>
                  )}
                </div>

                {!aisResult ? (
                  <div className="p-6 rounded-xs bg-paper-alt/40 border border-grid text-center space-y-3">
                    <p className="text-sm font-semibold text-ink">
                      {driftResult
                        ? "Origin corridor reconstructed. Ready to query and correlate historical AIS telemetry."
                        : "Run drift reconstruction (Stage 02) first to establish the reconstructed origin corridor."}
                    </p>
                    {driftResult && (
                      <button
                        type="button"
                        onClick={handleRunAIS}
                        disabled={isCorrelating}
                        className="px-6 py-2.5 rounded-xs bg-ink hover:bg-ink-soft text-paper font-mono font-bold text-xs tracking-wider transition-all inline-flex items-center gap-2 cursor-pointer shadow-xs disabled:opacity-50"
                      >
                        {isCorrelating ? (
                          <>
                            <span className="inline-block w-3.5 h-3.5 border-2 border-paper border-t-transparent rounded-full animate-spin" />
                            <span>CORRELATING AIS TELEMETRY…</span>
                          </>
                        ) : (
                          <>
                            <span>CORRELATE AIS VESSELS</span>
                            <Ship size={14} />
                          </>
                        )}
                      </button>
                    )}
                    {aisError && (
                      <div className="p-2.5 rounded-xs bg-hazard/10 border border-hazard/30 text-xs text-hazard font-mono max-w-md mx-auto">
                        <TriangleAlert size={13} className="inline mr-1.5 -mt-0.5" />{aisError}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Top candidate banner */}
                    {selectedVessel && (
                      <div className="p-6 rounded-xs bg-paper-alt/60 border-2 border-grid-strong shadow-xs space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-grid pb-4">
                          <div>
                            <span className="text-[11px] font-mono font-bold text-ink uppercase tracking-wider block">
                              {selectedVesselId === aisResult.candidate_vessels[0]?.vessel_id
                                ? "#1 TOP CANDIDATE VESSEL"
                                : `SELECTED CANDIDATE (#${aisResult.candidate_vessels.findIndex(v => v.vessel_id === selectedVessel.vessel_id) + 1})`}
                            </span>
                            <h4 className="text-2xl font-display font-black text-ink mt-1">
                              {selectedVessel.vessel_name}
                            </h4>
                            <span className="text-xs text-ink-soft font-mono">
                              MMSI: {selectedVessel.vessel_id}
                              {selectedVessel.vessel_type && <> · {selectedVessel.vessel_type}</>}
                              {selectedVessel.flag && <> · {selectedVessel.flag} flag</>}
                              {" "}· Min Distance: {selectedVessel.min_distance_km} km
                            </span>
                          </div>

                          <div className="flex items-center gap-4">
                            <span className={`px-2.5 py-1 rounded-xs border text-xs font-mono tracking-wider ${RISK_BADGE[selectedVessel.risk]}`}>
                              {selectedVessel.risk} RISK
                            </span>
                            <div className="text-right">
                              <span className="text-[10px] text-ink-soft uppercase font-bold block">
                                Attribution Score
                              </span>
                              <span className="text-3xl font-mono font-black text-ink">
                                {selectedVessel.score.toFixed(1)}{" "}
                                <span className="text-xs font-normal text-ink-soft">/ 100</span>
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* 4 Score Breakdown Cards */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono text-center">
                          <div className="p-3 rounded-xs bg-paper border border-grid">
                            <span className="text-[10px] text-ink-soft uppercase font-bold block">
                              Proximity (35)
                            </span>
                            <span className="text-base font-bold text-safe mt-0.5 block">
                              {selectedVessel.proximity_score}
                            </span>
                          </div>
                          <div className="p-3 rounded-xs bg-paper border border-grid">
                            <span className="text-[10px] text-ink-soft uppercase font-bold block">
                              Temporal (20)
                            </span>
                            <span className="text-base font-bold text-ink mt-0.5 block">
                              {selectedVessel.temporal_score}
                            </span>
                          </div>
                          <div className="p-3 rounded-xs bg-paper border border-grid">
                            <span className="text-[10px] text-ink-soft uppercase font-bold block">
                              Trajectory (30)
                            </span>
                            <span className="text-base font-bold text-ink mt-0.5 block">
                              {selectedVessel.trajectory_score}
                            </span>
                          </div>
                          <div className="p-3 rounded-xs bg-paper border border-grid">
                            <span className="text-[10px] text-ink-soft uppercase font-bold block">
                              Behavioural (15)
                            </span>
                            <span className="text-base font-bold text-pending mt-0.5 block">
                              {selectedVessel.behavioral_score}
                            </span>
                          </div>
                        </div>

                        {/* Why this vessel ranked here */}
                        <div className="pt-2 border-t border-grid">
                          <span className="text-xs font-mono font-bold text-ink uppercase tracking-wider block mb-2">
                            MEASURED AIS EVIDENCE FACTORS:
                          </span>
                          <div className="space-y-1.5 bg-paper p-3 rounded-xs border border-grid">
                            {selectedVessel.reasons.map((reason, rIdx) => (
                              <div key={rIdx} className="text-xs text-ink-soft flex items-start gap-2">
                                <span className="text-safe shrink-0 mt-0.5">—</span>
                                <span>{reason}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Disclaimer */}
                    <div className="p-3 rounded-xs border border-grid bg-paper-alt/40 text-xs text-ink-soft leading-relaxed text-center font-mono">
                      <strong className="text-ink">Analytical Disclaimer:</strong> Vessel attribution is an analytical ranking based on spatial, temporal, trajectory, and behavioural correlation. It is not proof of responsibility.
                    </div>

                    {/* Interactive Leaflet Map */}
                    {liveMapData && (
                      <div className="rounded-xs border border-grid overflow-hidden bg-paper space-y-2 p-4">
                        <div className="flex items-center justify-between text-xs font-mono">
                          <span className="font-bold text-ink uppercase tracking-wider">
                            GEOSPATIAL SITUATION MAP
                          </span>
                          <span className="text-[11px] text-ink-soft">
                            Click vessel marker or table row to inspect
                          </span>
                        </div>
                        <div className="h-80 w-full rounded-xs overflow-hidden border border-grid relative">
                          <SpillMap
                            key={liveMapData.spill_id}
                            data={liveMapData}
                            timelineIdx={liveMapData.drift.hindcast.trajectory.length - 1}
                            selectedVesselId={selectedVesselId}
                            onVesselSelect={setSelectedVesselId}
                          />
                        </div>
                      </div>
                    )}

                    {/* Ranked Candidates Table */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="font-bold text-ink uppercase tracking-wider">
                          EVALUATED CANDIDATE VESSELS ({aisResult.candidate_vessels.length})
                        </span>
                        <span className="text-[11px] text-ink-soft">
                          Click row to select
                        </span>
                      </div>

                      <div className="overflow-x-auto rounded-xs border border-grid bg-paper">
                        <table className="w-full text-left text-xs font-mono">
                          <thead className="border-b border-grid bg-paper-alt text-ink-soft">
                            <tr>
                              <th className="py-2 px-3">#</th>
                              <th className="py-2 px-3">Vessel</th>
                              <th className="py-2 px-3">MMSI</th>
                              <th className="py-2 px-3">Min Dist</th>
                              <th className="py-2 px-3">Time Δ</th>
                              <th className="py-2 px-3">Score</th>
                              <th className="py-2 px-3">Risk</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-grid text-ink">
                            {aisResult.candidate_vessels.map((vessel: CandidateVessel, idx: number) => {
                              const isSelected = selectedVessel?.vessel_id === vessel.vessel_id;
                              return (
                                <tr
                                  key={vessel.vessel_id}
                                  onClick={() => setSelectedVesselId(vessel.vessel_id)}
                                  className={`cursor-pointer transition-colors ${
                                    isSelected
                                      ? "bg-paper-alt font-semibold"
                                      : "hover:bg-paper-alt/50"
                                  }`}
                                >
                                  <td className="py-2 px-3 text-ink-soft">{idx + 1}</td>
                                  <td className="py-2 px-3 font-medium text-ink">
                                    {vessel.vessel_name}
                                    {vessel.went_dark && (
                                      <span className="ml-1.5 px-1.5 py-0.2 rounded-xs text-[9px] font-bold bg-hazard/10 text-hazard border border-hazard/30">
                                        DARK
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-2 px-3 text-ink-soft">{vessel.vessel_id}</td>
                                  <td className="py-2 px-3">{vessel.min_distance_km} km</td>
                                  <td className="py-2 px-3">{vessel.time_difference_hours}h</td>
                                  <td className="py-2 px-3 font-bold text-ink">{vessel.score.toFixed(1)}</td>
                                  <td className="py-2 px-3">
                                    <span className={`px-1.5 py-0.5 rounded-xs text-[10px] ${RISK_BADGE[vessel.risk]}`}>
                                      {vessel.risk}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom Reset & Navigation Action */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-grid">
                <button
                  type="button"
                  onClick={handleReset}
                  className="w-full sm:w-auto px-5 py-2 rounded-xs border border-grid bg-paper hover:bg-paper-alt text-ink text-xs font-mono font-medium transition-colors cursor-pointer"
                >
                  ← Upload Another SAR Scene
                </button>

                {driftResult && aisResult ? (
                  <Link
                    href={`/dashboard?case=${encodeURIComponent(analysisResult.spill_id)}`}
                    className="w-full sm:w-auto px-6 py-2.5 rounded-xs bg-ink hover:bg-ink-soft text-paper font-mono font-bold text-xs tracking-wider transition-all flex items-center justify-center gap-2 shadow-xs"
                  >
                    <span>VIEW LIVE INVESTIGATION IN DASHBOARD</span>
                    <span>→</span>
                  </Link>
                ) : (
                  <Link
                    href="/dashboard"
                    className="w-full sm:w-auto px-6 py-2.5 rounded-xs bg-paper-alt hover:bg-paper text-ink border border-grid font-mono font-bold text-xs tracking-wider transition-all flex items-center justify-center gap-2"
                  >
                    <span>OPEN FULL DEMO CASE (SPILL-001)</span>
                    <span>→</span>
                  </Link>
                )}
              </div>
            </div>
          ) : (
            /* Upload View (Exact Structure from Main) */
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              {/* Dropzone Container */}
              <div className="lg:col-span-2">
                <div className="p-6 rounded-xs border border-grid bg-paper-alt/30 backdrop-blur-xs flex flex-col shadow-xs">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={onFileInputChange}
                    accept="image/png,image/jpeg,image/tiff,.tif,.tiff"
                    className="hidden"
                  />

                  {isAnalyzing || pipelineEvents.length > 0 ? (
                    <PipelineHUD
                      events={pipelineEvents}
                      running={isAnalyzing}
                      summary={pipelineSummary}
                      error={errorMessage}
                    />
                  ) : (
                    <div
                      onDragOver={onDragOver}
                      onDragLeave={onDragLeave}
                      onDrop={onDrop}
                      onClick={() => fileInputRef.current?.click()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          fileInputRef.current?.click();
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      aria-label="Choose or drop a satellite scene"
                      className={`min-h-[300px] sm:min-h-[340px] flex items-center justify-center border-2 border-dashed rounded-xs p-6 text-center cursor-pointer transition-all outline-none ${
                        isDragging
                          ? "border-ink bg-paper"
                          : file
                          ? "border-safe bg-safe/5"
                          : "border-grid hover:border-grid-strong bg-paper/60 hover:bg-paper"
                      }`}
                    >
                      {file ? (
                        <div className="flex flex-col items-center gap-3">
                          {previewUrl ? (
                            <div className="w-40 h-40 rounded-xs overflow-hidden border border-grid bg-black shadow-xs">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={previewUrl}
                                alt="Selected scene preview"
                                className="w-full h-full object-cover"
                              />
                            </div>
                          ) : (
                            <div className="w-16 h-16 rounded-xs bg-paper border border-grid flex items-center justify-center text-ink">
                              <FileImage size={26} strokeWidth={1.5} />
                            </div>
                          )}
                          <div>
                            <p className="font-mono text-sm font-bold text-ink break-all px-4">
                              {file.name}
                            </p>
                            <p className="text-xs text-ink-soft mt-1 font-mono">
                              {(file.size / (1024 * 1024)).toFixed(2)} MB ·{" "}
                              {/\.tiff?$/i.test(file.name) ? "GeoTIFF — will self-locate" : file.type || "image"}
                            </p>
                          </div>
                          <span className="text-[11px] text-ink font-mono font-semibold underline underline-offset-2">
                            Click to replace file
                          </span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-3">
                          <div className="w-14 h-14 rounded-full bg-paper border border-grid flex items-center justify-center text-ink">
                            <Satellite size={24} strokeWidth={1.5} />
                          </div>
                          <p className="text-base font-display font-bold text-ink">
                            Drop a SAR / EO satellite scene
                          </p>
                          <p className="text-xs text-ink-soft max-w-sm leading-relaxed">
                            Sentinel-1 GRD GeoTIFF (.tif), or a plain PNG / JPEG. Up to 500 MB.
                          </p>
                          <div className="mt-1 inline-flex items-center gap-1.5 text-xs font-mono font-medium px-4 py-2 rounded-xs bg-paper border border-grid text-ink hover:bg-paper-alt transition-colors">
                            Browse files
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {errorMessage && !isAnalyzing && pipelineEvents.length === 0 && (
                    <div className="mt-4 p-3 rounded-xs border border-hazard/30 bg-hazard/10 text-xs text-hazard font-mono flex items-start gap-2">
                      <TriangleAlert size={14} className="shrink-0 mt-0.5" />
                      <span>{errorMessage}</span>
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={!file || isAnalyzing}
                    onClick={handleAnalyzeClick}
                    className={`mt-5 w-full px-6 py-3 rounded-xs font-mono font-bold text-xs tracking-wider transition-all flex items-center justify-center gap-2 ${
                      file && !isAnalyzing
                        ? "bg-ink hover:bg-ink-soft text-paper cursor-pointer shadow-xs"
                        : isAnalyzing
                        ? "bg-ink/70 text-paper cursor-wait animate-pulse"
                        : "bg-paper-alt text-ink-soft cursor-not-allowed border border-grid"
                    }`}
                  >
                    {isAnalyzing ? (
                      <>
                        <span className="inline-block w-4 h-4 border-2 border-paper border-t-transparent rounded-full animate-spin" />
                        <span>RUNNING SEGMENTATION…</span>
                      </>
                    ) : (
                      <>
                        <span>ANALYZE SCENE</span>
                        {file && <Zap size={14} />}
                      </>
                    )}
                  </button>

                  <p className="mt-3 text-[11px] text-ink-soft text-center font-mono leading-relaxed">
                    Model loaded: <span className="font-semibold text-ink">oilspill_yolov8_seg_best.pt</span> — inference runs live on your scene.
                  </p>
                </div>
              </div>

              {/* Sidebar (Exact from Main) */}
              <aside className="space-y-4">
                <div className="p-5 rounded-xs border border-grid bg-paper-alt/30">
                  <h2 className="text-[11px] font-mono font-bold uppercase tracking-wider text-ink">
                    What happens next
                  </h2>
                  <ol className="mt-4 space-y-3.5">
                    {UPLOAD_STEPS.map((s) => (
                      <li key={s.n} className="flex gap-3">
                        <span className="w-6 h-6 shrink-0 rounded-xs border border-grid bg-paper flex items-center justify-center font-mono font-bold text-[10px] text-ink">
                          {s.n}
                        </span>
                        <div>
                          <div className="text-[13px] font-semibold text-ink leading-tight">{s.t}</div>
                          <div className="text-[11px] text-ink-soft leading-relaxed mt-0.5">{s.d}</div>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>

                <div className="p-5 rounded-xs border border-grid bg-paper-alt/30">
                  <h2 className="text-[11px] font-mono font-bold uppercase tracking-wider text-ink">
                    Accepted input
                  </h2>
                  <dl className="mt-3.5 space-y-2.5 text-[11px]">
                    <div className="flex items-start gap-2">
                      <dt className="w-16 shrink-0 font-mono text-safe font-bold">GeoTIFF</dt>
                      <dd className="text-ink-soft leading-relaxed">
                        CRS, transform and acquisition time are read from the file — all phases run automatically.
                      </dd>
                    </div>
                    <div className="flex items-start gap-2">
                      <dt className="w-16 shrink-0 font-mono text-ink font-bold">PNG / JPG</dt>
                      <dd className="text-ink-soft leading-relaxed">
                        Detection runs first, then you supply scene coordinates to trigger drift and attribution.
                      </dd>
                    </div>
                  </dl>
                </div>

                <ModelMetricsPanel compact />

                <Link
                  href="/dashboard"
                  className="flex items-center justify-between gap-2 p-4 rounded-xs border border-grid bg-paper-alt/30 hover:border-grid-strong hover:bg-paper-alt transition-colors group"
                >
                  <div>
                    <span className="block text-[13px] font-semibold text-ink">
                      No scene to hand?
                    </span>
                    <span className="block text-[11px] text-ink-soft mt-0.5">
                      Open a solved case with full evidence
                    </span>
                  </div>
                  <span className="text-ink-soft group-hover:text-ink transition-colors font-mono" aria-hidden="true">
                    →
                  </span>
                </Link>
              </aside>
            </div>
          )}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
