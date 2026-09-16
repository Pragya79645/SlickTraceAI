"use client";

import React, { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import type { InvestigationResponse, CandidateVessel, DemoCase } from "@/lib/api";
import { DEMO_CASES, nextDemoCase } from "@/lib/api";
import {
  Check,
  Clock,
  Gauge,
  LayoutGrid,
  Leaf,
  MapPin,
  Pause,
  Play,
  Route,
  Search,
  Ship,
  TriangleAlert,
  X,
  Zap,
} from "lucide-react";
import ModelMetricsPanel from "@/components/ModelMetricsPanel";
import DossierButton from "@/components/DossierButton";

const SpillMap = dynamic(() => import("@/components/SpillMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-paper rounded-[2px] text-ink-soft text-xs font-mono tracking-wider border border-grid">
      Loading interactive geospatial situation map…
    </div>
  ),
});

const RISK_BADGE: Record<string, string> = {
  HIGH: "bg-paper text-hazard border-hazard font-bold",
  MEDIUM: "bg-paper text-pending border-pending font-bold",
  LOW: "bg-paper text-ink-soft border-grid font-normal",
};

interface Props {
  data: InvestigationResponse;
  cases?: DemoCase[]; // switchable cases (live upload first when present)
  notice?: string;
  onSwitchCase: (caseId: string) => void;
  onOpenConsole: () => void;
}

const STAGES = [
  { id: 1, label: "01 — Detect", short: "Detection", title: "Detect unknown slick" },
  { id: 2, label: "02 — Characterise", short: "Characterisation", title: "Physical characterisation" },
  { id: 3, label: "03 — Trace back", short: "Drift Hindcast", title: "Hydrodynamic hindcast" },
  { id: 4, label: "04 — Find vessels", short: "AIS Search", title: "AIS corridor correlation" },
  { id: 5, label: "05 — Score evidence", short: "Evidence Scoring", title: "Explainable evidence scoring" },
  { id: 6, label: "06 — Attribution", short: "Vessel Lead", title: "Investigation conclusion" },
  { id: 7, label: "07 — Ecology", short: "Habitat Threat", title: "Ecological impact assessment" },
];

