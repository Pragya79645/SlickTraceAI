"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useState, useRef, useMemo, ChangeEvent, DragEvent } from "react";
import {
  analyzeSpillImage,
  runDriftReconstruction,
  runAISCorrelation,
  runEcologicalAssessment,
  type AnalysisResponse,
  type CandidateVessel,
  type DriftAnalysis,
  type EcologicalAssessment,
  type InvestigationResponse,
  type PipelineStageInfo,
  type VesselAttribution,
} from "@/lib/api";

import ModelMetricsPanel from "@/components/ModelMetricsPanel";
import DossierButton from "@/components/DossierButton";

// Leaflet map component (client-only, SSR-safe)
const SpillMap = dynamic(() => import("@/components/SpillMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-80 flex items-center justify-center bg-slate-900 rounded-xl text-slate-500 text-xs font-mono tracking-wider border border-slate-800">
      Loading interactive geospatial map…
    </div>
  ),
});

const STAGE_BADGE_STYLE: Record<string, string> = {
  complete: "bg-emerald-950/70 text-emerald-300 border-emerald-700/80 font-bold",
  inputs_required: "bg-amber-950/70 text-amber-300 border-amber-700/80 font-bold",
  waiting: "bg-slate-900/80 text-slate-500 border-slate-800 font-normal",
  failed: "bg-red-950/70 text-red-300 border-red-700/80 font-bold",
};

const RISK_BADGE: Record<string, string> = {
  HIGH: "bg-red-950/90 text-red-300 border-red-700 font-bold shadow-sm shadow-red-900/40",
  MEDIUM: "bg-amber-950/90 text-amber-300 border-amber-700 font-bold shadow-sm shadow-amber-900/40",
  LOW: "bg-slate-800 text-slate-400 border-slate-700 font-normal",
};

