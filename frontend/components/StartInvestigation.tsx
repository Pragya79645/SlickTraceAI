"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useState, useRef, useMemo, useEffect, ChangeEvent, DragEvent } from "react";
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
  Route,
  Satellite,
  Ship,
  TriangleAlert,
  Waves,
  Zap,
} from "lucide-react";

import ModelMetricsPanel from "@/components/ModelMetricsPanel";
import DossierButton from "@/components/DossierButton";
import PipelineHUD from "@/components/PipelineHUD";

// Leaflet map component (client-only, SSR-safe)
const SpillMap = dynamic(() => import("@/components/SpillMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-80 flex items-center justify-center bg-paper-alt rounded-[2px] text-ink-soft text-xs font-mono border border-grid">
      Loading geospatial survey map…
    </div>
  ),
});

const STAGE_BADGE_STYLE: Record<string, string> = {
  complete: "bg-paper text-safe border-grid font-semibold",
  inputs_required: "bg-paper text-pending border-grid font-semibold",
  waiting: "bg-paper-alt text-ink-soft border-grid font-normal",
  failed: "bg-paper text-hazard border-hazard font-semibold",
};

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

  // Live Zulu Time clock
  const [zuluTime, setZuluTime] = useState("14:09:30Z");
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setZuluTime(now.toISOString().slice(11, 19) + "Z");
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

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
      setErrorMessage("Please upload an image file (PNG, JPG, TIFF).");
      return;
    }
    setFile(selectedFile);
    setErrorMessage(null);
    setAnalysisResult(null);
    setPipelineEvents([]);
    setPipelineSummary(null);
    setDriftResult(null);
    setAisResult(null);
    setEcologyResult(null);

    if (selectedFile.name.endsWith(".tif") || selectedFile.name.endsWith(".tiff")) {
      setPreviewUrl(null);
    } else {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(selectedFile);
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

  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

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
    setAnalysisResult(null);
    setDriftResult(null);
    setAisResult(null);
    setSelectedVesselId(null);
    setPipelineEvents([]);
    setPipelineSummary(null);

    try {
      const finalResult = await analyzeSpillImageStream(file, undefined, pushPipelineEvent);
      setAnalysisResult(finalResult);
      setPipelineSummary(
        finalResult.attribution?.candidate_vessels[0]
          ? `${finalResult.spill_id} — primary suspect ${finalResult.attribution.candidate_vessels[0].vessel_name} (MMSI ${finalResult.attribution.candidate_vessels[0].vessel_id}) at ${finalResult.attribution.candidate_vessels[0].score}/100`
          : `${finalResult.spill_id} — ${finalResult.detection_count} slick region(s) detected`
      );

      if (finalResult.timestamp) {
        setTimestamp(finalResult.timestamp);
      }

      // A georeferenced scene anchors itself: adopt the backend's anchor so the
      // investigator sees the full chain at once.
      if (
        finalResult.anchor_source === "geotiff" &&
        finalResult.detection?.centroid.lat != null &&
        finalResult.detection.centroid.lon != null
      ) {
        setLatitude(finalResult.detection.centroid.lat.toFixed(6));
        setLongitude(finalResult.detection.centroid.lon.toFixed(6));
      }

      if (finalResult.drift) setDriftResult(finalResult.drift);
      if (finalResult.ecology) setEcologyResult(finalResult.ecology);
      if (finalResult.attribution) {
        setAisResult(finalResult.attribution);
        setSelectedVesselId(finalResult.attribution.candidate_vessels[0]?.vessel_id ?? null);
      }
      if (finalResult.chain_error) setDriftError(finalResult.chain_error);
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to analyze image. Ensure backend is running."
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleRunDrift = async (
    overrideLat?: number,
    overrideLon?: number,
    overrideTime?: string
  ) => {
    if (!analysisResult) return;
    const lat = overrideLat !== undefined ? overrideLat : parseFloat(latitude);
    const lon = overrideLon !== undefined ? overrideLon : parseFloat(longitude);
    const time = overrideTime || timestamp;

    if (isNaN(lat) || isNaN(lon)) {
      setDriftError("Valid latitude and longitude are required.");
      return;
    }

    setIsDrifting(true);
    setDriftError(null);
    setAisResult(null);
    setSelectedVesselId(null);

    try {
      const result = await runDriftReconstruction({
        spill_id: analysisResult.spill_id,
        latitude: lat,
        longitude: lon,
        timestamp: time || new Date().toISOString(),
        coordinate_source: "investigator_scene_anchor",
      });
      setDriftResult(result);

      // Trigger automatic ecological threat screening from forecast trajectory
      try {
        const eco = await runEcologicalAssessment({
          forecast_trajectory: result.forecast.trajectory,
          spill_id: analysisResult.spill_id, // persists onto the live record for the dashboard
        });
        setEcologyResult(eco);
      } catch {
        // non-blocking
      }
    } catch (err: unknown) {
      setDriftError(err instanceof Error ? err.message : "Drift reconstruction failed.");
    } finally {
      setIsDrifting(false);
    }
  };

  const handleRunAIS = async () => {
    if (!driftResult || !analysisResult) return;

    setIsCorrelating(true);
    setAisError(null);

    try {
      const result = await runAISCorrelation({
        spill_id: analysisResult.spill_id,
        origin: {
          latitude: driftResult.hindcast.estimated_origin.lat,
          longitude: driftResult.hindcast.estimated_origin.lon,
          timestamp: driftResult.hindcast.estimated_origin.timestamp,
        },
        origin_ellipses: driftResult.ensemble?.hindcast_steps.at(-1)?.ellipses,
      });
      setAisResult(result);
      if (result.candidate_vessels.length > 0) {
        setSelectedVesselId(result.candidate_vessels[0].vessel_id);
      }
    } catch (err: unknown) {
      setAisError(err instanceof Error ? err.message : "AIS correlation failed.");
    } finally {
      setIsCorrelating(false);
    }
  };

  const liveMapData: InvestigationResponse | null = useMemo(() => {
    if (!analysisResult?.detection || !driftResult || !aisResult) return null;
    return {
      spill_id: analysisResult.spill_id,
      detection: analysisResult.detection,
      drift: driftResult,
      attribution: aisResult,
      ais_summary: {
        total_records: aisResult.candidate_vessels.reduce(
          (acc, v) => acc + (v.track?.length || 0),
          0
        ),
        unique_vessels: aisResult.candidate_vessels.length,
        columns: ["MMSI", "vessel_name", "timestamp", "latitude", "longitude", "SOG_knots", "COG_degrees", "heading_degrees"],
        vessel_names: aisResult.candidate_vessels.map((v) => v.vessel_name),
      },
      ecology: ecologyResult || undefined,
      is_live: true,
      filename: file?.name ?? null,
      overlay_image: analysisResult.overlay_image,
    };
  }, [analysisResult, driftResult, aisResult, ecologyResult, file?.name]);

  const handleReset = () => {
    setFile(null);
    setPreviewUrl(null);
    setAnalysisResult(null);
    setDriftResult(null);
    setAisResult(null);
    setEcologyResult(null);
    setPipelineEvents([]);
    setPipelineSummary(null);
    setErrorMessage(null);
    setDriftError(null);
    setAisError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const selectedVessel = useMemo(() => {
    if (!aisResult || !selectedVesselId) return null;
    return (
      aisResult.candidate_vessels.find((v) => v.vessel_id === selectedVesselId) ||
      aisResult.candidate_vessels[0]
    );
  }, [aisResult, selectedVesselId]);

  return (
    <div className="min-h-screen bg-paper text-ink font-body cartographic-grid flex flex-col selection:bg-ink selection:text-paper">
      {/* ── 1. Top Defense & Maritime Surveillance Ribbon ───────────────────── */}
      <div className="bg-[#0C1217] text-[#8297A6] font-mono text-[10px] px-4 py-1.5 flex items-center justify-between border-b border-[#1E2D38] tracking-wider shrink-0 overflow-x-auto whitespace-nowrap select-none">
        <div className="flex items-center gap-2.5">
          <span className="w-2 h-2 bg-[#10B981] inline-block" />
          <span className="font-bold text-[#D0D7DE]">DEFENSE &amp; MARITIME SURVEILLANCE DIRECTORY</span>
          <span className="text-[#3E4C59]">|</span>
          <span>STATION: GULF-NOR-04 (GULF OF MEXICO SECTOR 8)</span>
          <span className="text-[#3E4C59]">|</span>
          <span>AUTONOMOUS COPERNICUS LINK ACTIVE</span>
        </div>
        <div className="flex items-center gap-3">
          <span>UTC ZULU: <strong className="text-[#D0D7DE]">{zuluTime}</strong></span>
          <span className="text-[#3E4C59]">|</span>
          <span className="text-[#EAB308] font-bold">OP-AUTH: LEVEL-4 CLEARANCE</span>
        </div>
      </div>

      {/* ── 2. Technical Navigation Bar ───────────────────────────────────────── */}
      <header className="border-b border-grid-strong bg-paper/95 backdrop-blur-sm px-4 py-2 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            title="System Navigation Menu"
            className="w-8 h-8 border border-grid-strong flex flex-col items-center justify-center gap-1 bg-paper-alt hover:bg-paper cursor-pointer rounded-[1px] transition-colors"
          >
            <span className="w-4 h-0.5 bg-ink block" />
            <span className="w-4 h-0.5 bg-ink block" />
            <span className="w-4 h-0.5 bg-ink block" />
          </button>
          <div className="h-6 w-px bg-grid hidden sm:block" />
          <Link href="/" className="flex items-center gap-2.5 group">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand-logo-icon.png"
              alt="SlickTrace AI mark"
              className="w-9 h-9 object-contain shrink-0"
            />
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5 leading-none">
                <span className="font-display font-black text-lg text-ink tracking-tight">SlickTrace</span>
                <span className="bg-ink text-paper font-mono text-[9px] font-bold px-1.5 py-0.5 rounded-[1px]">AI V4.8</span>
              </div>
              <span className="text-[8px] font-mono text-ink-soft tracking-wider mt-0.5 uppercase">
                Maritime Hydrocarbon Slicks &amp; AIS Attribution
              </span>
            </div>
          </Link>
        </div>

        {/* Center telemetry metadata */}
        <div className="hidden xl:flex items-center gap-3 text-[10px] font-mono text-ink-soft">
          <span className="flex items-center gap-1.5 text-ink">
            <span className="w-1.5 h-1.5 bg-safe inline-block" />
            <strong>RADAR CALIBRATION:</strong> NORMAL
          </span>
          <span className="text-grid-strong">/</span>
          <span><strong>ORBIT:</strong> S1A PASS 142 DESCENDING</span>
          <span className="text-grid-strong">/</span>
          <span><strong>RES:</strong> 10m GRD</span>
          <span className="text-grid-strong">/</span>
          <span><strong>DATUM:</strong> WGS 84 (EPSG:4326)</span>
        </div>

        {/* Right Session ID & Action */}
        <div className="flex items-center gap-3 shrink-0 text-xs">
          <div className="hidden sm:flex flex-col text-right font-mono text-[10px] text-ink-soft leading-tight">
            <span>SESSION ID: <strong className="text-ink">@TRC-88219-X</strong></span>
            <span>LATENCY: <strong className="text-safe">24ms</strong> SECURE</span>
          </div>
          <button
            type="button"
            onClick={() => {
              if (file && !isAnalyzing) {
                handleAnalyzeClick();
              } else {
                fileInputRef.current?.click();
              }
            }}
            className="bg-ink hover:bg-ink-soft text-paper px-3.5 py-1.5 rounded-[2px] font-mono text-xs font-bold tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <span>▶</span>
            <span>INITIALIZE RUN</span>
          </button>
        </div>
      </header>

      {/* ── 3. Page Header: Dossier Stamp, Title, Evidentiary Box ───────────── */}
      <div className="px-5 sm:px-8 pt-5 pb-4 border-b border-grid bg-paper/60">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 text-[10px] font-mono">
            <span className="bg-ink text-paper px-2 py-0.5 font-bold rounded-[2px]">FORM ST-409</span>
            <span className="text-grid-strong">/</span>
            <span className="text-ink-soft uppercase tracking-wider">INTAKE DOSSIER</span>
            <span className="text-grid-strong">/</span>
            <span className="text-ink-soft uppercase tracking-wider">SECTION 01: SENSOR INGESTION &amp; PAYLOAD VERIFICATION</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="archival-stamp border border-hazard text-hazard px-2.5 py-0.5 text-[10px] font-mono font-bold tracking-wider uppercase bg-hazard/5">
              DOSSIER SENSITIVE // OFFICIAL RECORD
            </div>
            <span className="text-[9px] font-mono text-ink-soft uppercase tracking-wider hidden sm:inline">
              CHAIN OF CUSTODY: VERIFIED
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start mt-2">
          <div className="lg:col-span-8">
            <h1 className="text-3xl sm:text-4xl font-display font-black text-ink tracking-tight">
              Upload SAR / EO satellite scene
            </h1>
            <p className="text-xs sm:text-sm text-ink-soft leading-relaxed mt-1.5 max-w-3xl">
              A georeferenced Sentinel-1 GRD GeoTIFF executes the uninterrupted forensic chain — computer-vision slick delineation, Lagrangian backward-drift origin reconstruction, MMSI vessel corridor match, and IMO evidentiary packaging.
            </p>
          </div>
          <div className="lg:col-span-4 border border-grid-strong bg-paper-alt/70 p-3 rounded-[2px] font-mono text-[10px] text-ink space-y-1">
            <div className="flex justify-between">
              <span className="text-ink-soft">EVIDENTIARY PROTOCOL</span>
              <span className="font-bold">ISO 14001 / IMO MARPOL ANNEX I</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-soft">JURISDICTION: <strong className="text-ink">GULF-EEZ</strong></span>
              <span className="text-ink-soft">SENSOR BAND: <strong className="text-ink">SAR C-BAND</strong></span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-soft">GRID FIDELITY: <strong className="text-ink">SUB-PIXEL</strong></span>
              <span className="text-ink-soft">CUSTODY ID: <strong className="text-ink">ST-2026-USCG</strong></span>
            </div>
          </div>
        </div>
      </div>

      {/* ── 4. Main Interactive Workspace ──────────────────────────────────── */}
      <main className="flex-1 px-5 sm:px-8 py-5">
        <input
          type="file"
          ref={fileInputRef}
          onChange={onFileInputChange}
          accept="image/png,image/jpeg,image/tiff,.tif,.tiff"
          className="hidden"
        />

        {analysisResult ? (
          /* ── When Analyzed: Full Multi-Stage Scientific Dossier ─────────────── */
          <div className="space-y-6 max-w-[1700px] mx-auto">
            {/* Status bar */}
            <div className="p-3 border border-grid bg-paper rounded-[2px] flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-[2px] bg-safe" />
                <span className="font-bold text-ink">Scene Analyzed:</span>
                <span className="text-ink-soft">{file?.name ?? analysisResult.spill_id}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-3 py-1 border border-grid bg-paper-alt hover:bg-paper text-ink rounded-[2px] cursor-pointer"
                >
                  Upload new scene
                </button>
                {liveMapData && <DossierButton data={liveMapData} />}
              </div>
            </div>

            {/* Stage 1: Detection findings */}
            <div className="border border-grid bg-paper-alt/60 p-5 rounded-[2px] space-y-4">
              {analysisResult.detection ? (
              <>
              <div className="flex items-center justify-between border-b border-grid pb-2">
                <h2 className="font-display font-bold text-base text-ink flex items-center gap-2">
                  <span className="w-5 h-5 bg-ink text-paper text-xs flex items-center justify-center font-mono">01</span>
                  Sentinel-1 SAR Detection Findings
                </h2>
                <span className="text-xs font-mono text-safe font-semibold">
                  {(analysisResult.detection.confidence * 100).toFixed(1)}% confidence
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                <div className="p-3 border border-grid bg-paper rounded-[2px]">
                  <span className="text-ink-soft block text-[10px]">Visible Area</span>
                  <span className="text-base font-bold text-ink">{analysisResult.detection.area.km2.toFixed(3)} km²</span>
                </div>
                <div className="p-3 border border-grid bg-paper rounded-[2px]">
                  <span className="text-ink-soft block text-[10px]">Perimeter</span>
                  <span className="text-base font-bold text-ink">{analysisResult.detection.perimeter.km.toFixed(2)} km</span>
                </div>
                <div className="p-3 border border-grid bg-paper rounded-[2px]">
                  <span className="text-ink-soft block text-[10px]">Elongation</span>
                  <span className="text-base font-bold text-ink">{analysisResult.detection.elongation_ratio.toFixed(2)}</span>
                </div>
                <div className="p-3 border border-grid bg-paper rounded-[2px]">
                  <span className="text-ink-soft block text-[10px]">Weathering</span>
                  <span className="text-base font-bold text-ink uppercase">{analysisResult.detection.age_estimate.category}</span>
                </div>
              </div>
              </>
              ) : (
              <div className="p-3 border border-grid bg-paper rounded-[2px] text-xs font-mono text-ink-soft">
                No slick detected in this scene — detection statistics unavailable.
              </div>
              )}

              {/* Mask overlay visual */}
              {analysisResult.overlay_image && (
                <div className="border border-grid bg-paper p-3 rounded-[2px] space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-ink">Extracted Slick Mask</span>
                    <button
                      type="button"
                      onClick={() => setShowRawScene((v) => !v)}
                      className="text-[11px] font-mono text-ink-soft underline cursor-pointer"
                    >
                      {showRawScene ? "Show segmented mask" : "Show original scene"}
                    </button>
                  </div>
                  <div className="h-64 sm:h-80 w-full overflow-hidden border border-grid bg-black rounded-[2px] flex items-center justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={(showRawScene ? analysisResult.preview_image : analysisResult.overlay_image) ?? analysisResult.preview_image ?? ""}
                      alt="Segmented slick mask"
                      className="w-full h-full object-contain"
                    />
                  </div>
                </div>
              )}

              {/* Stage 2 Drift Trigger */}
              {!driftResult && (
                <div className="border border-grid bg-paper p-4 rounded-[2px] space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display font-bold text-sm text-ink flex items-center gap-2">
                      <span className="w-5 h-5 bg-ink text-paper text-xs flex items-center justify-center font-mono">02</span>
                      Execute Lagrangian Drift Hindcast
                    </h3>
                    <span className="text-[10px] font-mono text-ink-soft">ERA5 + Ocean Current Advection</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs">
                    <div>
                      <label className="text-[10px] text-ink-soft block mb-1">Latitude</label>
                      <input
                        type="text"
                        value={latitude}
                        onChange={(e) => setLatitude(e.target.value)}
                        className="w-full p-2 border border-grid bg-paper-alt rounded-[2px] text-ink font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-ink-soft block mb-1">Longitude</label>
                      <input
                        type="text"
                        value={longitude}
                        onChange={(e) => setLongitude(e.target.value)}
                        className="w-full p-2 border border-grid bg-paper-alt rounded-[2px] text-ink font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-ink-soft block mb-1">Acquisition Timestamp (UTC)</label>
                      <input
                        type="text"
                        value={timestamp}
                        onChange={(e) => setTimestamp(e.target.value)}
                        className="w-full p-2 border border-grid bg-paper-alt rounded-[2px] text-ink font-mono"
                      />
                    </div>
                  </div>
                  {driftError && <p className="text-xs font-mono text-hazard">{driftError}</p>}
                  <button
                    type="button"
                    onClick={() => handleRunDrift()}
                    disabled={isDrifting}
                    className="w-full py-2 bg-ink hover:bg-ink-soft text-paper text-xs font-mono font-bold rounded-[2px] transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isDrifting ? "Computing 6-Hour Lagrangian Backtrack…" : "Run Drift Reconstruction (Stage 02)"}
                  </button>
                </div>
              )}
            </div>

            {/* Stage 2 findings & Stage 3 AIS */}
            {driftResult && (
              <div className="border border-grid bg-paper-alt/60 p-5 rounded-[2px] space-y-4">
                <div className="flex items-center justify-between border-b border-grid pb-2">
                  <h2 className="font-display font-bold text-base text-ink flex items-center gap-2">
                    <span className="w-5 h-5 bg-ink text-paper text-xs flex items-center justify-center font-mono">02</span>
                    Reconstructed Spill Origin
                  </h2>
                  <span className="text-xs font-mono text-safe font-semibold">
                    −{driftResult.hindcast.duration_hours}h backtrack complete
                  </span>
                </div>

                <div className="p-3 border border-grid bg-paper rounded-[2px] font-mono text-xs flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-[10px] text-ink-soft block">Estimated Origin Coordinate</span>
                    <strong className="text-ink text-sm">
                      {driftResult.hindcast.estimated_origin.lat.toFixed(4)}°N, {driftResult.hindcast.estimated_origin.lon.toFixed(4)}°E
                    </strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-ink-soft block">Discharge Time Window</span>
                    <strong className="text-ink">
                      {new Date(driftResult.hindcast.estimated_origin.timestamp).toUTCString()}
                    </strong>
                  </div>
                </div>

                {!aisResult && (
                  <div className="border border-grid bg-paper p-4 rounded-[2px] space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-display font-bold text-sm text-ink flex items-center gap-2">
                        <span className="w-5 h-5 bg-ink text-paper text-xs flex items-center justify-center font-mono">03</span>
                        Correlate Global AIS Vessel Tracks
                      </h3>
                      <span className="text-[10px] font-mono text-ink-soft">30 km corridor screening</span>
                    </div>
                    {aisError && <p className="text-xs font-mono text-hazard">{aisError}</p>}
                    <button
                      type="button"
                      onClick={handleRunAIS}
                      disabled={isCorrelating}
                      className="w-full py-2 bg-ink hover:bg-ink-soft text-paper text-xs font-mono font-bold rounded-[2px] transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {isCorrelating ? "Querying AIS Telemetry & Evidence Scoring…" : "Execute AIS Attribution (Stage 03)"}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Stage 3 findings & Live Map */}
            {aisResult && liveMapData && (
              <div className="border border-grid bg-paper-alt/60 p-5 rounded-[2px] space-y-4">
                <div className="flex items-center justify-between border-b border-grid pb-2">
                  <h2 className="font-display font-bold text-base text-ink flex items-center gap-2">
                    <span className="w-5 h-5 bg-ink text-paper text-xs flex items-center justify-center font-mono">03</span>
                    Vessel Attribution &amp; Geospatial Casefile
                  </h2>
                  <Link
                    href={`/dashboard?case=${encodeURIComponent(analysisResult.spill_id)}`}
                    className="px-3 py-1 bg-ink text-paper font-mono text-xs font-bold rounded-[2px] hover:bg-ink-soft transition-colors"
                  >
                    Open in Full Console →
                  </Link>
                </div>

                {/* Integrated Map */}
                <div className="h-96 w-full rounded-[2px] overflow-hidden border border-grid relative">
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
          </div>
        ) : (
          /* ── When Idle: Exact Match with User's Reference Screenshot ────────── */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-[1700px] mx-auto items-start">
            {/* ── Left Column (7 cols): Bay + Accepted Specs ─────────────────── */}
            <div className="lg:col-span-7 flex flex-col space-y-5">
              {/* Card A: SENSOR INGESTION BAY — primary dossier sheet */}
              <div className="dossier-sheet torn-a tape fold-corner dossier-reveal border-2 border-ink bg-paper rounded-[2px] overflow-visible">
                <span aria-hidden="true" className="tape-strip tl" />
                <span aria-hidden="true" className="tape-strip tr" />
                <span aria-hidden="true" className="fold" />
                {/* Bay Header */}
                <div className="bg-paper-alt border-b border-grid px-4 py-2 flex items-center justify-between text-xs font-mono">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 bg-ink text-paper flex items-center justify-center font-bold text-[10px] rounded-[1px]">
                      01
                    </span>
                    <span className="font-bold text-ink">SENSOR INGESTION BAY · PORT #01-A</span>
                    <span className="bg-safe/15 text-safe border border-safe/40 text-[9px] px-1.5 py-0.2 font-bold rounded-[1px]">
                      ONLINE
                    </span>
                  </div>
                  <div className="text-[10px] text-ink-soft hidden sm:flex items-center gap-3">
                    <span>POLARIZATION: VV + VH // CARRIER FREQ: 5.405 GHz</span>
                    <span className="font-bold text-ink">SWATH APERTURE: 250 KM IW MODE</span>
                  </div>
                </div>

                {/* Inner Dropzone with Radar Watermark */}
                {isAnalyzing || pipelineEvents.length > 0 ? (
                  <div className="p-4">
                    <PipelineHUD
                      events={pipelineEvents}
                      running={isAnalyzing}
                      summary={pipelineSummary}
                      error={errorMessage}
                    />
                  </div>
                ) : (
                  <div
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className="relative m-4 p-8 border border-dashed border-grid-strong bg-paper-alt/40 hover:bg-paper-alt/70 transition-colors cursor-pointer text-center rounded-[2px] overflow-hidden group"
                  >
                    {/* Radar / Sonar Watermark SVG */}
                    <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-25" viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice">
                      <circle cx="200" cy="100" r="40" fill="none" stroke="#51697A" strokeWidth="0.75" strokeDasharray="3 3" />
                      <circle cx="200" cy="100" r="80" fill="none" stroke="#51697A" strokeWidth="0.75" />
                      <circle cx="200" cy="100" r="130" fill="none" stroke="#51697A" strokeWidth="0.75" strokeDasharray="4 4" />
                      <line x1="200" y1="0" x2="200" y2="200" stroke="#51697A" strokeWidth="0.5" />
                      <line x1="0" y1="100" x2="400" y2="100" stroke="#51697A" strokeWidth="0.5" />
                      <line x1="80" y1="0" x2="320" y2="200" stroke="#51697A" strokeWidth="0.25" strokeDasharray="3 3" />
                    </svg>

                    <div className="relative z-10 flex flex-col items-center">
                      <div className="text-[10px] font-mono font-bold text-pending flex items-center gap-1.5 mb-1.5">
                        <span>■</span>
                        <span>AWAITING SCENE MANIFEST TRANSMISSION</span>
                      </div>
                      <h2 className="text-xl sm:text-2xl font-display font-bold text-ink">
                        Ingest Primary Satellite SAR / EO Payload
                      </h2>
                      <p className="text-xs text-ink-soft max-w-lg mt-1 mb-5">
                        Direct ingestion for Sentinel-1 GRD GeoTIFF (VV/VH bands) or standard raster imagery (.png, .jpg, .tif). Max file size 500 MB.
                      </p>

                      <div className="flex flex-wrap items-center justify-center gap-3">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                          className="px-4 py-2 bg-ink hover:bg-ink-soft text-paper font-mono font-bold text-xs rounded-[2px] flex items-center gap-2 shadow-sm cursor-pointer"
                        >
                          <span>⇪</span>
                          <span>SELECT SAR SCENE FILE</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                          className="px-4 py-2 border border-grid-strong bg-paper hover:bg-paper-alt text-ink font-mono font-medium text-xs rounded-[2px] flex items-center gap-2 cursor-pointer"
                        >
                          <span>📄</span>
                          <span>Add AIS Log (.csv/.gpx)</span>
                        </button>
                      </div>

                      <div className="text-[10px] font-mono text-ink-soft mt-4">
                        DRAG &amp; DROP: Scene GeoTIFF (.tif) or drop files directly onto cartographic canvas
                      </div>

                      {file && (
                        <div className="mt-4 p-2.5 bg-paper border border-grid text-left font-mono text-xs text-ink flex items-center justify-between w-full max-w-md shadow-sm">
                          <div>
                            <strong className="block truncate">{file.name}</strong>
                            <span className="text-[10px] text-ink-soft">{(file.size / (1024 * 1024)).toFixed(2)} MB · Ready for analysis</span>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleAnalyzeClick(); }}
                            className="px-3 py-1 bg-ink hover:bg-ink-soft text-paper text-xs font-bold rounded-[2px] cursor-pointer"
                          >
                            Process Now
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 4-column telemetry readouts strip */}
                <div className="border-t border-grid bg-paper-alt/80 px-4 py-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] font-mono text-ink-soft border-b border-grid">
                  <div>PROJECTION CHECK: <strong className="text-ink">EPSG:4326 (WGS84)</strong></div>
                  <div>SAR NOISE FLOOR: <strong className="text-ink">NESZ &le; -22 dB</strong></div>
                  <div>RADIO. DEPTH: <strong className="text-ink">16-bit Unsigned</strong></div>
                  <div>CALIBRATION LUT: <strong className="text-ink">Sigma-0 (σ°) Enabled</strong></div>
                </div>

                {/* Bottom bay status */}
                <div className="px-4 py-2 flex items-center justify-between text-[10px] font-mono text-ink bg-paper">
                  <div className="flex items-center gap-1.5 text-safe font-semibold">
                    <span>■</span>
                    <span>AUTOMATIC HYDRODYNAMIC BOUNDARY CONDITIONS: ARMED</span>
                  </div>
                  <div className="text-ink-soft">
                    STANDBY BUFFER: <strong className="text-ink">{file ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` : "0 / 500 MB"}</strong>
                  </div>
                </div>
              </div>

              {/* Card B: ACCEPTED INPUT SPECIFICATIONS — warmer evidence paper */}
              <div className="dossier-sheet dossier-warm torn-c tilt-slight-r dossier-reveal border border-grid bg-paper rounded-[2px]">
                <div className="px-4 py-2 border-b border-grid bg-paper-alt flex items-center justify-between text-[10px] font-mono">
                  <div className="flex items-center gap-1.5 font-bold text-ink">
                    <span>■</span>
                    <span>ACCEPTED INPUT SPECIFICATIONS &amp; RADIOMETRIC ENVELOPE</span>
                  </div>
                  <span className="text-ink-soft">STANDARDS REF: SENS-SPEC-V4.8</span>
                </div>

                <div className="p-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Column 1 */}
                  <div className="p-3 border border-grid bg-paper-alt/50 rounded-[2px] flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[9px] font-mono font-bold text-ink-soft uppercase">RADAR SATELLITE</span>
                        <span className="text-[9px] font-mono font-semibold px-1.5 py-0.2 bg-paper border border-grid text-ink">AUTOMATED</span>
                      </div>
                      <h3 className="font-mono text-sm font-bold text-ink">GeoTIFF (.tif)</h3>
                      <p className="text-[11px] text-ink-soft mt-1 leading-relaxed">
                        Sentinel-1 IW / EW GRD. Dual-pol VV+VH. Self-georeferencing with native ellipsoid tie points.
                      </p>
                    </div>
                    <div className="mt-3 pt-2 border-t border-grid text-[10px] font-mono text-safe flex items-center justify-between">
                      <span>Full automated pipeline trigger</span>
                      <span>●</span>
                    </div>
                  </div>

                  {/* Column 2 */}
                  <div className="p-3 border border-grid bg-paper-alt/50 rounded-[2px] flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[9px] font-mono font-bold text-ink-soft uppercase">OPTICAL / STANDARD</span>
                        <span className="text-[9px] font-mono font-semibold px-1.5 py-0.2 bg-paper border border-grid text-ink">INTERACTIVE</span>
                      </div>
                      <h3 className="font-mono text-sm font-bold text-ink">PNG / JPEG</h3>
                      <p className="text-[11px] text-ink-soft mt-1 leading-relaxed">
                        Standard RGB or single-channel greyscale crops. Requires manual coordinate pin prompt after slick segmentation.
                      </p>
                    </div>
                    <div className="mt-3 pt-2 border-t border-grid text-[10px] font-mono text-pending flex items-center justify-between">
                      <span>Prompted spatial anchoring</span>
                      <span>●</span>
                    </div>
                  </div>

                  {/* Column 3 */}
                  <div className="p-3 border border-grid bg-paper-alt/50 rounded-[2px] flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[9px] font-mono font-bold text-ink-soft uppercase">ANCILLARY DATA</span>
                        <span className="text-[9px] font-mono font-semibold px-1.5 py-0.2 bg-paper border border-grid text-ink">OPTIONAL</span>
                      </div>
                      <h3 className="font-mono text-sm font-bold text-ink">AIS / Wind Logs</h3>
                      <p className="text-[11px] text-ink-soft mt-1 leading-relaxed">
                        NMEA 0183 or CSV vessel position streams ±12h around acquisition time. Overrides Global Fishing Watch sync.
                      </p>
                    </div>
                    <div className="mt-3 pt-2 border-t border-grid text-[10px] font-mono text-ink-soft flex items-center justify-between">
                      <span>Sub-second timestamp matching</span>
                      <span>●</span>
                    </div>
                  </div>
                </div>

                {/* Security clearance banner */}
                <div className="border-t border-grid px-4 py-2 bg-paper-alt flex flex-col sm:flex-row sm:items-center justify-between text-[10px] font-mono gap-1">
                  <div className="flex items-center gap-1.5 text-hazard font-bold">
                    <span>■</span>
                    <span>SECURITY CLEARANCE: STRICT MARITIME FORENSIC PROTOCOL</span>
                  </div>
                  <span className="text-ink-soft">
                    SHA-256 HASH GENERATED AT INGESTION FOR ADMISSIBLE TRIBUNAL FILINGS
                  </span>
                </div>
              </div>
            </div>

            {/* ── Right Column (5 cols): Pipeline Execution + Engine Telemetry ── */}
            <div className="lg:col-span-5 flex flex-col space-y-5">
              {/* Card C: AUTONOMOUS PIPELINE EXECUTION — primary dossier, bottom tear */}
              <div className="dossier-sheet torn-bottom tape tilt-l dossier-reveal border-2 border-ink bg-paper p-4 rounded-[2px]">
                <span aria-hidden="true" className="tape-strip tc" />
                <div className="flex items-center justify-between pb-2 border-b border-grid">
                  <div>
                    <h2 className="font-display font-bold text-sm text-ink tracking-tight">
                      AUTONOMOUS PIPELINE EXECUTION
                    </h2>
                    <p className="text-[9px] font-mono text-ink-soft tracking-wider mt-0.5">
                      HYDROGRAPHIC SOUNDING LINE · 4 DISCRETE PHASES
                    </p>
                  </div>
                  <span className="border border-grid-strong bg-paper-alt px-2 py-0.5 font-mono text-[11px] font-bold text-ink rounded-[1px]">
                    EST. ~28.4s
                  </span>
                </div>

                {/* 4 discrete phases on sounding line */}
                <div className="mt-4 pl-3 border-l-2 border-grid-strong space-y-4 font-mono">
                  {/* Phase 1 */}
                  <div className="relative pl-3">
                    <span className="absolute -left-[19px] top-0 w-4 h-4 bg-ink text-paper text-[9px] font-bold flex items-center justify-center rounded-[1px]">
                      01
                    </span>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <strong className="text-xs text-ink">Segment</strong>
                        <span className="text-[9px] px-1 bg-paper-alt border border-grid text-ink-soft">YOLOV8-SEG CV</span>
                      </div>
                      <span className="text-[10px] text-ink-soft">T+3.8s</span>
                    </div>
                    <p className="text-[11px] font-sans text-ink-soft mt-1 leading-relaxed">
                      Adaptive CFAR thresholding isolates low-backscatter oil dampening patches. High-resolution mask polygonisation &amp; area metrication (km²).
                    </p>
                    <div className="mt-1.5 inline-block text-[10px] bg-paper-alt px-2 py-0.5 border border-grid text-ink-soft">
                      Sub-patch tile: 1024x1024 px • IoU 0.45
                    </div>
                  </div>

                  {/* Phase 2 */}
                  <div className="relative pl-3">
                    <span className="absolute -left-[19px] top-0 w-4 h-4 bg-ink text-paper text-[9px] font-bold flex items-center justify-center rounded-[1px]">
                      02
                    </span>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <strong className="text-xs text-ink">Reconstruct</strong>
                        <span className="text-[9px] px-1 bg-paper-alt border border-grid text-ink-soft">LAGRANGIAN DRIFT</span>
                      </div>
                      <span className="text-[10px] text-ink-soft">T+12.4s</span>
                    </div>
                    <p className="text-[11px] font-sans text-ink-soft mt-1 leading-relaxed">
                      Backward trajectory simulation (Runge-Kutta 4th order) utilizing HYCOM ocean surface currents &amp; ECMWF ERA5 10m wind vector forcing (-6 to -18 hours).
                    </p>
                    <div className="mt-1.5 inline-block text-[10px] bg-paper-alt px-2 py-0.5 border border-grid text-ink-soft">
                      500-particle Monte Carlo uncertainty ellipse
                    </div>
                  </div>

                  {/* Phase 3 */}
                  <div className="relative pl-3">
                    <span className="absolute -left-[19px] top-0 w-4 h-4 bg-ink text-paper text-[9px] font-bold flex items-center justify-center rounded-[1px]">
                      03
                    </span>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <strong className="text-xs text-ink">Intercept</strong>
                        <span className="text-[9px] px-1 bg-paper-alt border border-grid text-ink-soft">AIS CORRIDOR</span>
                      </div>
                      <span className="text-[10px] text-ink-soft">T+21.0s</span>
                    </div>
                    <p className="text-[11px] font-sans text-ink-soft mt-1 leading-relaxed">
                      Spatiotemporal corridor intersection with global AIS tracks. Identifies dark vessels (AIS gap analysis) and dead-reckoning trajectory crossing probability.
                    </p>
                    <div className="mt-1.5 inline-block text-[10px] bg-paper-alt px-2 py-0.5 border border-grid text-ink-soft">
                      Kinematic speed/draft anomaly filter
                    </div>
                  </div>

                  {/* Phase 4 */}
                  <div className="relative pl-3">
                    <span className="absolute -left-[19px] top-0 w-4 h-4 bg-ink text-paper text-[9px] font-bold flex items-center justify-center rounded-[1px]">
                      04
                    </span>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <strong className="text-xs text-ink">Attribution</strong>
                        <span className="text-[9px] px-1 bg-paper-alt border border-grid text-ink-soft">IMO LEGAL DOSSIER</span>
                      </div>
                      <span className="text-[10px] text-ink-soft">T+28.4s</span>
                    </div>
                    <p className="text-[11px] font-sans text-ink-soft mt-1 leading-relaxed">
                      Ranked suspect list with evidentiary score (0-100%), meteorological certificate, vessel MMSI/IMO registration, and exportable legal brief.
                    </p>
                    <div className="mt-1.5 inline-block text-[10px] bg-paper-alt px-2 py-0.5 border border-grid text-ink-soft">
                      Output: Form ST-409 Casefile PDF &amp; GeoPackage
                    </div>
                  </div>
                </div>

                {/* Pipeline state footer */}
                <div className="mt-4 pt-2.5 border-t border-grid flex items-center justify-between text-[10px] font-mono text-ink-soft">
                  <div className="flex items-center gap-1.5 text-safe font-semibold">
                    <span>■</span>
                    <span>Deterministic state machine ready</span>
                  </div>
                  <span>PIPELINE ENGINE: PYTORCH / GDAL</span>
                </div>
              </div>

              {/* Card D: INFERENCE ENGINE TELEMETRY & CONFIDENCE PROFILE */}
              <ModelMetricsPanel compact={false} />
            </div>
          </div>
        )}
      </main>

      {/* ── 5. Global Bottom Calibration Ribbon ─────────────────────────────── */}
      <footer className="mt-auto border-t border-grid-strong bg-paper pl-14 pr-6 sm:px-6 py-2 flex flex-col sm:flex-row items-center justify-between gap-2 text-[10px] font-mono text-ink shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-ink-soft">■</span>
          <span><strong>GRID CALIBRATION:</strong> LAT 28°14'24.8" N / LON 091°32'11.2" W / NAUTICAL SCALE 1:50,000</span>
          <span className="text-grid-strong tracking-tighter">[||||||||||||||||||]</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="border border-grid px-2 py-0.5 bg-paper-alt text-ink font-semibold">
            MARPOL ANNEX I COMPLIANT
          </span>
          <span>
            CASEFILE DOSSIER: <strong className="text-hazard font-mono">SLK-2026-09A</strong>
          </span>
        </div>
      </footer>
    </div>
  );
}