export default function InvestigationStoryMode({
  data,
  cases = DEMO_CASES,
  notice,
  onSwitchCase,
  onOpenConsole,
}: Props) {
  const [currentStage, setCurrentStage] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showHowWeGotHere, setShowHowWeGotHere] = useState(false);
  const [selectedVesselId, setSelectedVesselId] = useState<string | null>(null);
  const [customTimelineIdx, setCustomTimelineIdx] = useState<number | null>(null);

  const { detection, drift, attribution, ecology } = data;
  const topCandidate = attribution.candidate_vessels[0];
  const nextCase = nextDemoCase(data.spill_id, cases);
  const activeCase = cases.find((c) => c.id === data.spill_id);

  // Effective selected vessel
  const effectiveVesselId = selectedVesselId || topCandidate?.vessel_id || null;
  const selectedVessel: CandidateVessel =
    attribution.candidate_vessels.find((v) => v.vessel_id === effectiveVesselId) ||
    topCandidate || {
      vessel_id: "N/A",
      vessel_name: "No Candidates",
      score: 0,
      risk: "LOW",
      min_distance_km: 0,
      time_difference_hours: 0,
      proximity_score: 0,
      temporal_score: 0,
      trajectory_score: 0,
      behavioral_score: 0,
      reasons: [],
    };

  // Autoplay sequencer
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isPlaying) {
      timer = setInterval(() => {
        setCurrentStage((prev) => {
          if (prev >= 7) {
            setIsPlaying(false);
            return 7;
          }
          return prev + 1;
        });
      }, 5500);
    }
    return () => clearInterval(timer);
  }, [isPlaying]);

  // Dynamic timeline index based on stage
  const defaultIdx =
    currentStage === 3
      ? 0 // origin (-6h)
      : currentStage === 7
      ? drift.hindcast.trajectory.length + 3 // forecast (+2h)
      : drift.hindcast.trajectory.length - 1; // observation (0h)

  const timelineIdx = customTimelineIdx !== null ? customTimelineIdx : defaultIdx;

  const handleStageSelect = (stageId: number) => {
    setCurrentStage(stageId);
    setIsPlaying(false);
    setCustomTimelineIdx(null);
  };

  const topThreat = ecology?.impacts[0];

  return (
    <div className="flex-1 flex flex-col bg-paper text-ink font-body cartographic-grid selection:bg-ink selection:text-paper">
      {/* ── Top Investigation Stepper Navigation Bar ────────────────────────── */}
      <div className="bg-paper border-b border-grid px-6 py-3 sticky top-0 z-20">
        <div className="max-w-[1800px] w-full mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Stepper Buttons */}
          <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto pb-1 md:pb-0">
            {STAGES.map((stg) => {
              const isActive = currentStage === stg.id;
              const isPast = currentStage > stg.id;
              return (
                <button
                  key={stg.id}
                  type="button"
                  onClick={() => handleStageSelect(stg.id)}
                  className={`px-3 py-1.5 rounded-[2px] text-xs font-mono font-bold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer border ${
                    isActive
                      ? "bg-ink text-paper border-ink"
                      : isPast
                      ? "bg-paper text-safe border-safe/40"
                      : "bg-paper text-ink-soft border-grid hover:text-ink"
                  }`}
                >
                  <span>{isPast ? <Check size={11} strokeWidth={3} /> : stg.id}</span>
                  <span>{stg.short}</span>
                </button>
              );
            })}
          </div>

          {/* Controls: Play/Pause, Scenario Switcher, Full Console */}
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <button
              type="button"
              onClick={() => setIsPlaying(!isPlaying)}
              className="px-3 py-1.5 rounded-[2px] text-xs font-mono font-bold bg-paper hover:bg-paper-alt text-ink border border-grid transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <span className="flex items-center gap-1.5">{isPlaying ? <><Pause size={12} strokeWidth={2} />Pause</> : <><Play size={12} strokeWidth={2} />Play auto-story</>}</span>
            </button>

            <button
              type="button"
              onClick={() => onSwitchCase(nextCase.id)}
              title={nextCase.headline}
              className="px-3 py-1.5 rounded-[2px] text-xs font-mono font-bold transition-all flex items-center gap-1.5 cursor-pointer border bg-paper text-ink border-grid hover:bg-paper-alt"
            >
              <Zap size={12} strokeWidth={2} />
              <span>Next: {nextCase.label}</span>
            </button>
            {cases.length > 1 && (
              <div className="hidden md:flex items-center gap-1 text-[10px] font-mono">
                {cases.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onSwitchCase(c.id)}
                    title={c.headline}
                    className={`px-2 py-1 rounded-[2px] border cursor-pointer transition-colors ${
                      c.id === data.spill_id
                        ? "text-ink border-ink bg-paper-alt font-bold"
                        : "text-ink-soft border-grid hover:text-ink"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}

            <DossierButton data={data} />
            <button
              type="button"
              onClick={onOpenConsole}
              className="px-3.5 py-1.5 rounded-[2px] text-xs font-semibold bg-paper hover:bg-paper-alt text-ink border border-grid transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <span className="flex items-center gap-1.5"><LayoutGrid size={12} strokeWidth={1.75} />Full Console</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Dynamic Stage Presentation Workspace ────────────────────────────── */}
      <div className="flex-1 p-5 max-w-[1800px] w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* ── Left Side: Interactive Map & Trajectory Surface (7 cols) ───────── */}
        <div className="lg:col-span-7 flex flex-col space-y-3">
          <div className="flex-1 min-h-[460px] lg:min-h-[580px] rounded-[2px] border border-grid overflow-hidden relative bg-paper-alt">
            <SpillMap
              key={data.spill_id}
              data={data}
              timelineIdx={timelineIdx}
              selectedVesselId={selectedVesselId}
              onVesselSelect={setSelectedVesselId}
              onTimelineChange={setCustomTimelineIdx}
            />
          </div>

          {/* Sub-map Stage Context Strip */}
          <div className="p-3 rounded-[2px] bg-paper-alt border border-grid text-xs font-mono flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-ink-soft font-bold">Current stage:</span>
              <span className="text-ink font-bold">{STAGES[currentStage - 1].title}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={currentStage <= 1}
                onClick={() => {
                  setCurrentStage((p) => Math.max(1, p - 1));
                  setIsPlaying(false);
                }}
                className="px-2.5 py-1 rounded-[2px] bg-paper border border-grid text-ink disabled:opacity-30 disabled:cursor-not-allowed hover:bg-paper-alt text-[11px] cursor-pointer"
              >
                Prev stage
              </button>
              <button
                type="button"
                disabled={currentStage >= 7}
                onClick={() => {
                  setCurrentStage((p) => Math.min(7, p + 1));
                  setIsPlaying(false);
                }}
                className="px-3 py-1 rounded-[2px] bg-ink text-paper font-bold disabled:opacity-30 disabled:cursor-not-allowed hover:bg-ink-soft text-[11px] cursor-pointer"
              >
                Next stage
              </button>
            </div>
          </div>
        </div>

        {/* ── Right Side: Dedicated Stage Story Card (5 cols) ─────────────────── */}
        <div className="lg:col-span-5 flex flex-col justify-between">
          <div className="dossier-sheet torn-a rounded-[2px] border border-grid bg-paper p-6 space-y-5 flex-1 flex flex-col justify-between">
            {/* ── STAGE 1: DETECT UNKNOWN SLICK ──────────────────────────────── */}
            {currentStage === 1 && (
              <div className="space-y-4 animate-in fade-in duration-300">
                <div className="flex items-center justify-between border-b border-grid pb-3">
                  <span className="px-2.5 py-1 rounded-[2px] text-xs font-mono font-bold bg-ink text-paper">
                    Stage 01 of 07
                  </span>
                  <span className={`text-xs font-mono ${data.is_live ? "text-safe font-bold" : "text-ink-soft"}`}>
                    {data.is_live ? `Live upload · ${data.filename ?? data.spill_id}` : "Sentinel-1 SAR satellite pass"}
                  </span>
                </div>

                {notice && (
                  <div className="p-2.5 rounded-[2px] bg-paper-alt border border-grid text-[11px] text-ink font-mono">
                    {notice}
                  </div>
                )}

                <div>
                  <h3 className="text-2xl font-display font-bold text-ink">
                    Detect unknown slick
                  </h3>
                  <p className="text-sm text-ink-soft mt-1.5 leading-relaxed">
                    <strong className="text-ink">Before SlickTrace:</strong>{" "}
                    {data.is_live
                      ? `Your uploaded scene${data.anchor_source === "geotiff" ? ", auto-georeferenced from its GeoTIFF metadata" : ""} — an unidentified dark patch with no ship visible in the frame.`
                      : "This is just an unidentified dark patch on a Sentinel-1 radar scene with no ship visible in the frame."}
                  </p>
                </div>

                {data.overlay_image && (
                  <div className="rounded-[2px] overflow-hidden border border-grid bg-paper-alt">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={data.overlay_image} alt="Detected slick mask on the uploaded scene" className="w-full max-h-72 object-contain" />
                    <div className="px-3 py-1.5 text-[10px] font-mono text-ink-soft border-t border-grid">
                      Segmentation mask painted on your scene{activeCase ? ` · ${activeCase.headline}` : ""}
                    </div>
                  </div>
                )}

                <div className="p-4 rounded-[2px] bg-paper-alt/60 border border-grid space-y-3">
                  <div className="text-[10px] font-semibold text-ink-soft">
                    YOLOv8 instance segmentation
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="p-3 rounded-[2px] bg-paper border border-grid">
                      <span className="text-[10px] text-ink-soft block">Detection confidence</span>
                      <span className="text-2xl font-mono font-bold text-safe">
                        {(detection.confidence * 100).toFixed(2)}%
                      </span>
                    </div>
                    <div className="p-3 rounded-[2px] bg-paper border border-grid">
                      <span className="text-[10px] text-ink-soft block">Visible surface area</span>
                      <span className="text-2xl font-mono font-bold text-ink">
                        {detection.area.km2.toFixed(4)} <span className="text-xs font-normal text-ink-soft">km²</span>
                      </span>
                    </div>
                    {detection.bonn_volume && (
                      <div className="p-3 rounded-[2px] bg-paper border border-grid col-span-2 sm:col-span-1">
                        <span className="text-[10px] text-ink-soft block">Est. volume (Bonn code {detection.bonn_volume.appearance_code})</span>
                        <span className="text-xl font-mono font-bold text-ink">
                          {Math.round(detection.bonn_volume.volume_tonnes_min)}–{Math.round(detection.bonn_volume.volume_tonnes_max)} <span className="text-xs font-normal text-ink-soft">t</span>
                        </span>
                        <span className="text-[10px] text-ink-soft block">{detection.bonn_volume.thickness_um_min}–{detection.bonn_volume.thickness_um_max} µm assumed</span>
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-ink-soft">
                    Polygon contour: <span className="text-ink font-mono">{detection.polygon.length} boundary vertices extracted</span>
                    {detection.backscatter_damping_db != null && (
                      <> · backscatter damping <span className="text-ink font-mono">{detection.backscatter_damping_db} dB</span> vs surrounding water</>
                    )}
                  </div>
                  <ModelMetricsPanel compact />
                </div>

                <div className="p-3 rounded-[2px] bg-paper-alt border border-grid text-xs text-ink-soft leading-relaxed">
                  <strong className="text-ink">Key investigative question:</strong> The slick is detected, but where did it originate hours before?
                </div>
              </div>
            )}

            {/* ── STAGE 2: CHARACTERISE ──────────────────────────────────────── */}
            {currentStage === 2 && (
              <div className="space-y-4 animate-in fade-in duration-300">
                <div className="flex items-center justify-between border-b border-grid pb-3">
                  <span className="px-2.5 py-1 rounded-[2px] text-xs font-mono font-bold bg-ink text-paper">
                    Stage 02 of 07
                  </span>
                  <span className="text-xs text-ink-soft">
                    Morphological and ageing analysis
                  </span>
                </div>

                <div>
                  <h3 className="text-2xl font-display font-bold text-ink">
                    Physical slick characterisation
                  </h3>
                  <p className="text-sm text-ink-soft mt-1.5 leading-relaxed">
                    The detected slick becomes a measurable investigation target with exact geometry and weathering metrics.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-[2px] bg-paper-alt/60 border border-grid">
                    <span className="text-[10px] text-ink-soft block">Perimeter</span>
                    <span className="text-xl font-mono font-bold text-ink mt-0.5 block">
                      {detection.perimeter.km.toFixed(2)} km
                    </span>
                    <span className="text-[10px] text-ink-soft font-mono">{detection.perimeter.pixels} pixels</span>
                  </div>

                  <div className="p-3 rounded-[2px] bg-paper-alt/60 border border-grid">
                    <span className="text-[10px] text-ink-soft block">Elongation ratio</span>
                    <span className="text-xl font-mono font-bold text-ink mt-0.5 block">
                      {detection.elongation_ratio.toFixed(3)}
                    </span>
                    <span className="text-[10px] text-ink-soft font-mono">Major / minor axis</span>
                  </div>

                  <div className="p-3 rounded-[2px] bg-paper-alt/60 border border-grid">
                    <span className="text-[10px] text-ink-soft block">Weathering category</span>
                    <span className="text-xl font-mono font-bold text-pending mt-0.5 block">
                      {detection.age_estimate.category}
                    </span>
                    <span className="text-[10px] text-ink-soft font-mono">Edge density: {detection.age_estimate.edge_density}</span>
                  </div>

                  <div className="p-3 rounded-[2px] bg-paper-alt/60 border border-grid">
                    <span className="text-[10px] text-ink-soft block">Observation anchor</span>
                    <span className="text-xs font-mono font-bold text-safe mt-1 block truncate">
                      {drift.observation.latitude.toFixed(4)}°N, {drift.observation.longitude.toFixed(4)}°E
                    </span>
                    <span className="text-[10px] text-ink-soft font-mono">Satellite observation point</span>
                  </div>
                </div>

                <div className="p-3 rounded-[2px] bg-paper-alt border border-grid text-xs text-ink-soft">
                  The physical dimensions provide the exact initial condition for the hydrodynamic drift model.
                </div>
              </div>
            )}

            {/* ── STAGE 3: TRACE BACK ────────────────────────────────────────── */}
            {currentStage === 3 && (
              <div className="space-y-4 animate-in fade-in duration-300">
                <div className="flex items-center justify-between border-b border-grid pb-3">
                  <span className="px-2.5 py-1 rounded-[2px] text-xs font-mono font-bold bg-ink text-paper">
                    Stage 03 of 07 · Physics engine
                  </span>
                  <span className="text-xs font-mono text-hazard font-bold">
                    Estimated — not confirmed
                  </span>
                </div>

                <div>
                  <h3 className="text-2xl font-display font-bold text-ink">
                    Lagrangian hydrodynamic backtrack
                  </h3>
                  <p className="text-sm text-ink-soft mt-1.5 leading-relaxed">
                    <strong className="text-ink">The physics breakthrough:</strong> We know where the oil is now. 2D Lagrangian advection lets us calculate where it originated 6 hours earlier.
                  </p>
                </div>

                {/* Origin Box */}
                <div className="p-4 rounded-[2px] bg-paper-alt border border-hazard/40 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold text-hazard">
                      Reconstructed spill origin corridor
                    </span>
                    <span className="text-[10px] font-mono text-ink-soft">
                      ~{drift.hindcast.estimated_origin.hours_before_observation}h earlier
                    </span>
                  </div>
                  <div className="text-2xl font-mono font-bold text-ink">
                    {drift.hindcast.estimated_origin.lat.toFixed(5)}°N, {drift.hindcast.estimated_origin.lon.toFixed(5)}°E
                  </div>
                  <div className="text-xs font-mono text-ink-soft">
                    Discharge time window: <strong className="text-ink">{new Date(drift.hindcast.estimated_origin.timestamp).toUTCString()}</strong>
                  </div>
                </div>

                {/* Monte Carlo Uncertainty */}
                {drift.ensemble && (() => {
                  const originStep = drift.ensemble.hindcast_steps[drift.ensemble.hindcast_steps.length - 1];
                  const b50 = originStep.ellipses.find((e) => e.confidence === 0.5);
                  const b80 = originStep.ellipses.find((e) => e.confidence === 0.8);
                  const b95 = originStep.ellipses.find((e) => e.confidence === 0.95);
                  return (
                    <div className="p-3.5 rounded-[2px] bg-paper-alt/60 border border-grid space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono font-bold text-ink">
                          Origin uncertainty — Monte Carlo ensemble
                        </span>
                        <span className="text-[10px] font-mono text-ink-soft">
                          {drift.ensemble.n_particles} particles · seed {drift.ensemble.seed}
                        </span>
                      </div>
                      <p className="text-xs text-ink-soft leading-relaxed">
                        A single line is a lie of precision. Each particle drifts with its own perturbed current, wind, and wind-drift factor plus turbulent diffusion — the spread after {drift.hindcast.duration_hours}h is the honest search area.
                      </p>
                      <div className="grid grid-cols-3 gap-2 text-center font-mono">
                        {[["50%", b50, "text-hazard"], ["80%", b80, "text-pending"], ["95%", b95, "text-ink-soft"]].map(([label, band, color]) => {
                          const e = band as typeof b50;
                          return (
                            <div key={label as string} className="p-2 rounded-[2px] bg-paper border border-grid">
                              <span className="text-[10px] text-ink-soft block">{label as string} band</span>
                              <span className={`text-sm font-bold ${color as string}`}>{e ? `${e.area_km2} km²` : "—"}</span>
                              <span className="text-[10px] text-ink-soft block">{e ? `${e.semi_major_km} × ${e.semi_minor_km} km` : ""}</span>
                            </div>
                          );
                        })}
                      </div>
                      <div className="text-[10px] font-mono text-ink-soft">
                        Spread at −{drift.hindcast.duration_hours}h: {originStep.spread_km} km RMS · perturbations: {drift.ensemble.perturbations.current_speed}, {drift.ensemble.perturbations.wind_drift_factor}
                      </div>
                    </div>
                  );
                })()}

                {/* Environmental Vectors */}
                <div className="grid grid-cols-2 gap-2.5 text-xs font-mono">
                  <div className="p-2.5 rounded-[2px] bg-paper-alt/60 border border-grid">
                    <span className="text-[10px] text-ink-soft block">Ocean surface current</span>
                    <span className="font-bold text-ink">
                      u={drift.environment.current.u_ms} m/s, v={drift.environment.current.v_ms} m/s
                    </span>
                    <span className="block text-[10px] mt-1 text-ink-soft">
                      {drift.environment.source === "open_meteo"
                        ? `${drift.environment.provider_detail} · valid ${drift.environment.valid_time}`
                        : `source: ${drift.environment.source}`}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-[2px] bg-paper-alt/60 border border-grid">
                    <span className="text-[10px] text-ink-soft block">Combined drift speed</span>
                    <span className="font-bold text-safe">
                      {drift.environment.drift.speed_ms.toFixed(4)} m/s (~{drift.hindcast.duration_hours}h trace)
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* ── STAGE 4: FIND THE VESSELS ──────────────────────────────────── */}
            {currentStage === 4 && (
              <div className="space-y-4 animate-in fade-in duration-300">
                <div className="flex items-center justify-between border-b border-grid pb-3">
                  <span className="px-2.5 py-1 rounded-[2px] text-xs font-mono font-bold bg-ink text-paper">
                    Stage 04 of 07
                  </span>
                  <span className="text-xs text-ink-soft">
                    AIS vessel telemetry ingestion
                  </span>
                </div>

                <div>
                  <h3 className="text-2xl font-display font-bold text-ink">
                    Who was in the origin corridor?
                  </h3>
                  <p className="text-sm text-ink-soft mt-1.5 leading-relaxed">
                    SlickTrace queries historical AIS ship positions around the <strong className="text-hazard">reconstructed origin</strong> — not the drifting slick.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
                  <div className="p-3 rounded-[2px] bg-paper-alt/60 border border-grid">
                    <span className="text-[10px] text-ink-soft block">Search radius</span>
                    <span className="text-lg font-bold text-pending mt-0.5 block">30 km</span>
                  </div>
                  <div className="p-3 rounded-[2px] bg-paper-alt/60 border border-grid">
                    <span className="text-[10px] text-ink-soft block">Time window</span>
                    <span className="text-lg font-bold text-ink mt-0.5 block">±6.0 hours</span>
                  </div>
                  <div className="p-3 rounded-[2px] bg-paper-alt/60 border border-grid">
                    <span className="text-[10px] text-ink-soft block">Vessels found</span>
                    <span className="text-lg font-bold text-safe mt-0.5 block">{data.ais_summary.unique_vessels} ships</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-[2px] bg-paper-alt/60 border border-grid space-y-2">
                  <span className="text-[10px] font-semibold text-ink-soft block">
                    Candidate corridor intersections
                  </span>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {attribution.candidate_vessels.slice(0, 4).map((v, i) => (
                      <div
                        key={v.vessel_id}
                        onClick={() => setSelectedVesselId(v.vessel_id)}
                        className="flex items-center justify-between p-2 rounded-[2px] bg-paper hover:bg-paper-alt cursor-pointer text-xs font-mono border border-grid"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-ink-soft font-bold">#{i + 1}</span>
                          <span className="text-ink font-medium">{v.vessel_name}</span>
                          {v.went_dark && (
                            <span className="px-1.5 py-0.5 rounded-[2px] text-[9px] font-bold bg-paper text-hazard border border-hazard/40">Dark</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-ink-soft">{v.min_distance_km} km away</span>
                          <span className={`px-1.5 py-0.5 rounded-[2px] border text-[10px] font-mono ${RISK_BADGE[v.risk]}`}>{v.risk}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── STAGE 5: SCORE THE CANDIDATES ──────────────────────────────── */}
            {currentStage === 5 && (
              <div className="space-y-4 animate-in fade-in duration-300">
                <div className="flex items-center justify-between border-b border-grid pb-3">
                  <span className="px-2.5 py-1 rounded-[2px] text-xs font-mono font-bold bg-ink text-paper">
                    Stage 05 of 07
                  </span>
                  <span className="text-xs text-ink-soft">
                    Multi-factor evidence stacking
                  </span>
                </div>

                <div>
                  <h3 className="text-2xl font-display font-bold text-ink">
                    Explainable evidence scoring
                  </h3>
                  <p className="text-sm text-ink-soft mt-1.5 leading-relaxed">
                    The system did not just pick a ship — it mathematically scored 4 independent dimensions of physical evidence.
                  </p>
                </div>

                {/* Score Cards */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="p-3 rounded-[2px] bg-paper-alt/60 border border-grid">
                    <div className="flex justify-between text-xs">
                      <span className="text-ink-soft font-semibold flex items-center gap-1.5"><MapPin size={11} strokeWidth={1.75} />Proximity</span>
                      <span className="font-bold text-safe font-mono">{selectedVessel.proximity_score} / 35</span>
                    </div>
                    <span className="text-[10px] text-ink-soft font-mono block mt-1">
                      {selectedVessel.min_distance_km} km from origin
                    </span>
                  </div>

                  <div className="p-3 rounded-[2px] bg-paper-alt/60 border border-grid">
                    <div className="flex justify-between text-xs">
                      <span className="text-ink-soft font-semibold flex items-center gap-1.5"><Clock size={11} strokeWidth={1.75} />Timing</span>
                      <span className="font-bold text-ink font-mono">{selectedVessel.temporal_score} / 20</span>
                    </div>
                    <span className="text-[10px] text-ink-soft font-mono block mt-1">
                      {selectedVessel.time_difference_hours}h temporal delta
                    </span>
                  </div>

                  <div className="p-3 rounded-[2px] bg-paper-alt/60 border border-grid">
                    <div className="flex justify-between text-xs">
                      <span className="text-ink-soft font-semibold flex items-center gap-1.5"><Route size={11} strokeWidth={1.75} />Trajectory</span>
                      <span className="font-bold text-pending font-mono">{selectedVessel.trajectory_score} / 30</span>
                    </div>
                    <span className="text-[10px] text-ink-soft font-mono block mt-1">
                      Crossed origin advection path
                    </span>
                  </div>

                  <div className="p-3 rounded-[2px] bg-paper-alt/60 border border-grid">
                    <div className="flex justify-between text-xs">
                      <span className="text-ink-soft font-semibold flex items-center gap-1.5"><Gauge size={11} strokeWidth={1.75} />Behaviour</span>
                      <span className="font-bold text-hazard font-mono">{selectedVessel.behavioral_score} / 15</span>
                    </div>
                    <span className="text-[10px] text-ink-soft font-mono block mt-1">
                      Speed drop / dark transmission
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-[2px] bg-paper-alt border border-grid flex items-center justify-between">
                  <span className="text-xs font-bold text-ink">Total evidence score</span>
                  <span className="text-2xl font-mono font-bold text-ink">
                    {selectedVessel.score.toFixed(1)} <span className="text-xs font-normal text-ink-soft">/ 100</span>
                  </span>
                </div>
              </div>
            )}

            {/* ── STAGE 6: VESSEL ATTRIBUTION DOSSIER ────────────────────────── */}
            {currentStage === 6 && (
              <div className="space-y-4 animate-in fade-in duration-300">
                <div className="flex items-center justify-between border-b border-grid pb-3">
                  <span className="px-2.5 py-1 rounded-[2px] text-xs font-mono font-bold bg-paper text-hazard border border-hazard/40">
                    Stage 06 of 07 · Attribution
                  </span>
                  <span className="text-xs font-mono text-safe font-bold">
                    Evidence ranked
                  </span>
                </div>

                {/* Hero Conclusion Box */}
                <div className="p-5 rounded-[2px] bg-paper-alt border border-ink space-y-3">
                  <span className="text-[10px] font-semibold text-ink-soft block">
                    Strongest investigative lead
                  </span>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-3xl font-display font-bold text-ink tracking-tight">
                      <Ship size={20} strokeWidth={1.75} className="inline mr-2 -mt-1" />{topCandidate.vessel_name}
                    </h3>
                    <span className={`px-3 py-1 rounded-[2px] border text-xs font-mono ${RISK_BADGE[topCandidate.risk]}`}>
                      {topCandidate.risk} risk
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-ink-soft border-t border-grid pt-2">
                    <span className="font-mono">
                      MMSI: <strong className="text-ink">{topCandidate.vessel_id}</strong>
                      {topCandidate.vessel_type && <> · {topCandidate.vessel_type}</>}
                      {topCandidate.flag && <> · {topCandidate.flag} flag</>}
                    </span>
                    <span className="font-mono">Attribution score: <strong className="text-ink text-lg">{topCandidate.score.toFixed(1)} / 100</strong></span>
                  </div>

                  {/* Evidence Checklist */}
                  <div className="space-y-1.5 bg-paper p-3 rounded-[2px] border border-grid pt-2">
                    <span className="text-[10px] font-semibold text-ink-soft block mb-1">
                      Why {topCandidate.vessel_name}? (measured AIS evidence)
                    </span>
                    {topCandidate.reasons.map((r, idx) => (
                      <div key={idx} className="text-xs text-ink flex items-start gap-2">
                        <span className="text-safe shrink-0 mt-0.5">—</span>
                        <span className="capitalize">{r}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-2.5 rounded-[2px] bg-paper-alt border border-grid text-[10px] font-mono text-center text-ink-soft">
                  Satellite · Physics · AIS · Evidence · <strong className="text-ink">Attribution</strong>
                </div>
              </div>
            )}

            {/* ── STAGE 7: ECOLOGICAL THREAT & HABITAT IMPACT ────────────────── */}
            {currentStage === 7 && (
              <div className="space-y-4 animate-in fade-in duration-300">
                <div className="flex items-center justify-between border-b border-grid pb-3">
                  <span className="px-2.5 py-1 rounded-[2px] text-xs font-mono font-bold bg-ink text-paper">
                    Stage 07 of 07 · Wildlife and habitat
                  </span>
                  <span className={`px-2 py-0.5 rounded-[2px] text-[10px] font-mono font-bold border ${
                    ecology?.assessment.response_priority === "HIGH"
                      ? "bg-paper text-hazard border-hazard/40"
                      : "bg-paper text-safe border-safe/40"
                  }`}>
                    {ecology?.assessment.response_priority === "HIGH" ? "High priority action" : "Low exposure"}
                  </span>
                </div>

                <div>
                  <h3 className="text-2xl font-display font-bold text-ink flex items-center gap-2">
                    <span className="flex items-center gap-1.5"><Leaf size={12} strokeWidth={1.75} />Ecological impact assessment</span>
                  </h3>
                  <p className="text-sm text-ink mt-1.5 leading-relaxed">
                    Forward hydrodynamic drift trajectory screened against sensitive Marine Protected Areas and coastal breeding reserves.
                  </p>
                </div>

                {/* Top Priority / Direct Threat Hero Card */}
                {data.ecological_exposure && data.ecological_exposure.threats.length > 0 ? (
                  (() => {
                    const topRamsar = data.ecological_exposure.threats[0];
                    const isCurrent = topRamsar.exposure_basis === "CURRENT_OBSERVATION";
                    const isForecast = topRamsar.exposure_basis === "FORECAST_INTERSECTION";
                    const isNear = topRamsar.exposure_basis === "PROXIMITY_ONLY" && topRamsar.threat_level === "NEAR_THREAT";

                    const bannerTitle = isCurrent
                      ? "Protected area currently intersected"
                      : isForecast
                      ? "Forecast trajectory enters protected area"
                      : isNear
                      ? "Within 10 km of protected area"
                      : "No significant Ramsar exposure";

                    const timingLabel = isCurrent
                      ? "Observed spill overlap (t=0h)"
                      : isForecast && topRamsar.estimated_time_to_impact_hours !== null && topRamsar.estimated_time_to_impact_hours !== undefined
                      ? `+${topRamsar.estimated_time_to_impact_hours} hours`
                      : `No direct entry (${topRamsar.minimum_distance_km} km approach)`;

                    return (
                      <div
                        className={`p-4 rounded-[2px] space-y-2.5 font-mono border-2 ${
                          isCurrent || isForecast
                            ? "bg-paper-alt border-hazard/40"
                            : isNear
                            ? "bg-paper-alt border-pending/40"
                            : "bg-paper-alt/60 border-safe/40"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className={`text-[10px] font-bold flex items-center gap-1.5 ${
                              isCurrent || isForecast ? "text-hazard" : isNear ? "text-ink" : "text-safe"
                            }`}
                          >
                            <span
                              className={`w-2 h-2 rounded-full ${
                                isCurrent || isForecast
                                  ? "bg-hazard animate-ping"
                                  : isNear
                                  ? "bg-pending animate-pulse"
                                  : "bg-safe"
                              }`}
                            />
                            <span>{bannerTitle}</span>
                          </span>
                          <span
                            className={`text-xs font-bold px-2 py-0.5 rounded border ${
                              isCurrent || isForecast
                                ? "bg-paper-alt text-hazard border-hazard/40"
                                : isNear
                                ? "bg-paper-alt text-pending border-pending/40"
                                : "bg-paper-alt text-safe border-safe/40"
                            }`}
                          >
                            {isCurrent ? "Current overlap" : topRamsar.threat_level.replace(/_/g, " ")}
                          </span>
                        </div>

                        <div>
                          <h4 className="text-lg font-display font-bold text-ink">{topRamsar.site_name}</h4>
                          <p className="text-xs text-ink">
                            {topRamsar.state} · Official Ramsar Protected Wetland (
                            {topRamsar.area_hectares ? `${topRamsar.area_hectares.toLocaleString()} ha` : "Surveyed GIS Cadastre"}
                            )
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs bg-paper p-2.5 rounded-[2px] border border-grid">
                          <div>
                            <span className="text-ink-soft text-[10px] block">Minimum Distance</span>
                            <strong className="text-ink text-base">{topRamsar.minimum_distance_km} km</strong>
                          </div>
                          <div>
                            <span className="text-ink-soft text-[10px] block">
                              {isCurrent ? "Exposure Status" : "Estimated First Contact"}
                            </span>
                            <strong className="text-hazard text-base">{timingLabel}</strong>
                          </div>
                        </div>

                        {/* 3-Step Chain Clarification */}
                        <div className="text-xs text-ink bg-paper p-2.5 rounded border border-grid space-y-1">
                          <div className="text-[10px] font-bold text-ink pb-0.5 border-b border-grid">
                            Forensic to ecological exposure chain
                          </div>
                          <div className="text-[11px]">
                            <span className="text-ink-soft">1. Observation (0h):</span> Current satellite detection anchor<br />
                            <span className="text-ink-soft">2. Forecast (+6h):</span> Predicted hydrodynamic trajectory<br />
                            <span className="text-ink-soft">3. Ramsar GIS:</span> {topRamsar.reason}
                          </div>
                        </div>
                      </div>
                    );
                  })()
                ) : topThreat && topThreat.threat_level === "HIGH" ? (
                  <div className="p-4 rounded-[2px] bg-paper-alt border-2 border-hazard/40 space-y-2.5 font-mono">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-hazard flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-hazard animate-ping" />
                        <span className="flex items-center gap-1.5"><TriangleAlert size={12} strokeWidth={2} />Potential ecological threat</span>
                      </span>
                      <span className="text-xs font-bold px-2 py-0.5 rounded bg-paper-alt text-hazard border border-hazard/40">
                        High threat
                      </span>
                    </div>

                    <div>
                      <h4 className="text-lg font-display font-bold text-ink">{topThreat.habitat_name}</h4>
                      <p className="text-xs text-hazard">
                        Type: {topThreat.type} · Screening Radius: {topThreat.impact_radius_km} km
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs bg-paper p-2.5 rounded-[2px] border border-grid">
                      <div>
                        <span className="text-ink-soft text-[10px] block">Forecast Min Distance</span>
                        <strong className="text-ink text-base">{topThreat.minimum_distance_km} km</strong>
                      </div>
                      <div>
                        <span className="text-ink-soft text-[10px] block">Estimated Exposure Window</span>
                        <strong className="text-hazard text-base">+{topThreat.estimated_time_to_impact_hours} hours</strong>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-[2px] bg-paper-alt/60 border border-safe/40 text-xs text-safe space-y-1">
                    <span className="font-bold block">No sensitive habitat exposure detected</span>
                    <span className="text-ink-soft">
                      The current forecast trajectory remains outside the prototype screening radii of all evaluated habitats.
                    </span>
                  </div>
                )}

                {/* Ramsar Wetland Sites Evaluated List */}
                <div className="p-3 rounded-[2px] bg-paper-alt/60 border border-grid space-y-2 font-mono text-xs">
                  <div className="flex items-center justify-between text-ink-soft text-[11px]">
                    <span>Ramsar wetland polygons ({data.ecological_exposure?.sites_analyzed || 99} GIS features)</span>
                    <span>Direct intersections: <strong className="text-hazard">{data.ecological_exposure?.direct_threats_count || 0}</strong></span>
                  </div>
                  <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
                    {(data.ecological_exposure?.threats || []).slice(0, 6).map((imp) => (
                      <div key={`${imp.site_name}-${imp.state}`} className="flex items-center justify-between p-1.5 rounded bg-paper text-[11px] border border-grid">
                        <span className="text-ink truncate max-w-[200px]">{imp.site_name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-ink-soft">{imp.minimum_distance_km} km</span>
                          <span
                            className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                              imp.threat_level === "DIRECT_THREAT"
                                ? "bg-paper text-hazard border border-hazard/40"
                                : imp.threat_level === "NEAR_THREAT"
                                ? "bg-paper text-ink border border-pending/40"
                                : "bg-paper text-safe border border-safe/40"
                            }`}
                          >
                            {imp.threat_level.replace(/_/g, " ")}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* CTA Row */}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowHowWeGotHere(true)}
                    className="flex-1 px-3 py-2.5 rounded-[2px] text-xs font-bold bg-paper-alt hover:bg-paper text-ink border border-grid transition-all cursor-pointer text-center"
                  >
                    How did we get here?
                  </button>

                  <button
                    type="button"
                    onClick={onOpenConsole}
                    className="flex-1 px-3 py-2.5 rounded-[2px] text-xs font-bold bg-ink hover:bg-ink-soft text-paper transition-all cursor-pointer text-center"
                  >
                    Full console
                  </button>
                </div>
              </div>
            )}

            {/* Bottom Next/Prev Action Buttons */}
            <div className="flex items-center justify-between pt-4 border-t border-grid text-xs">
              <button
                type="button"
                disabled={currentStage <= 1}
                onClick={() => {
                  setCurrentStage((p) => Math.max(1, p - 1));
                  setIsPlaying(false);
                }}
                className="px-4 py-2 rounded-[2px] bg-paper-alt/60 border border-grid text-ink disabled:opacity-30 disabled:cursor-not-allowed hover:bg-paper-alt transition-colors cursor-pointer"
              >
                Back
              </button>

              <span className="text-ink-soft text-[11px]">
                Stage {currentStage} of 7
              </span>

              <button
                type="button"
                onClick={() => {
                  if (currentStage >= 7) {
                    onOpenConsole();
                  } else {
                    setCurrentStage((p) => p + 1);
                    setIsPlaying(false);
                  }
                }}
                className="px-5 py-2 rounded-[2px] bg-ink hover:bg-ink-soft text-paper font-bold transition-all cursor-pointer"
              >
                {currentStage >= 7 ? "Open full console" : "Next stage"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── "HOW DID WE GET HERE?" Modal / Drawer ────────────────────────────── */}
      {showHowWeGotHere && (
        <div className="fixed inset-0 z-[9999] bg-ink/45 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-in fade-in">
          <div className="dossier-sheet bg-paper border border-grid rounded-[2px] max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto relative z-[10000]">
            <div className="flex items-center justify-between border-b border-grid pb-3">
              <div className="flex items-center gap-2">
                <Search size={16} strokeWidth={2} className="text-ink" />
                <h4 className="text-lg font-display font-bold text-ink">
                  How did we get here? (chain of custody)
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setShowHowWeGotHere(false)}
                className="text-ink-soft hover:text-ink font-mono text-sm px-2 py-1 rounded bg-paper-alt"
              >
                <X size={11} strokeWidth={2.5} className="inline mr-1" />Close
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-[2px] bg-paper-alt/60 border border-grid">
                <span className="text-ink font-bold block">1. Satellite detection (YOLOv8-seg)</span>
                <span className="text-ink">Identified {detection.area.km2} km² oil slick with {(detection.confidence * 100).toFixed(2)}% confidence from Sentinel-1 SAR scene.</span>
              </div>

              <div className="p-3 rounded-[2px] bg-paper-alt/60 border border-grid">
                <span className="text-ink font-bold block">2. Slick characterisation</span>
                <span className="text-ink">Extracted {detection.perimeter.km} km boundary, elongation {detection.elongation_ratio.toFixed(2)}, and {detection.age_estimate.category} weathering state.</span>
              </div>

              <div className="p-3 rounded-[2px] bg-paper-alt/60 border border-grid">
                <span className="text-ink font-bold block">3. Hydrodynamic drift reconstruction</span>
                <span className="text-ink">Resolved ocean current ({drift.environment.current.u_ms}, {drift.environment.current.v_ms} m/s) + 3% wind factor to backtrack 6.0 hours.</span>
              </div>

              <div className="p-3 rounded-[2px] bg-paper-alt/60 border border-grid">
                <span className="text-hazard font-bold block">4. Estimated spill origin corridor</span>
                <span className="text-ink">Reconstructed origin anchor at ({drift.hindcast.estimated_origin.lat.toFixed(4)}°N, {drift.hindcast.estimated_origin.lon.toFixed(4)}°E) at {new Date(drift.hindcast.estimated_origin.timestamp).toUTCString()}.</span>
              </div>

              <div className="p-3 rounded-[2px] bg-paper-alt/60 border border-grid">
                <span className="text-safe font-bold block">5. AIS telemetry ingestion</span>
                <span className="text-ink">Queried {data.ais_summary.unique_vessels} candidate ships across {data.ais_summary.total_records} AIS points within 30 km radius and ±6h window.</span>
              </div>

              <div className="p-3 rounded-[2px] bg-paper-alt/60 border border-grid">
                <span className="text-ink font-bold block">6. Multi-factor explainable attribution</span>
                <span className="text-ink">Scored Proximity (35) + Timing (20) + Trajectory (30) + Behaviour (15). Top lead emerged: {topCandidate.vessel_name} ({topCandidate.score.toFixed(1)}/100).</span>
              </div>

              <div className="p-3 rounded-[2px] bg-paper-alt/60 border border-safe/40">
                <span className="text-safe font-bold block">7. Ecological threat screening</span>
                <span className="text-ink">
                  Hydrodynamic forecast screened against {ecology?.assessment.habitats_evaluated || 0} regional habitats. Response Priority: {ecology?.assessment.response_priority} ({topThreat?.habitat_name} at +{topThreat?.estimated_time_to_impact_hours}h).
                </span>
              </div>
            </div>

            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => setShowHowWeGotHere(false)}
                className="px-6 py-2 rounded-[2px] bg-ink text-paper font-bold font-mono text-xs hover:bg-ink-soft"
              >
                Understood — Return to Investigation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