export default function StartInvestigation() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showRawScene, setShowRawScene] = useState(false);

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

  const scrollToUpload = () => {
    uploadSectionRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleAnalyzeClick = async () => {
    if (!file) return;

    setIsAnalyzing(true);
    setErrorMessage(null);
    setDriftResult(null);
    setAisResult(null);
    setSelectedVesselId(null);

    try {
      const result = await analyzeSpillImage(file);
      setAnalysisResult(result);
      if (result.timestamp) {
        setTimestamp(result.timestamp);
      }

      // A georeferenced scene anchors itself: adopt the backend's anchor and any
      // downstream phases it already ran, so the investigator sees the full chain at once.
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

      // Trigger automatic ecological threat screening from forecast trajectory
      try {
        const eco = await runEcologicalAssessment({
          forecast_trajectory: res.forecast.trajectory,
          spill_id: analysisResult.spill_id, // persists onto the live record for the dashboard
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
    if (!driftResult || !analysisResult) return;

    setIsCorrelating(true);
    setAisError(null);

    try {
      const res = await runAISCorrelation({
        spill_id: analysisResult.spill_id,
        origin: {
          latitude: driftResult.hindcast.estimated_origin.lat,
          longitude: driftResult.hindcast.estimated_origin.lon,
          timestamp: driftResult.hindcast.estimated_origin.timestamp,
        },
        origin_ellipses: driftResult.ensemble?.hindcast_steps.at(-1)?.ellipses,
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
    setLatitude("19.070667");
    setLongitude("72.968941");
    setTimestamp("2026-08-28T21:02:13Z");
  };

  const handleReset = () => {
    setFile(null);
    setPreviewUrl(null);
    setAnalysisResult(null);
    setDriftResult(null);
    setAisResult(null);
    setEcologyResult(null);
    setSelectedVesselId(null);
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
              status_label: "✓ ORIGIN RECONSTRUCTED",
            };
          }
          if (stg.stage_key === "ais_correlation") {
            return {
              ...stg,
              status: "complete" as const,
              status_label: `✓ ${aisResult.candidate_vessels.length} VESSELS CORRELATED`,
              summary: `Correlated AIS telemetry across ${aisResult.candidate_vessels.length} vessels in the origin corridor.`,
            };
          }
          if (stg.stage_key === "vessel_attribution") {
            const top = aisResult.candidate_vessels[0];
            return {
              ...stg,
              status: "complete" as const,
              status_label: "✓ SUSPECTS RANKED",
              summary: `Top ranked: ${top ? top.vessel_name : "None"} (${top ? top.score : 0}/100 - ${top ? top.risk : "LOW"})`,
            };
          }
        } else if (driftResult) {
          if (stg.stage_key === "origin_reconstruction") {
            return {
              ...stg,
              status: "complete" as const,
              status_label: "✓ RECONSTRUCTED",
              summary: `Estimated Origin: (${driftResult.hindcast.estimated_origin.lat.toFixed(4)}°N, ${driftResult.hindcast.estimated_origin.lon.toFixed(4)}°E) at ${driftResult.hindcast.estimated_origin.hours_before_observation}h before observation.`,
            };
          }
          if (stg.stage_key === "ais_correlation") {
            return {
              ...stg,
              status: "inputs_required" as const,
              status_label: "⚠ READY FOR AIS INGESTION",
              summary: "Origin corridor reconstructed. Ready to correlate with spatio-temporal AIS vessel telemetry stream.",
            };
          }
        }
        return stg;
      })
    : [];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500/30">
      {/* ── Top Header ────────────────────────────────────────────────────────── */}
      <header className="flex-none border-b border-slate-800/80 bg-slate-900/80 backdrop-blur-md sticky top-0 z-30 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-black text-sm">
              ST
            </div>
            <span className="text-lg font-black tracking-tight text-white">
              SlickTrace
            </span>
            <span className="text-lg font-light text-amber-400">AI</span>
          </div>
          <div className="h-4 w-px bg-slate-700 hidden sm:block" />
          <span className="text-xs text-slate-400 hidden sm:block font-medium">
            Marine Oil Spill Investigation &amp; Attribution
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-medium bg-emerald-950/60 text-emerald-400 border border-emerald-800/60">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            END-TO-END PIPELINE ACTIVE
          </span>
          <Link
            href="/dashboard"
            className="text-xs font-semibold px-3 py-1.5 rounded-md border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-200 transition-colors flex items-center gap-1.5"
          >
            <span>Demo: SPILL-001</span>
            <span className="text-slate-400">→</span>
          </Link>
        </div>
      </header>

      {/* ── Main Content Area ─────────────────────────────────────────────────── */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8 flex flex-col justify-center">
        {!analysisResult && (
          <div className="text-center max-w-3xl mx-auto mb-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs font-semibold uppercase tracking-wider mb-5">
              <span className="text-amber-400">⚡</span> Next-Gen Maritime Intelligence
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-tight mb-4">
              Marine Oil Spill <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-orange-300 to-amber-200">
                Investigation &amp; Attribution
              </span>
            </h1>

            <p className="text-base sm:text-lg text-slate-300 leading-relaxed max-w-2xl mx-auto font-normal">
              Detect suspicious oil slicks with YOLOv8, reconstruct physical origin corridors with Lagrangian drift,
              correlate vessel movement with AIS telemetry, and rank candidates for enforcement action.
            </p>

            {/* Workflow Stage Pills */}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs font-mono font-semibold text-slate-400">
              <span className="px-3 py-1 rounded-md bg-slate-900 border border-slate-800 text-amber-300">
                01. SAR/EO Detection
              </span>
              <span className="text-slate-600">→</span>
              <span className="px-3 py-1 rounded-md bg-slate-900 border border-slate-800 text-indigo-300">
                02. Lagrangian Drift
              </span>
              <span className="text-slate-600">→</span>
              <span className="px-3 py-1 rounded-md bg-slate-900 border border-slate-800 text-emerald-300">
                03. AIS Attribution
              </span>
            </div>

            {/* Primary Action Buttons */}
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={scrollToUpload}
                className="w-full sm:w-auto px-7 py-3.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm tracking-wide transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>START NEW INVESTIGATION</span>
                <span>↓</span>
              </button>

              <Link
                href="/dashboard"
                className="w-full sm:w-auto px-7 py-3.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-semibold text-sm tracking-wide transition-colors flex items-center justify-center gap-2"
              >
                <span>OPEN DEMO CASE (SPILL-001)</span>
                <span className="text-slate-400">→</span>
              </Link>
            </div>
          </div>
        )}

        {/* ── 3 Key Pillar Cards (Hero only) ─────────────────────────────────── */}
        {!analysisResult && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-10">
            <div className="p-5 rounded-xl border border-slate-800/80 bg-slate-900/60 backdrop-blur-sm relative overflow-hidden">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold text-sm mb-3">
                01
              </div>
              <h3 className="font-bold text-white text-base mb-1.5 flex items-center gap-2">
                <span>Detect &amp; Characterize</span>
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Segment oil slicks in SAR/EO scenes with YOLOv8 instance segmentation. Extracts precise polygon geometry, area (km²), elongation ratio, and weathering age estimate.
              </p>
            </div>

            <div className="p-5 rounded-xl border border-slate-800/80 bg-slate-900/60 backdrop-blur-sm relative overflow-hidden">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold text-sm mb-3">
                02
              </div>
              <h3 className="font-bold text-white text-base mb-1.5 flex items-center gap-2">
                <span>Drift Reconstruction</span>
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Applies a 2D Lagrangian advection model combining surface current and 3% wind factor to backward-trace the origin corridor and forecast forward trajectory.
              </p>
            </div>

            <div className="p-5 rounded-xl border border-slate-800/80 bg-slate-900/60 backdrop-blur-sm relative overflow-hidden">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-sm mb-3">
                03
              </div>
              <h3 className="font-bold text-white text-base mb-1.5 flex items-center gap-2">
                <span>AIS Vessel Attribution</span>
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Correlates AIS tracks with the reconstructed origin window using 4 explainable weights (Proximity 35%, Temporal 20%, Trajectory 30%, Behaviour 15%) to rank high-risk vessels.
              </p>
            </div>
          </div>
        )}

        {/* ── Start Investigation Upload Zone / Live Console ──────────────────── */}
        <div
          ref={uploadSectionRef}
          id="upload-section"
          className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6 sm:p-8 shadow-2xl transition-all"
        >
          {/* If analysis result is available, show the Polished Live Investigation Console */}
          {analysisResult ? (
            <div className="space-y-8">
              {/* ── Section 1: Obvious Live Investigation Header ──────────────────── */}
              <div className="border-b border-slate-800 pb-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <span className="px-2.5 py-0.5 rounded text-[11px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 uppercase tracking-widest">
                        LIVE INVESTIGATION
                      </span>
                      <span className="text-xs text-slate-400 font-mono">
                        Source: {analysisResult.filename} ({analysisResult.dimensions.width}×{analysisResult.dimensions.height} px)
                      </span>
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-black text-white font-mono mt-1.5 tracking-tight">
                      {analysisResult.spill_id}
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Results computed in real time from this uploaded SAR/EO satellite scene.
                    </p>
                  </div>

                  <span className="px-3.5 py-1.5 rounded-full text-xs font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-700 tracking-wider self-start sm:self-auto flex items-center gap-1.5 shadow-md">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    {analysisResult.status === "spill_detected"
                      ? "✓ SPILL DETECTED"
                      : "NO SPILL DETECTED"}
                  </span>
                </div>

                {/* Story Pipeline Status Strip (5-10 Second Comprehension) */}
                <div className="mt-5 p-3.5 rounded-xl bg-slate-950/90 border border-slate-800 overflow-x-auto">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 text-xs">
                    {stages.map((stg: PipelineStageInfo, idx: number) => (
                      <div key={stg.stage_key} className="flex items-center gap-2 flex-none">
                        <span
                          className={`px-3 py-1 rounded border text-[11px] font-mono tracking-wide ${
                            STAGE_BADGE_STYLE[stg.status] || STAGE_BADGE_STYLE.waiting
                          }`}
                        >
                          {stg.status_label}
                        </span>
                        {idx < stages.length - 1 && (
                          <span className="text-slate-700 hidden sm:inline">→</span>
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-2 font-medium">
                    From satellite detection to vessel attribution, each stage adds independent physical and analytical evidence.
                  </p>
                </div>
              </div>

              {/* ── STAGE 01 — DETECT ("Where is the oil?") ────────────────────────── */}
              <div className="p-6 rounded-xl border border-slate-800 bg-slate-950/60 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-slate-800/80 pb-3">
                  <div>
                    <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                      <span className="text-amber-400 font-mono">01</span>
                      <span>DETECT &amp; CHARACTERISE</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      YOLOv8 instance segmentation neural network identifies and characterises the visible oil slick.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    {liveMapData && <DossierButton data={liveMapData} />}
                    <span className="text-[11px] font-mono text-emerald-400 font-bold bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/60">
                      Phase 1 Complete
                    </span>
                  </div>
                </div>

                <ModelMetricsPanel compact />

                {/* Scene preview with segmentation masks painted on */}
                {(analysisResult.overlay_image || analysisResult.preview_image) && (
                  <div className="rounded-xl border border-slate-800 bg-slate-950 overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 text-[11px] font-mono">
                      <span className="text-slate-300 font-bold">
                        {showRawScene || !analysisResult.overlay_image ? "RAW SCENE" : "SEGMENTATION MASK OVERLAY"}
                        <span className="text-slate-500 font-normal"> · {analysisResult.dimensions.width}×{analysisResult.dimensions.height} px inference frame</span>
                      </span>
                      {analysisResult.overlay_image && (
                        <button
                          type="button"
                          onClick={() => setShowRawScene((v) => !v)}
                          className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer"
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
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 border-t border-slate-800 text-[11px] font-mono">
                        {analysisResult.georeference && (
                          <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-emerald-200">
                            <div className="font-bold text-emerald-300">📍 AUTO-GEOREFERENCED FROM GEOTIFF</div>
                            <div className="text-emerald-200/80 mt-0.5">
                              {analysisResult.georeference.crs} · {analysisResult.georeference.gsd_m} m/px native · {analysisResult.georeference.width}×{analysisResult.georeference.height} px scene
                              {analysisResult.georeference.inference_scale > 1 && <> · inferred at 1/{analysisResult.georeference.inference_scale.toFixed(2)}</>}
                            </div>
                            {analysisResult.detection?.centroid.lat != null && (
                              <div className="text-white mt-0.5">
                                Slick centroid {analysisResult.detection.centroid.lat.toFixed(5)}°N, {analysisResult.detection.centroid.lon?.toFixed(5)}°E
                                {analysisResult.georeference.timestamp && <> · acquired {analysisResult.georeference.timestamp.slice(0, 16).replace("T", " ")}Z ({analysisResult.georeference.timestamp_source.replace("_", " ")})</>}
                              </div>
                            )}
                          </div>
                        )}
                        {analysisResult.detection?.bonn_volume && (
                          <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300">
                            <div className="font-bold text-amber-300">🛢 ESTIMATED VOLUME (BONN AGREEMENT)</div>
                            <div className="text-white text-base font-black mt-0.5">
                              {analysisResult.detection.bonn_volume.volume_tonnes_min.toLocaleString()}–{analysisResult.detection.bonn_volume.volume_tonnes_max.toLocaleString()} t
                              <span className="text-slate-500 text-[10px] font-normal ml-1.5">({analysisResult.detection.bonn_volume.volume_m3_min}–{analysisResult.detection.bonn_volume.volume_m3_max} m³)</span>
                            </div>
                            <div className="text-slate-500 mt-0.5">
                              Code {analysisResult.detection.bonn_volume.appearance_code} &ldquo;{analysisResult.detection.bonn_volume.appearance_label}&rdquo; assumed · {analysisResult.detection.bonn_volume.thickness_um_min}–{analysisResult.detection.bonn_volume.thickness_um_max} µm · SAR cannot observe thickness
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {analysisResult.detection ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 py-1">
                    <div className="p-3.5 rounded-lg bg-slate-900/90 border border-slate-800">
                      <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                        Detection Confidence
                      </p>
                      <p className="text-2xl font-mono font-extrabold text-emerald-400 mt-1">
                        {(analysisResult.detection.confidence * 100).toFixed(2)}%
                      </p>
                      <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                        Class: oil_spill (YOLOv8-seg)
                      </p>
                    </div>

                    <div className="p-3.5 rounded-lg bg-slate-900/90 border border-slate-800">
                      <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                        Estimated Area
                      </p>
                      <p className="text-2xl font-mono font-extrabold text-amber-400 mt-1">
                        {analysisResult.detection.area.km2.toFixed(4)}{" "}
                        <span className="text-xs font-normal text-slate-400">km²</span>
                      </p>
                      <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                        {analysisResult.detection.area.pixels.toLocaleString()} pixels (GSD 10m)
                      </p>
                    </div>

                    <div className="p-3.5 rounded-lg bg-slate-900/90 border border-slate-800">
                      <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                        Perimeter &amp; Shape
                      </p>
                      <p className="text-xl font-mono font-bold text-slate-200 mt-1">
                        {analysisResult.detection.perimeter.km.toFixed(2)} km
                      </p>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                        Elongation: {analysisResult.detection.elongation_ratio}
                      </p>
                    </div>

                    <div className="p-3.5 rounded-lg bg-slate-900/90 border border-slate-800">
                      <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                        Weathering Estimate
                      </p>
                      <p className="text-xl font-mono font-bold text-slate-200 uppercase mt-1">
                        {analysisResult.detection.age_estimate.category}
                      </p>
                      <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                        Edge Density: {analysisResult.detection.age_estimate.edge_density}
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* ── STAGE 02 — TRACE ("Where did it likely come from?") ────────────── */}
              <div className="p-6 rounded-xl border border-slate-800 bg-slate-950/60 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-slate-800/80 pb-3">
                  <div>
                    <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                      <span className="text-indigo-400 font-mono">02</span>
                      <span>LAGRANGIAN DRIFT RECONSTRUCTION</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Backward hydrodynamic drift reconstruction estimates where the slick may have originated.
                    </p>
                  </div>
                  {driftResult ? (
                    <span className="text-[11px] font-mono text-emerald-400 font-bold bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/60 self-start sm:self-auto">
                      Phase 2 Complete
                    </span>
                  ) : (
                    <span className="text-[11px] font-mono text-amber-400 font-bold bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/60 self-start sm:self-auto">
                      Input Required
                    </span>
                  )}
                </div>

                {driftResult ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                      <div className="p-3.5 rounded-lg bg-slate-900/90 border border-slate-800">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                            Estimated Origin
                          </span>
                          <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            ESTIMATED — NOT CONFIRMED
                          </span>
                        </div>
                        <p className="text-xl font-mono font-extrabold text-amber-400 mt-1">
                          {driftResult.hindcast.estimated_origin.lat.toFixed(4)}°N, {driftResult.hindcast.estimated_origin.lon.toFixed(4)}°E
                        </p>
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                          6.0h prior to observation
                        </p>
                      </div>

                      <div className="p-3.5 rounded-lg bg-slate-900/90 border border-slate-800">
                        <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider block">
                          Combined Drift Velocity
                        </span>
                        <p className="text-xl font-mono font-extrabold text-indigo-300 mt-1">
                          {driftResult.environment.drift.speed_ms.toFixed(4)} m/s
                        </p>
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                          u={driftResult.environment.drift.u_ms} m/s, v={driftResult.environment.drift.v_ms} m/s
                        </p>
                      </div>

                      <div className="p-3.5 rounded-lg bg-slate-900/90 border border-slate-800">
                        <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider block">
                          6h Forecast Endpoint
                        </span>
                        <p className="text-xl font-mono font-extrabold text-emerald-300 mt-1">
                          {driftResult.forecast.forecast_endpoint.lat.toFixed(4)}°N, {driftResult.forecast.forecast_endpoint.lon.toFixed(4)}°E
                        </p>
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                          Forward trajectory prediction
                        </p>
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-400 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/80">
                      <span className="font-semibold text-slate-300">Hydrodynamic Context:</span> Surface currents ({driftResult.environment.current.u_ms}, {driftResult.environment.current.v_ms} m/s) and wind vectors ({driftResult.environment.wind.u_ms}, {driftResult.environment.wind.v_ms} m/s)
                      {driftResult.environment.source === "open_meteo" ? (
                        <> from <span className="text-emerald-300 font-semibold">{driftResult.environment.provider_detail}</span>, valid {driftResult.environment.valid_time}.</>
                      ) : (
                        <> via <span className="text-amber-300 font-semibold">regional fallback</span> ({driftResult.environment.source}){driftResult.environment.notes ? ` — ${driftResult.environment.notes}` : ""}.</>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-slate-300">
                        {analysisResult?.anchor_source === "geotiff" ? (
                          <><span className="text-emerald-300 font-semibold">Anchor auto-filled from the GeoTIFF georeference</span> — adjust only if you have a better fix:</>
                        ) : (
                          <>This scene has no embedded georeference. Enter the observation coordinates and time to resolve ocean currents and wind vectors:</>
                        )}
                      </p>
                      <button
                        type="button"
                        onClick={handlePreFillMumbai}
                        className="text-[11px] font-mono font-semibold px-2.5 py-1 rounded bg-indigo-900/60 hover:bg-indigo-800 text-indigo-200 border border-indigo-700/60 transition-colors cursor-pointer"
                      >
                        📍 Pre-fill Offshore Mumbai Anchor
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] font-mono text-slate-300 font-bold mb-1">
                          Observation Latitude (°N)
                        </label>
                        <input
                          type="text"
                          value={latitude}
                          onChange={(e) => setLatitude(e.target.value)}
                          placeholder="e.g. 19.070667"
                          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-amber-400"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-mono text-slate-300 font-bold mb-1">
                          Observation Longitude (°E)
                        </label>
                        <input
                          type="text"
                          value={longitude}
                          onChange={(e) => setLongitude(e.target.value)}
                          placeholder="e.g. 72.968941"
                          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-amber-400"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-mono text-slate-300 font-bold mb-1">
                          Observation Timestamp (UTC)
                        </label>
                        <input
                          type="text"
                          value={timestamp}
                          onChange={(e) => setTimestamp(e.target.value)}
                          placeholder="YYYY-MM-DDTHH:MM:SSZ"
                          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-amber-400"
                        />
                      </div>
                    </div>

                    {driftError && (
                      <div className="p-2.5 rounded bg-red-950/60 border border-red-800 text-xs text-red-300">
                        ⚠ {driftError}
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[11px] text-slate-500 font-mono">
                        Prototype georef — source SAR image has no embedded geographic metadata.
                      </span>

                      <button
                        type="button"
                        onClick={handleRunDrift}
                        disabled={isDrifting}
                        className={`px-6 py-2.5 rounded-lg font-bold text-xs tracking-wider transition-all flex items-center gap-2 ${
                          isDrifting
                            ? "bg-indigo-700 text-slate-200 cursor-wait animate-pulse"
                            : "bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer shadow-lg shadow-indigo-600/30"
                        }`}
                      >
                        {isDrifting ? (
                          <>
                            <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            <span>RECONSTRUCTING DRIFT...</span>
                          </>
                        ) : (
                          <>
                            <span>RUN DRIFT RECONSTRUCTION</span>
                            <span>🌊</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* ── STAGE 03 — ATTRIBUTE ("Which vessels were near that origin?") ───── */}
              <div className="p-6 rounded-xl border border-slate-800 bg-slate-950/60 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-slate-800/80 pb-3">
                  <div>
                    <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                      <span className="text-emerald-400 font-mono">03</span>
                      <span>AIS VESSEL ATTRIBUTION &amp; EVIDENCE</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Correlates historical AIS vessel telemetry around the reconstructed origin window to identify candidate vessels.
                    </p>
                  </div>
                  {aisResult ? (
                    <span className="text-[11px] font-mono text-emerald-400 font-bold bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/60 self-start sm:self-auto">
                      Phase 3 Complete
                    </span>
                  ) : driftResult ? (
                    <span className="text-[11px] font-mono text-amber-400 font-bold bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/60 self-start sm:self-auto">
                      Ready for AIS
                    </span>
                  ) : (
                    <span className="text-[11px] font-mono text-slate-500 bg-slate-900 px-2 py-0.5 rounded border border-slate-800 self-start sm:self-auto">
                      Waiting for Origin
                    </span>
                  )}
                </div>

                {!aisResult ? (
                  <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 text-center space-y-3">
                    <p className="text-sm font-semibold text-slate-200">
                      {driftResult
                        ? "Origin corridor reconstructed. Ready to query and correlate historical AIS telemetry."
                        : "Run drift reconstruction (Stage 02) first to establish the reconstructed origin corridor."}
                    </p>
                    {driftResult && (
                      <button
                        type="button"
                        onClick={handleRunAIS}
                        disabled={isCorrelating}
                        className={`px-7 py-3 rounded-lg font-bold text-xs tracking-wider transition-all inline-flex items-center gap-2 ${
                          isCorrelating
                            ? "bg-emerald-800 text-slate-200 cursor-wait animate-pulse"
                            : "bg-emerald-500 hover:bg-emerald-400 text-slate-950 cursor-pointer shadow-xl shadow-emerald-500/20"
                        }`}
                      >
                        {isCorrelating ? (
                          <>
                            <span className="inline-block w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                            <span>CORRELATING AIS TELEMETRY...</span>
                          </>
                        ) : (
                          <>
                            <span>CORRELATE AIS VESSELS</span>
                            <span>🚢</span>
                          </>
                        )}
                      </button>
                    )}
                    {aisError && (
                      <div className="p-2.5 rounded bg-red-950/60 border border-red-800 text-xs text-red-300 max-w-md mx-auto">
                        ⚠ {aisError}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* ── #1 TOP CANDIDATE BANNER / HERO CARD ── */}
                    {selectedVessel && (
                      <div className="p-6 rounded-xl bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border-2 border-amber-500/60 shadow-xl space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
                          <div>
                            <span className="text-[11px] font-mono font-bold text-amber-400 uppercase tracking-widest block">
                              {selectedVesselId === aisResult.candidate_vessels[0]?.vessel_id
                                ? "★ #1 TOP CANDIDATE VESSEL"
                                : `SELECTED CANDIDATE (#${aisResult.candidate_vessels.findIndex(v => v.vessel_id === selectedVessel.vessel_id) + 1})`}
                            </span>
                            <h4 className="text-2xl sm:text-3xl font-black text-white font-mono mt-1">
                              {selectedVessel.vessel_name}
                            </h4>
                            <span className="text-xs text-slate-400 font-mono">
                              MMSI: {selectedVessel.vessel_id}
                              {selectedVessel.vessel_type && <> · {selectedVessel.vessel_type}</>}
                              {selectedVessel.flag && <> · {selectedVessel.flag} flag</>}
                              {" "}· Min Geodesic Distance: {selectedVessel.min_distance_km} km
                            </span>
                          </div>

                          <div className="flex items-center gap-4">
                            <span className={`px-3 py-1.5 rounded border text-xs font-mono tracking-wider ${RISK_BADGE[selectedVessel.risk]}`}>
                              {selectedVessel.risk} RISK
                            </span>
                            <div className="text-right">
                              <span className="text-[10px] text-slate-500 uppercase font-bold block">
                                Attribution Score
                              </span>
                              <span className="text-3xl font-mono font-black text-amber-400">
                                {selectedVessel.score.toFixed(1)}{" "}
                                <span className="text-xs font-normal text-slate-400">/ 100</span>
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* 4 Score Breakdown Cards */}
                        <div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-2">
                            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-center">
                              <span className="text-[10px] text-slate-500 uppercase font-bold block">
                                Proximity (35)
                              </span>
                              <span className="text-base font-mono font-extrabold text-emerald-400 mt-0.5 block">
                                {selectedVessel.proximity_score}
                              </span>
                            </div>
                            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-center">
                              <span className="text-[10px] text-slate-500 uppercase font-bold block">
                                Temporal (20)
                              </span>
                              <span className="text-base font-mono font-extrabold text-indigo-400 mt-0.5 block">
                                {selectedVessel.temporal_score}
                              </span>
                            </div>
                            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-center">
                              <span className="text-[10px] text-slate-500 uppercase font-bold block">
                                Trajectory (30)
                              </span>
                              <span className="text-base font-mono font-extrabold text-amber-400 mt-0.5 block">
                                {selectedVessel.trajectory_score}
                              </span>
                            </div>
                            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-center">
                              <span className="text-[10px] text-slate-500 uppercase font-bold block">
                                Behavioural (15)
                              </span>
                              <span className="text-base font-mono font-extrabold text-orange-400 mt-0.5 block">
                                {selectedVessel.behavioral_score}
                              </span>
                            </div>
                          </div>
                          <p className="text-[11px] text-slate-400 text-center font-medium">
                            Score combines spatial, temporal, trajectory and behavioural correlation.
                          </p>
                        </div>

                        {/* WHY THIS VESSEL RANKED HERE (EVIDENCE IS THE HERO) */}
                        <div className="pt-2 border-t border-slate-800/80">
                          <span className="text-xs font-mono font-bold text-slate-300 uppercase tracking-wider block mb-2">
                            WHY THIS VESSEL RANKED HERE (MEASURED AIS EVIDENCE):
                          </span>
                          <div className="space-y-1.5 bg-slate-950/70 p-3.5 rounded-lg border border-slate-800">
                            {selectedVessel.reasons.map((reason, rIdx) => (
                              <div key={rIdx} className="text-xs text-slate-200 flex items-start gap-2">
                                <span className="text-emerald-400 font-bold">✓</span>
                                <span className="capitalize">{reason}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Clear "Not Proof" Disclaimer */}
                    <div className="p-3 rounded-lg border border-slate-800/90 bg-slate-950/60 text-xs text-slate-400 leading-relaxed text-center">
                      <span className="font-semibold text-slate-300">Analytical Disclaimer:</span> Vessel attribution is an analytical ranking based on spatial, temporal, trajectory, and behavioural correlation. It is not proof of responsibility.
                    </div>

                    {/* Interactive Leaflet Map for Live Investigation */}
                    {liveMapData && (
                      <div className="rounded-xl border border-slate-800 overflow-hidden bg-slate-950 space-y-2 p-4">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-mono font-bold text-slate-300 uppercase tracking-wider">
                            GEOSPATIAL SITUATION MAP
                          </span>
                          <span className="text-[11px] font-mono text-slate-500">
                            Click any vessel marker or table row to inspect evidence
                          </span>
                        </div>
                        <div className="h-80 w-full rounded-lg overflow-hidden border border-slate-800 relative">
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
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono font-bold text-slate-300 uppercase tracking-wider">
                          ALL EVALUATED CANDIDATE VESSELS ({aisResult.candidate_vessels.length})
                        </span>
                        <span className="text-[11px] text-slate-500 font-mono">
                          Click row to select vessel
                        </span>
                      </div>

                      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/90">
                        <table className="w-full text-left text-xs font-mono">
                          <thead className="border-b border-slate-800 bg-slate-900/80 text-slate-400">
                            <tr>
                              <th className="py-2.5 px-3.5">#</th>
                              <th className="py-2.5 px-3.5">Vessel</th>
                              <th className="py-2.5 px-3.5">MMSI</th>
                              <th className="py-2.5 px-3.5">Min Dist</th>
                              <th className="py-2.5 px-3.5">Time Δ</th>
                              <th className="py-2.5 px-3.5">Score</th>
                              <th className="py-2.5 px-3.5">Risk</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60 text-slate-300">
                            {aisResult.candidate_vessels.map((vessel: CandidateVessel, idx: number) => {
                              const isSelected = selectedVessel?.vessel_id === vessel.vessel_id;
                              return (
                                <tr
                                  key={vessel.vessel_id}
                                  onClick={() => setSelectedVesselId(vessel.vessel_id)}
                                  className={`cursor-pointer transition-colors ${
                                    isSelected
                                      ? "bg-amber-500/15 font-semibold text-white"
                                      : "hover:bg-slate-900/80"
                                  }`}
                                >
                                  <td className="py-2 px-3.5 text-slate-500">{idx + 1}</td>
                                  <td className="py-2 px-3.5 text-white font-medium">
                                    {vessel.vessel_name}
                                    {vessel.went_dark && (
                                      <span className="ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-black tracking-wider bg-red-950 text-red-300 border border-red-700">⚠ DARK</span>
                                    )}
                                  </td>
                                  <td className="py-2 px-3.5 text-slate-400">{vessel.vessel_id}</td>
                                  <td className="py-2 px-3.5">{vessel.min_distance_km} km</td>
                                  <td className="py-2 px-3.5">{vessel.time_difference_hours}h</td>
                                  <td className="py-2 px-3.5 font-bold text-amber-400">{vessel.score.toFixed(1)}</td>
                                  <td className="py-2 px-3.5">
                                    <span className={`px-2 py-0.5 rounded text-[10px] ${RISK_BADGE[vessel.risk]}`}>
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

              {/* ── Footer CTAs ──────────────────────────────────────────────────── */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-800">
                <button
                  onClick={handleReset}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold tracking-wider transition-colors cursor-pointer"
                >
                  ← Upload Another SAR Scene
                </button>

                {driftResult && aisResult ? (
                  <Link
                    href={`/dashboard?case=${encodeURIComponent(analysisResult.spill_id)}`}
                    className="w-full sm:w-auto px-6 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs tracking-wider transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
                  >
                    <span>👉 VIEW LIVE INVESTIGATION IN 7-STEP DASHBOARD</span>
                    <span>→</span>
                  </Link>
                ) : (
                  <Link
                    href="/dashboard"
                    className="w-full sm:w-auto px-6 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs tracking-wider transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20"
                  >
                    <span>OPEN FULL DEMO CASE (SPILL-001)</span>
                    <span>→</span>
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Drag and drop area */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={onFileInputChange}
                accept="image/png,image/jpeg,image/tiff,.tif,.tiff"
                className="hidden"
              />

              <div
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 sm:p-12 text-center cursor-pointer transition-all ${
                  isDragging
                    ? "border-amber-400 bg-amber-500/10 scale-[1.01]"
                    : file
                    ? "border-emerald-500/60 bg-emerald-950/20"
                    : "border-slate-700 hover:border-amber-400/60 bg-slate-950/60 hover:bg-slate-950"
                }`}
              >
                {file ? (
                  <div className="flex flex-col items-center gap-3">
                    {previewUrl ? (
                      <div className="w-36 h-36 rounded-lg overflow-hidden border border-slate-700 bg-slate-900 shadow-md relative mb-1">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={previewUrl}
                          alt="Uploaded SAR Scene"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-16 h-16 rounded-xl bg-emerald-900/40 border border-emerald-700 flex items-center justify-center text-2xl mb-1 text-emerald-300">
                        📄
                      </div>
                    )}
                    <div>
                      <p className="font-mono text-sm font-bold text-emerald-300">
                        {file.name}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {(file.size / (1024 * 1024)).toFixed(2)} MB · {file.type || "GeoTIFF/Image"}
                      </p>
                    </div>
                    <span className="text-[11px] text-amber-400 font-semibold underline underline-offset-2">
                      Click to replace file
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2.5">
                    <div className="w-14 h-14 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center text-2xl text-slate-300 mb-1">
                      🛰
                    </div>
                    <p className="text-base font-bold text-slate-200">
                      Drop SAR / EO satellite scene here
                    </p>
                    <p className="text-xs text-slate-500">
                      PNG / JPG, or a georeferenced GeoTIFF (Sentinel-1 GRD) up to 500 MB — GeoTIFFs are located automatically
                    </p>
                    <div className="mt-2 inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-md bg-slate-900 border border-slate-700 text-slate-300 hover:bg-slate-800">
                      Browse Files
                    </div>
                  </div>
                )}
              </div>

              {/* Error Display */}
              {errorMessage && (
                <div className="mt-4 p-3 rounded-lg border border-red-800/60 bg-red-950/40 text-xs text-red-300 flex items-center gap-2">
                  <span>⚠</span>
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Action Row */}
              <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-800">
                <div className="text-xs text-slate-500 leading-relaxed text-center sm:text-left">
                  <span className="font-semibold text-slate-400">YOLOv8 Model Status:</span>{" "}
                  Loaded (<span className="font-mono text-slate-400">oilspill_yolov8_seg_best.pt</span>).
                  Clicking Analyze will execute live segmentation inference.
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <button
                    disabled={!file || isAnalyzing}
                    onClick={handleAnalyzeClick}
                    className={`w-full sm:w-auto px-6 py-3 rounded-lg font-bold text-xs tracking-wider transition-all flex items-center justify-center gap-2 ${
                      file && !isAnalyzing
                        ? "bg-amber-500 hover:bg-amber-400 text-slate-950 cursor-pointer shadow-md shadow-amber-500/20"
                        : isAnalyzing
                        ? "bg-amber-600/80 text-slate-950 cursor-wait animate-pulse"
                        : "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700"
                    }`}
                  >
                    {isAnalyzing ? (
                      <>
                        <span className="inline-block w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                        <span>ANALYZING SAR IMAGE...</span>
                      </>
                    ) : (
                      <>
                        <span>ANALYZE SPILL</span>
                        {file && <span>⚡</span>}
                      </>
                    )}
                  </button>

                  <Link
                    href="/dashboard"
                    className="w-full sm:w-auto px-5 py-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-xs tracking-wider transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap"
                  >
                    <span>OPEN DEMO (SPILL-001)</span>
                    <span>→</span>
                  </Link>
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      {/* ── Footer ────────────────────────────────────────────────────────────── */}
      <footer className="flex-none border-t border-slate-800/80 bg-slate-950/80 py-4 px-6 text-center text-xs text-slate-600 flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-mono">
          <span>SlickTrace AI v1.0</span>
          <span>·</span>
          <span>SAR Detection + Lagrangian Hindcast + AIS Attribution</span>
        </div>
        <div className="text-[11px] text-slate-600">
          Developed for Marine Environment Protection &amp; Enforcement Intelligence
        </div>
      </footer>
    </div>
  );
}
