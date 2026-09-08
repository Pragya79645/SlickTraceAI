"use client";

import React, { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import type { InvestigationResponse, CandidateVessel, DemoCase } from "@/lib/api";
import { DEMO_CASES, nextDemoCase } from "@/lib/api";
import ModelMetricsPanel from "@/components/ModelMetricsPanel";
import DossierButton from "@/components/DossierButton";

const SpillMap = dynamic(() => import("@/components/SpillMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-slate-900 rounded-xl text-slate-500 text-xs font-mono tracking-wider border border-slate-800">
      Loading interactive geospatial situation map…
    </div>
  ),
});

const RISK_BADGE: Record<string, string> = {
  HIGH: "bg-red-950 text-red-300 border-red-700 font-bold shadow-md shadow-red-900/50",
  MEDIUM: "bg-amber-950 text-amber-300 border-amber-700 font-bold shadow-md shadow-amber-900/50",
  LOW: "bg-slate-800 text-slate-400 border-slate-700 font-normal",
};

interface Props {
  data: InvestigationResponse;
  cases?: DemoCase[]; // switchable cases (live upload first when present)
  notice?: string;
  onSwitchCase: (caseId: string) => void;
  onOpenConsole: () => void;
}

const STAGES = [
  { id: 1, label: "01 — DETECT", short: "Detection", title: "DETECT UNKNOWN SLICK" },
  { id: 2, label: "02 — CHARACTERISE", short: "Characterisation", title: "PHYSICAL CHARACTERISATION" },
  { id: 3, label: "03 — TRACE BACK", short: "Drift Hindcast", title: "HYDRODYNAMIC HINDCAST" },
  { id: 4, label: "04 — FIND VESSELS", short: "AIS Search", title: "AIS CORRIDOR CORRELATION" },
  { id: 5, label: "05 — SCORE EVIDENCE", short: "Evidence Scoring", title: "EXPLAINABLE EVIDENCE SCORING" },
  { id: 6, label: "06 — ATTRIBUTION", short: "Vessel Lead", title: "INVESTIGATION CONCLUSION" },
  { id: 7, label: "07 — ECOLOGY", short: "Habitat Threat", title: "ECOLOGICAL IMPACT ASSESSMENT" },
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
    <div className="flex-1 flex flex-col bg-slate-950 text-slate-100 font-sans selection:bg-amber-500/30">
      {/* ── Top Investigation Stepper Navigation Bar ────────────────────────── */}
      <div className="bg-slate-900/90 border-b border-slate-800 px-6 py-3 sticky top-0 z-20 backdrop-blur-md">
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
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                    isActive
                      ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 scale-105"
                      : isPast
                      ? "bg-slate-800 text-emerald-300 border border-emerald-800/60"
                      : "bg-slate-950 text-slate-500 border border-slate-800 hover:text-slate-300"
                  }`}
                >
                  <span>{isPast ? "✓" : stg.id}</span>
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
              className="px-3 py-1.5 rounded-lg text-xs font-mono font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <span>{isPlaying ? "⏸ PAUSE" : "▶ PLAY AUTO-STORY"}</span>
            </button>

            <button
              type="button"
              onClick={() => onSwitchCase(nextCase.id)}
              title={nextCase.headline}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
                {
                  amber: "bg-amber-950/60 hover:bg-amber-900/80 text-amber-300 border-amber-700",
                  indigo: "bg-indigo-900/60 hover:bg-indigo-800 text-indigo-200 border-indigo-700",
                  red: "bg-red-950/60 hover:bg-red-900/80 text-red-300 border-red-700",
                  emerald: "bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border-emerald-700",
                }[nextCase.accent]
              }`}
            >
              <span>⚡</span>
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
                    className={`px-2 py-1 rounded border cursor-pointer transition-colors ${
                      c.id === data.spill_id
                        ? { amber: "text-amber-300 border-amber-700 bg-amber-950/50", indigo: "text-indigo-300 border-indigo-700 bg-indigo-950/50", red: "text-red-300 border-red-700 bg-red-950/50", emerald: "text-emerald-300 border-emerald-700 bg-emerald-950/50" }[c.accent]
                        : "text-slate-500 border-slate-800 hover:text-slate-300"
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
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <span>📊 Full Console</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Dynamic Stage Presentation Workspace ────────────────────────────── */}
      <div className="flex-1 p-5 max-w-[1800px] w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* ── Left Side: Interactive Map & Trajectory Surface (7 cols) ───────── */}
        <div className="lg:col-span-7 flex flex-col space-y-3">
          <div className="flex-1 min-h-[460px] lg:min-h-[580px] rounded-2xl border-2 border-slate-800 overflow-hidden relative shadow-2xl bg-slate-900">
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
          <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 text-xs font-mono flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-amber-400 font-bold">CURRENT STAGE:</span>
              <span className="text-white font-bold">{STAGES[currentStage - 1].title}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={currentStage <= 1}
                onClick={() => {
                  setCurrentStage((p) => Math.max(1, p - 1));
                  setIsPlaying(false);
                }}
                className="px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-800 text-[11px]"
              >
                ← Prev Stage
              </button>
              <button
                type="button"
                disabled={currentStage >= 7}
                onClick={() => {
                  setCurrentStage((p) => Math.min(7, p + 1));
                  setIsPlaying(false);
                }}
                className="px-3 py-1 rounded bg-amber-500 text-slate-950 font-bold disabled:opacity-30 disabled:cursor-not-allowed hover:bg-amber-400 text-[11px]"
              >
                Next Stage →
              </button>
            </div>
          </div>
        </div>

        {/* ── Right Side: Dedicated Stage Story Card (5 cols) ─────────────────── */}
        <div className="lg:col-span-5 flex flex-col justify-between">
          <div className="rounded-2xl border-2 border-slate-800 bg-slate-900/95 p-6 shadow-2xl space-y-5 flex-1 flex flex-col justify-between">
            {/* ── STAGE 1: DETECT UNKNOWN SLICK ──────────────────────────────── */}
            {currentStage === 1 && (
              <div className="space-y-4 animate-in fade-in duration-300">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <span className="px-2.5 py-1 rounded text-xs font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    STAGE 01 OF 07
                  </span>
                  <span className={`text-xs font-mono ${data.is_live ? "text-emerald-300 font-bold" : "text-slate-400"}`}>
                    {data.is_live ? `● LIVE UPLOAD · ${data.filename ?? data.spill_id}` : "Sentinel-1 SAR Satellite Pass"}
                  </span>
                </div>

                {notice && (
                  <div className="p-2.5 rounded-lg bg-amber-950/40 border border-amber-800/60 text-[11px] text-amber-200 font-mono">
                    {notice}
                  </div>
                )}

                <div>
                  <h3 className="text-2xl font-black text-white font-mono">
                    DETECT UNKNOWN SLICK
                  </h3>
                  <p className="text-sm text-slate-300 mt-1.5 leading-relaxed">
                    <strong className="text-amber-400">Before SlickTrace:</strong>{" "}
                    {data.is_live
                      ? `Your uploaded scene${data.anchor_source === "geotiff" ? ", auto-georeferenced from its GeoTIFF metadata" : ""} — an unidentified dark patch with no ship visible in the frame.`
                      : "This is just an unidentified dark patch on a Sentinel-1 radar scene with no ship visible in the frame."}
                  </p>
                </div>

                {data.overlay_image && (
                  <div className="rounded-xl overflow-hidden border border-slate-800 bg-black">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={data.overlay_image} alt="Detected slick mask on the uploaded scene" className="w-full max-h-72 object-contain" />
                    <div className="px-3 py-1.5 text-[10px] font-mono text-slate-500 border-t border-slate-800">
                      Segmentation mask painted on your scene{activeCase ? ` · ${activeCase.headline}` : ""}
                    </div>
                  </div>
                )}

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="text-[10px] font-bold text-slate-500 uppercase font-mono tracking-wider">
                    REAL YOLOv8 INSTANCE SEGMENTATION
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                      <span className="text-[10px] text-slate-500 font-mono block">Detection Confidence</span>
                      <span className="text-2xl font-mono font-extrabold text-emerald-400">
                        {(detection.confidence * 100).toFixed(2)}%
                      </span>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                      <span className="text-[10px] text-slate-500 font-mono block">Visible Surface Area</span>
                      <span className="text-2xl font-mono font-extrabold text-amber-400">
                        {detection.area.km2.toFixed(4)} <span className="text-xs font-normal text-slate-400">km²</span>
                      </span>
                    </div>
                    {detection.bonn_volume && (
                      <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 col-span-2 sm:col-span-1">
                        <span className="text-[10px] text-slate-500 font-mono block">Est. Volume (Bonn code {detection.bonn_volume.appearance_code})</span>
                        <span className="text-xl font-mono font-extrabold text-orange-300">
                          {Math.round(detection.bonn_volume.volume_tonnes_min)}–{Math.round(detection.bonn_volume.volume_tonnes_max)} <span className="text-xs font-normal text-slate-400">t</span>
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono block">{detection.bonn_volume.thickness_um_min}–{detection.bonn_volume.thickness_um_max} µm assumed</span>
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 font-mono">
                    • Polygon contour: <span className="text-slate-200">{detection.polygon.length} boundary vertices extracted</span>
                    {detection.backscatter_damping_db != null && (
                      <> · backscatter damping <span className="text-slate-200">{detection.backscatter_damping_db} dB</span> vs surrounding water</>
                    )}
                  </div>
                  <ModelMetricsPanel compact />
                </div>

                <div className="p-3 rounded-lg bg-indigo-950/40 border border-indigo-800/60 text-xs text-indigo-300 leading-relaxed">
                  💡 <strong>Key Investigative Question:</strong> The slick is detected, but where did it originate hours before?
                </div>
              </div>
            )}

            {/* ── STAGE 2: CHARACTERISE ──────────────────────────────────────── */}
            {currentStage === 2 && (
              <div className="space-y-4 animate-in fade-in duration-300">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <span className="px-2.5 py-1 rounded text-xs font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    STAGE 02 OF 07
                  </span>
                  <span className="text-xs font-mono text-slate-400">
                    Morphological &amp; Aging Analysis
                  </span>
                </div>

                <div>
                  <h3 className="text-2xl font-black text-white font-mono">
                    PHYSICAL SLICK CHARACTERISATION
                  </h3>
                  <p className="text-sm text-slate-300 mt-1.5 leading-relaxed">
                    The detected slick becomes a measurable investigation target with exact geometry and weathering metrics.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                    <span className="text-[10px] text-slate-500 font-mono block uppercase">Perimeter</span>
                    <span className="text-xl font-mono font-bold text-slate-200 mt-0.5 block">
                      {detection.perimeter.km.toFixed(2)} km
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">{detection.perimeter.pixels} pixels</span>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                    <span className="text-[10px] text-slate-500 font-mono block uppercase">Elongation Ratio</span>
                    <span className="text-xl font-mono font-bold text-indigo-300 mt-0.5 block">
                      {detection.elongation_ratio.toFixed(3)}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">Major / Minor Axis</span>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                    <span className="text-[10px] text-slate-500 font-mono block uppercase">Weathering Category</span>
                    <span className="text-xl font-mono font-bold text-amber-400 uppercase mt-0.5 block">
                      {detection.age_estimate.category}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">Edge density: {detection.age_estimate.edge_density}</span>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                    <span className="text-[10px] text-slate-500 font-mono block uppercase">Observation Anchor</span>
                    <span className="text-xs font-mono font-bold text-emerald-400 mt-1 block truncate">
                      {drift.observation.latitude.toFixed(4)}°N, {drift.observation.longitude.toFixed(4)}°E
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">Satellite Observation Point</span>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300 font-mono">
                  “The physical dimensions provide the exact initial condition for the hydrodynamic drift model.”
                </div>
              </div>
            )}

            {/* ── STAGE 3: TRACE BACK ────────────────────────────────────────── */}
            {currentStage === 3 && (
              <div className="space-y-4 animate-in fade-in duration-300">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <span className="px-2.5 py-1 rounded text-xs font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                    STAGE 03 OF 07 (PHYSICS ENGINE)
                  </span>
                  <span className="text-xs font-mono text-red-400 font-bold">
                    ESTIMATED — NOT CONFIRMED
                  </span>
                </div>

                <div>
                  <h3 className="text-2xl font-black text-white font-mono">
                    LAGRANGIAN HYDRODYNAMIC BACKTRACK
                  </h3>
                  <p className="text-sm text-slate-300 mt-1.5 leading-relaxed">
                    <strong className="text-indigo-300">The Physics Breakthrough:</strong> We know where the oil is now. 2D Lagrangian advection lets us calculate where it originated 6 hours earlier.
                  </p>
                </div>

                {/* Origin Box */}
                <div className="p-4 rounded-xl bg-gradient-to-b from-red-950/40 to-slate-950 border-2 border-red-600/70 shadow-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold text-red-400 uppercase tracking-widest">
                      🔴 RECONSTRUCTED SPILL ORIGIN CORRIDOR
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      ~{drift.hindcast.estimated_origin.hours_before_observation}h Earlier
                    </span>
                  </div>
                  <div className="text-2xl font-mono font-black text-white">
                    {drift.hindcast.estimated_origin.lat.toFixed(5)}°N, {drift.hindcast.estimated_origin.lon.toFixed(5)}°E
                  </div>
                  <div className="text-xs font-mono text-slate-400">
                    Discharge Time Window: <strong className="text-slate-200">{new Date(drift.hindcast.estimated_origin.timestamp).toUTCString()}</strong>
                  </div>
                </div>

                {/* Monte Carlo Uncertainty */}
                {drift.ensemble && (() => {
                  const originStep = drift.ensemble.hindcast_steps[drift.ensemble.hindcast_steps.length - 1];
                  const b50 = originStep.ellipses.find((e) => e.confidence === 0.5);
                  const b80 = originStep.ellipses.find((e) => e.confidence === 0.8);
                  const b95 = originStep.ellipses.find((e) => e.confidence === 0.95);
                  return (
                    <div className="p-3.5 rounded-xl bg-slate-950 border border-red-900/60 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono font-bold text-red-300 uppercase tracking-widest">
                          ◎ Origin Uncertainty — Monte Carlo Ensemble
                        </span>
                        <span className="text-[10px] font-mono text-slate-500">
                          {drift.ensemble.n_particles} particles · seed {drift.ensemble.seed}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        A single line is a lie of precision. Each particle drifts with its own perturbed current, wind, and wind-drift factor plus turbulent diffusion — the spread after {drift.hindcast.duration_hours}h is the honest search area.
                      </p>
                      <div className="grid grid-cols-3 gap-2 text-center font-mono">
                        {[["50%", b50, "text-red-400"], ["80%", b80, "text-amber-300"], ["95%", b95, "text-slate-300"]].map(([label, band, color]) => {
                          const e = band as typeof b50;
                          return (
                            <div key={label as string} className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                              <span className="text-[10px] text-slate-500 block">{label as string} band</span>
                              <span className={`text-sm font-black ${color as string}`}>{e ? `${e.area_km2} km²` : "—"}</span>
                              <span className="text-[10px] text-slate-500 block">{e ? `${e.semi_major_km} × ${e.semi_minor_km} km` : ""}</span>
                            </div>
                          );
                        })}
                      </div>
                      <div className="text-[10px] font-mono text-slate-500">
                        Spread at −{drift.hindcast.duration_hours}h: {originStep.spread_km} km RMS · perturbations: {drift.ensemble.perturbations.current_speed}, {drift.ensemble.perturbations.wind_drift_factor}
                      </div>
                    </div>
                  );
                })()}

                {/* Environmental Vectors */}
                <div className="grid grid-cols-2 gap-2.5 text-xs font-mono">
                  <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                    <span className="text-[10px] text-slate-500 block">Ocean Surface Current</span>
                    <span className="font-bold text-indigo-300">
                      u={drift.environment.current.u_ms} m/s, v={drift.environment.current.v_ms} m/s
                    </span>
                    <span className="block text-[10px] mt-1 text-slate-500">
                      {drift.environment.source === "open_meteo"
                        ? `${drift.environment.provider_detail} · valid ${drift.environment.valid_time}`
                        : `source: ${drift.environment.source}`}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                    <span className="text-[10px] text-slate-500 block">Combined Drift Speed</span>
                    <span className="font-bold text-emerald-400">
                      {drift.environment.drift.speed_ms.toFixed(4)} m/s (~{drift.hindcast.duration_hours}h trace)
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* ── STAGE 4: FIND THE VESSELS ──────────────────────────────────── */}
            {currentStage === 4 && (
              <div className="space-y-4 animate-in fade-in duration-300">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <span className="px-2.5 py-1 rounded text-xs font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    STAGE 04 OF 07
                  </span>
                  <span className="text-xs font-mono text-slate-400">
                    AIS Vessel Telemetry Ingestion
                  </span>
                </div>

                <div>
                  <h3 className="text-2xl font-black text-white font-mono">
                    WHO WAS IN THE ORIGIN CORRIDOR?
                  </h3>
                  <p className="text-sm text-slate-300 mt-1.5 leading-relaxed">
                    SlickTrace queries historical AIS ship positions around the <strong className="text-red-400">reconstructed origin</strong>—not the drifting slick!
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                    <span className="text-[10px] text-slate-500 block">Search Radius</span>
                    <span className="text-lg font-bold text-amber-400 mt-0.5 block">30 km</span>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                    <span className="text-[10px] text-slate-500 block">Time Window</span>
                    <span className="text-lg font-bold text-indigo-400 mt-0.5 block">±6.0 hours</span>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                    <span className="text-[10px] text-slate-500 block">Vessels Found</span>
                    <span className="text-lg font-bold text-emerald-400 mt-0.5 block">{data.ais_summary.unique_vessels} ships</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block">
                    Candidate Corridor Intersections:
                  </span>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {attribution.candidate_vessels.slice(0, 4).map((v, i) => (
                      <div
                        key={v.vessel_id}
                        onClick={() => setSelectedVesselId(v.vessel_id)}
                        className="flex items-center justify-between p-2 rounded bg-slate-900 hover:bg-slate-800 cursor-pointer text-xs font-mono border border-slate-800"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-amber-400 font-bold">#{i + 1}</span>
                          <span className="text-white font-medium">{v.vessel_name}</span>
                          {v.went_dark && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-black tracking-wider bg-red-950 text-red-300 border border-red-700">⚠ DARK</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-slate-400">{v.min_distance_km} km away</span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] ${RISK_BADGE[v.risk]}`}>{v.risk}</span>
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
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <span className="px-2.5 py-1 rounded text-xs font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    STAGE 05 OF 07
                  </span>
                  <span className="text-xs font-mono text-slate-400">
                    Multi-Factor Evidence Stacking
                  </span>
                </div>

                <div>
                  <h3 className="text-2xl font-black text-white font-mono">
                    EXPLAINABLE EVIDENCE SCORING
                  </h3>
                  <p className="text-sm text-slate-300 mt-1.5 leading-relaxed">
                    The system didn’t just “pick a ship”—it mathematically scored 4 independent dimensions of physical evidence.
                  </p>
                </div>

                {/* Score Cards */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                    <div className="flex justify-between text-xs font-mono">
                      <span className="text-slate-400 font-semibold">📍 PROXIMITY</span>
                      <span className="font-bold text-emerald-400">{selectedVessel.proximity_score} / 35</span>
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono block mt-1">
                      {selectedVessel.min_distance_km} km from origin
                    </span>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                    <div className="flex justify-between text-xs font-mono">
                      <span className="text-slate-400 font-semibold">🕐 TIMING</span>
                      <span className="font-bold text-indigo-400">{selectedVessel.temporal_score} / 20</span>
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono block mt-1">
                      {selectedVessel.time_difference_hours}h temporal delta
                    </span>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                    <div className="flex justify-between text-xs font-mono">
                      <span className="text-slate-400 font-semibold">🛳 TRAJECTORY</span>
                      <span className="font-bold text-amber-400">{selectedVessel.trajectory_score} / 30</span>
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono block mt-1">
                      Crossed origin advection path
                    </span>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                    <div className="flex justify-between text-xs font-mono">
                      <span className="text-slate-400 font-semibold">📡 BEHAVIOUR</span>
                      <span className="font-bold text-orange-400">{selectedVessel.behavioral_score} / 15</span>
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono block mt-1">
                      Speed drop / dark transmission
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                  <span className="text-xs font-mono font-bold text-slate-300">TOTAL EVIDENCE SCORE:</span>
                  <span className="text-2xl font-mono font-black text-amber-400">
                    {selectedVessel.score.toFixed(1)} <span className="text-xs font-normal text-slate-400">/ 100</span>
                  </span>
                </div>
              </div>
            )}

            {/* ── STAGE 6: VESSEL ATTRIBUTION DOSSIER ────────────────────────── */}
            {currentStage === 6 && (
              <div className="space-y-4 animate-in fade-in duration-300">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <span className="px-2.5 py-1 rounded text-xs font-mono font-bold bg-red-950 text-red-300 border border-red-700 uppercase tracking-wider">
                    ★ STAGE 06 OF 07: ATTRIBUTION
                  </span>
                  <span className="text-xs font-mono text-emerald-400 font-bold">
                    EVIDENCE RANKED
                  </span>
                </div>

                {/* Hero Conclusion Box */}
                <div className="p-5 rounded-2xl bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border-2 border-amber-500 shadow-2xl space-y-3">
                  <span className="text-[10px] font-mono font-bold text-amber-400 uppercase tracking-widest block">
                    STRONGEST INVESTIGATIVE LEAD
                  </span>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-3xl font-black text-white font-mono tracking-tight">
                      🚢 {topCandidate.vessel_name}
                    </h3>
                    <span className={`px-3 py-1 rounded border text-xs font-mono tracking-wider ${RISK_BADGE[topCandidate.risk]}`}>
                      {topCandidate.risk} RISK
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs font-mono text-slate-400 border-t border-slate-800 pt-2">
                    <span>
                      MMSI: <strong className="text-white">{topCandidate.vessel_id}</strong>
                      {topCandidate.vessel_type && <> · {topCandidate.vessel_type}</>}
                      {topCandidate.flag && <> · {topCandidate.flag} flag</>}
                    </span>
                    <span>Attribution Score: <strong className="text-amber-400 text-lg">{topCandidate.score.toFixed(1)} / 100</strong></span>
                  </div>

                  {/* Evidence Checklist */}
                  <div className="space-y-1.5 bg-slate-950/80 p-3 rounded-lg border border-slate-800 pt-2">
                    <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      WHY {topCandidate.vessel_name}? (MEASURED AIS EVIDENCE):
                    </span>
                    {topCandidate.reasons.map((r, idx) => (
                      <div key={idx} className="text-xs text-slate-200 flex items-start gap-2 font-mono">
                        <span className="text-emerald-400 font-bold">✓</span>
                        <span className="capitalize">{r}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-[10px] font-mono text-center text-slate-400">
                  SATELLITE ──► PHYSICS ──► AIS ──► EVIDENCE ──► <strong className="text-amber-300">ATTRIBUTION</strong>
                </div>
              </div>
            )}

            {/* ── STAGE 7: ECOLOGICAL THREAT & HABITAT IMPACT ────────────────── */}
            {currentStage === 7 && (
              <div className="space-y-4 animate-in fade-in duration-300">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <span className="px-2.5 py-1 rounded text-xs font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    STAGE 07 OF 07 (WILDLIFE &amp; HABITAT)
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                    ecology?.assessment.response_priority === "HIGH"
                      ? "bg-rose-950 text-rose-300 border border-rose-700"
                      : "bg-emerald-950 text-emerald-300 border border-emerald-700"
                  }`}>
                    {ecology?.assessment.response_priority === "HIGH" ? "🔴 HIGH PRIORITY ACTION" : "🟢 LOW EXPOSURE"}
                  </span>
                </div>

                <div>
                  <h3 className="text-2xl font-black text-white font-mono flex items-center gap-2">
                    <span>🐢 ECOLOGICAL IMPACT ASSESSMENT</span>
                  </h3>
                  <p className="text-sm text-slate-300 mt-1.5 leading-relaxed">
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
                      ? "⚠ PROTECTED AREA CURRENTLY INTERSECTED"
                      : isForecast
                      ? "⚠ FORECAST TRAJECTORY ENTERS PROTECTED AREA"
                      : isNear
                      ? "◐ WITHIN 10 KM OF PROTECTED AREA"
                      : "✓ NO SIGNIFICANT RAMSAR EXPOSURE";

                    const timingLabel = isCurrent
                      ? "Observed Spill Overlap (t=0h)"
                      : isForecast && topRamsar.estimated_time_to_impact_hours !== null && topRamsar.estimated_time_to_impact_hours !== undefined
                      ? `+${topRamsar.estimated_time_to_impact_hours} hours`
                      : `No Direct Entry (${topRamsar.minimum_distance_km} km approach)`;

                    return (
                      <div
                        className={`p-4 rounded-xl shadow-xl space-y-2.5 font-mono border-2 ${
                          isCurrent || isForecast
                            ? "bg-gradient-to-b from-rose-950/70 via-slate-900 to-slate-950 border-rose-600/80"
                            : isNear
                            ? "bg-gradient-to-b from-amber-950/60 via-slate-900 to-slate-950 border-amber-600/80"
                            : "bg-slate-950 border-emerald-800/80"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className={`text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 ${
                              isCurrent || isForecast ? "text-rose-400" : isNear ? "text-amber-400" : "text-emerald-400"
                            }`}
                          >
                            <span
                              className={`w-2 h-2 rounded-full ${
                                isCurrent || isForecast
                                  ? "bg-rose-500 animate-ping"
                                  : isNear
                                  ? "bg-amber-500 animate-pulse"
                                  : "bg-emerald-500"
                              }`}
                            />
                            <span>{bannerTitle}</span>
                          </span>
                          <span
                            className={`text-xs font-bold px-2 py-0.5 rounded border ${
                              isCurrent || isForecast
                                ? "bg-rose-900 text-rose-200 border-rose-700"
                                : isNear
                                ? "bg-amber-900 text-amber-200 border-amber-700"
                                : "bg-emerald-900 text-emerald-200 border-emerald-700"
                            }`}
                          >
                            {isCurrent ? "CURRENT OVERLAP" : topRamsar.threat_level.replace(/_/g, " ")}
                          </span>
                        </div>

                        <div>
                          <h4 className="text-lg font-black text-white">{topRamsar.site_name}</h4>
                          <p className="text-xs text-slate-300">
                            {topRamsar.state} · Official Ramsar Protected Wetland (
                            {topRamsar.area_hectares ? `${topRamsar.area_hectares.toLocaleString()} ha` : "Surveyed GIS Cadastre"}
                            )
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs bg-slate-950/80 p-2.5 rounded-lg border border-slate-800">
                          <div>
                            <span className="text-slate-500 text-[10px] block">Minimum Distance</span>
                            <strong className="text-amber-400 text-base">{topRamsar.minimum_distance_km} km</strong>
                          </div>
                          <div>
                            <span className="text-slate-500 text-[10px] block">
                              {isCurrent ? "Exposure Status" : "Estimated First Contact"}
                            </span>
                            <strong className="text-rose-400 text-base">{timingLabel}</strong>
                          </div>
                        </div>

                        {/* 3-Step Chain Clarification */}
                        <div className="text-xs text-slate-300 bg-slate-950/80 p-2.5 rounded border border-slate-800 space-y-1">
                          <div className="text-[10px] font-bold text-amber-400 uppercase pb-0.5 border-b border-slate-800">
                            FORENSIC → ECOLOGICAL EXPOSURE CHAIN
                          </div>
                          <div className="text-[11px]">
                            <span className="text-slate-400">1. Observation (0h):</span> Current satellite detection anchor<br />
                            <span className="text-slate-400">2. Forecast (+6h):</span> Predicted hydrodynamic trajectory<br />
                            <span className="text-slate-400">3. Ramsar GIS:</span> {topRamsar.reason}
                          </div>
                        </div>
                      </div>
                    );
                  })()
                ) : topThreat && topThreat.threat_level === "HIGH" ? (
                  <div className="p-4 rounded-xl bg-gradient-to-b from-rose-950/60 via-slate-900 to-slate-950 border-2 border-rose-600/80 shadow-xl space-y-2.5 font-mono">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-rose-400 uppercase tracking-widest flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                        <span>⚠ POTENTIAL ECOLOGICAL THREAT</span>
                      </span>
                      <span className="text-xs font-bold px-2 py-0.5 rounded bg-rose-900 text-rose-200 border border-rose-700">
                        HIGH THREAT
                      </span>
                    </div>

                    <div>
                      <h4 className="text-lg font-black text-white">{topThreat.habitat_name}</h4>
                      <p className="text-xs text-rose-300">
                        Type: {topThreat.type} · Screening Radius: {topThreat.impact_radius_km} km
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs bg-slate-950/80 p-2.5 rounded-lg border border-slate-800">
                      <div>
                        <span className="text-slate-500 text-[10px] block">Forecast Min Distance</span>
                        <strong className="text-amber-400 text-base">{topThreat.minimum_distance_km} km</strong>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[10px] block">Estimated Exposure Window</span>
                        <strong className="text-rose-400 text-base">+{topThreat.estimated_time_to_impact_hours} hours</strong>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-xs font-mono text-emerald-300 space-y-1">
                    <span className="font-bold block">🟢 NO SENSITIVE HABITAT EXPOSURE DETECTED</span>
                    <span className="text-slate-400">
                      The current forecast trajectory remains outside the prototype screening radii of all evaluated habitats.
                    </span>
                  </div>
                )}

                {/* Ramsar Wetland Sites Evaluated List */}
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2 font-mono text-xs">
                  <div className="flex items-center justify-between text-slate-400 text-[11px]">
                    <span>RAMSAR WETLAND POLYGONS ({data.ecological_exposure?.sites_analyzed || 99} GIS FEATURES)</span>
                    <span>Direct Intersections: <strong className="text-rose-400">{data.ecological_exposure?.direct_threats_count || 0}</strong></span>
                  </div>
                  <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
                    {(data.ecological_exposure?.threats || []).slice(0, 6).map((imp) => (
                      <div key={`${imp.site_name}-${imp.state}`} className="flex items-center justify-between p-1.5 rounded bg-slate-900 text-[11px] border border-slate-800">
                        <span className="text-slate-200 truncate max-w-[200px]">{imp.site_name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400">{imp.minimum_distance_km} km</span>
                          <span
                            className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                              imp.threat_level === "DIRECT_THREAT"
                                ? "bg-rose-950 text-rose-300 border border-rose-700"
                                : imp.threat_level === "NEAR_THREAT"
                                ? "bg-amber-950 text-amber-300 border border-amber-700"
                                : "bg-emerald-950 text-emerald-300 border border-emerald-800"
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
                <div className="flex items-center gap-2 pt-1 font-mono">
                  <button
                    type="button"
                    onClick={() => setShowHowWeGotHere(true)}
                    className="flex-1 px-3 py-2.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all cursor-pointer text-center"
                  >
                    🔍 HOW DID WE GET HERE?
                  </button>

                  <button
                    type="button"
                    onClick={onOpenConsole}
                    className="flex-1 px-3 py-2.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all shadow-md shadow-amber-500/20 cursor-pointer text-center"
                  >
                    📊 FULL CONSOLE →
                  </button>
                </div>
              </div>
            )}

            {/* Bottom Next/Prev Action Buttons */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-800/80 text-xs font-mono">
              <button
                type="button"
                disabled={currentStage <= 1}
                onClick={() => {
                  setCurrentStage((p) => Math.max(1, p - 1));
                  setIsPlaying(false);
                }}
                className="px-4 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-800 transition-colors"
              >
                ← Back
              </button>

              <span className="text-slate-500 text-[11px]">
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
                className="px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition-all shadow-md shadow-amber-500/20"
              >
                {currentStage >= 7 ? "Open Full Console →" : "Next Stage →"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── "HOW DID WE GET HERE?" Modal / Drawer ────────────────────────────── */}
      {showHowWeGotHere && (
        <div className="fixed inset-0 z-[9999] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-in fade-in">
          <div className="bg-slate-900 border-2 border-amber-500/80 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto relative z-[10000]">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-amber-400 text-lg">🔍</span>
                <h4 className="text-lg font-bold font-mono text-white">
                  HOW DID WE GET HERE? (CAUSAL CHAIN OF CUSTODY)
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setShowHowWeGotHere(false)}
                className="text-slate-400 hover:text-white font-mono text-sm px-2 py-1 rounded bg-slate-800"
              >
                ✕ Close
              </button>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-amber-400 font-bold block">1. SATELLITE DETECTION (YOLOv8-seg)</span>
                <span className="text-slate-300">Identified {detection.area.km2} km² oil slick with {(detection.confidence * 100).toFixed(2)}% confidence from Sentinel-1 SAR scene.</span>
              </div>

              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-indigo-400 font-bold block">2. SLICK CHARACTERISATION</span>
                <span className="text-slate-300">Extracted {detection.perimeter.km} km boundary, elongation {detection.elongation_ratio.toFixed(2)}, and {detection.age_estimate.category} weathering state.</span>
              </div>

              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-cyan-400 font-bold block">3. HYDRODYNAMIC DRIFT RECONSTRUCTION</span>
                <span className="text-slate-300">Resolved ocean current ({drift.environment.current.u_ms}, {drift.environment.current.v_ms} m/s) + 3% wind factor to backtrack 6.0 hours.</span>
              </div>

              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-red-400 font-bold block">4. ESTIMATED SPILL ORIGIN CORRIDOR</span>
                <span className="text-slate-300">Reconstructed origin anchor at ({drift.hindcast.estimated_origin.lat.toFixed(4)}°N, {drift.hindcast.estimated_origin.lon.toFixed(4)}°E) at {new Date(drift.hindcast.estimated_origin.timestamp).toUTCString()}.</span>
              </div>

              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-emerald-400 font-bold block">5. AIS TELEMETRY INGESTION</span>
                <span className="text-slate-300">Queried {data.ais_summary.unique_vessels} candidate ships across {data.ais_summary.total_records} AIS points within 30 km radius and ±6h window.</span>
              </div>

              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-amber-400 font-bold block">6. MULTI-FACTOR EXPLAINABLE ATTRIBUTION</span>
                <span className="text-slate-300">Scored Proximity (35) + Timing (20) + Trajectory (30) + Behaviour (15). Top lead emerged: {topCandidate.vessel_name} ({topCandidate.score.toFixed(1)}/100).</span>
              </div>

              <div className="p-3 rounded-lg bg-slate-950 border border-emerald-800/80">
                <span className="text-emerald-400 font-bold block">7. ECOLOGICAL THREAT SCREENING</span>
                <span className="text-slate-300">
                  Hydrodynamic forecast screened against {ecology?.assessment.habitats_evaluated || 0} regional habitats. Response Priority: {ecology?.assessment.response_priority} ({topThreat?.habitat_name} at +{topThreat?.estimated_time_to_impact_hours}h).
                </span>
              </div>
            </div>

            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => setShowHowWeGotHere(false)}
                className="px-6 py-2 rounded-lg bg-amber-500 text-slate-950 font-bold font-mono text-xs hover:bg-amber-400"
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
