"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useState, useMemo } from "react";
import {
  fetchInvestigation,
  buildCaseList,
  type InvestigationResponse,
  type CandidateVessel,
} from "@/lib/api";
import InvestigationStoryMode from "@/components/InvestigationStoryMode";
import DossierButton from "@/components/DossierButton";

// Leaflet requires browser APIs — load client-side only, never SSR
const SpillMap = dynamic(() => import("@/components/SpillMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-slate-900 rounded-xl text-slate-500 text-xs font-mono tracking-wider border border-slate-800">
      Loading interactive geospatial map…
    </div>
  ),
});

const RISK_BADGE: Record<string, string> = {
  HIGH: "bg-red-950 text-red-300 border-red-700 font-bold shadow-sm shadow-red-900/40",
  MEDIUM: "bg-amber-950 text-amber-300 border-amber-700 font-bold shadow-sm shadow-amber-900/40",
  LOW: "bg-slate-800 text-slate-400 border-slate-700 font-normal",
};

interface Props {
  data: InvestigationResponse;
  liveCaseId?: string; // a live upload that stays switchable alongside the bundled scenarios
  notice?: string;
}

export default function Dashboard({ data: initialData, liveCaseId, notice }: Props) {
  const [data, setData] = useState<InvestigationResponse>(initialData);
  const cases = useMemo(
    () => buildCaseList(liveCaseId, initialData.is_live ? initialData.filename : undefined),
    [liveCaseId, initialData.is_live, initialData.filename]
  );
  const [viewMode, setViewMode] = useState<"story" | "console">("story");
  const [isLoadingCase, setIsLoadingCase] = useState(false);
  const [caseError, setCaseError] = useState<string | null>(null);
  const [showFormulaDetails, setShowFormulaDetails] = useState(false);

  const { drift, attribution } = data;

  // All timeline steps: hindcast (oldest → obs) + forecast (obs → future).
  // The backend orders hindcast.trajectory observation-first, so reverse it here.
  const allSteps = useMemo(
    () => [
      ...[...drift.hindcast.trajectory].reverse(),
      ...drift.forecast.trajectory.slice(1), // skip duplicate t=0
    ],
    [drift]
  );

  // Start slider at observation point (end of hindcast)
  const obsIdx = drift.hindcast.trajectory.length - 1;

  const [timelineIdx, setTimelineIdx] = useState(obsIdx);
  const [selectedVesselId, setSelectedVesselId] = useState<string | null>(
    attribution.candidate_vessels[0]?.vessel_id || null
  );

  const currentStep = allSteps[timelineIdx];

  // Determine which timeline phase the slider is in
  const phase =
    timelineIdx < obsIdx
      ? "HINDCAST (-6h to 0h)"
      : timelineIdx === obsIdx
      ? "OBSERVATION (0h)"
      : "FORECAST (0h to +6h)";

  const phaseColor =
    timelineIdx < obsIdx
      ? "text-indigo-400"
      : timelineIdx === obsIdx
      ? "text-amber-400"
      : "text-emerald-400";

  // Selected candidate vessel (defaults to top candidate)
  const selectedVessel: CandidateVessel = useMemo(() => {
    if (!attribution.candidate_vessels.length) {
      return {
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
    }
    return (
      attribution.candidate_vessels.find((v) => v.vessel_id === selectedVesselId) ||
      attribution.candidate_vessels[0]
    );
  }, [attribution, selectedVesselId]);

  const topCandidate = attribution.candidate_vessels[0];
  const topCandidateName = topCandidate?.vessel_name || "N/A";
  const isTopCandidate = selectedVessel.vessel_id === topCandidate?.vessel_id;
  const isValidationScenario = data.spill_id !== "SPILL-001" && !data.is_live;
  const activeCase = cases.find((c) => c.id === data.spill_id);

  const handleSwitchCase = async (caseId: string) => {
    if (caseId === data.spill_id || isLoadingCase) return;
    setIsLoadingCase(true);
    setCaseError(null);
    try {
      const freshData = await fetchInvestigation(caseId);
      setData(freshData);
      setSelectedVesselId(freshData.attribution.candidate_vessels[0]?.vessel_id || null);
      setTimelineIdx(freshData.drift.hindcast.trajectory.length - 1);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load case";
      setCaseError(msg);
    } finally {
      setIsLoadingCase(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500/30">
      {/* ── Top View-Mode Header & Universal Controls ────────────────────────── */}
      <header className="flex-none border-b border-slate-800 bg-slate-900/90 backdrop-blur-md sticky top-0 z-30 px-6 py-2.5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
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
            <span className="text-xs text-slate-300 font-semibold hidden sm:block">
              Maritime Oil Spill Investigation &amp; Dynamic Attribution
            </span>
          </div>

          {/* Primary View Mode Switcher + Scenario Switcher */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* View Mode Toggle */}
            <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs font-mono">
              <button
                type="button"
                onClick={() => setViewMode("story")}
                className={`px-3 py-1 rounded transition-all cursor-pointer font-bold flex items-center gap-1.5 ${
                  viewMode === "story"
                    ? "bg-amber-500 text-slate-950 shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <span>🎬</span>
                <span>Investigation Mode</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("console")}
                className={`px-3 py-1 rounded transition-all cursor-pointer font-bold flex items-center gap-1.5 ${
                  viewMode === "console"
                    ? "bg-amber-500 text-slate-950 shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <span>📊</span>
                <span>Detailed Console</span>
              </button>
            </div>

            {/* Scenario Selector */}
            <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs font-mono">
              {cases.map((c) => {
                const active = data.spill_id === c.id;
                const accent = { amber: "text-amber-400", indigo: "text-indigo-300", red: "text-red-300", emerald: "text-emerald-300" }[c.accent];
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleSwitchCase(c.id)}
                    disabled={isLoadingCase}
                    title={c.headline}
                    className={`px-2.5 py-1 rounded transition-all cursor-pointer font-bold ${
                      active ? `bg-slate-800 ${accent} border border-slate-700` : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>

            <DossierButton data={data} />
            <Link
              href="/"
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors flex items-center gap-1.5"
            >
              <span>← Upload</span>
            </Link>
          </div>
        </div>

        {caseError && (
          <div className="mt-2 p-2 rounded bg-red-950/80 border border-red-800 text-xs text-red-300">
            ⚠ {caseError}
          </div>
        )}
      </header>

      {/* ── View 1: Guided Investigation Story Mode ───────────────────────────── */}
      {viewMode === "story" ? (
        <InvestigationStoryMode
          data={data}
          cases={cases}
          notice={notice}
          onSwitchCase={handleSwitchCase}
          onOpenConsole={() => setViewMode("console")}
        />
      ) : (
        /* ── View 2: Full Analytical Investigator Console ─────────────────────── */
        <div className="flex-1 flex flex-col">
          {/* Scenario Banner */}
          <div className="bg-slate-900/60 border-b border-slate-800/80 px-6 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono">
            <div className="flex items-center gap-2">
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                  data.is_live
                    ? "bg-emerald-950 text-emerald-300 border border-emerald-700"
                    : isValidationScenario
                    ? "bg-indigo-950 text-indigo-300 border border-indigo-700"
                    : "bg-amber-950 text-amber-300 border border-amber-700"
                }`}
              >
                {data.is_live ? "● LIVE INVESTIGATION" : isValidationScenario ? "CONTROLLED VALIDATION SCENARIO" : "REFERENCE BASELINE CASE"}
              </span>
              <span className="text-slate-300">
                Active Case: <strong className="text-white">{data.spill_id}</strong> · Top Lead:{" "}
                <strong className="text-amber-400">{topCandidateName}</strong> (
                {topCandidate?.score.toFixed(1)}/100 · {topCandidate?.risk} RISK)
                {topCandidate?.went_dark && (
                  <strong className="ml-2 px-1.5 py-0.5 rounded text-[10px] bg-red-950 text-red-300 border border-red-700">⚠ WENT DARK</strong>
                )}
              </span>
              {activeCase && <span className="text-slate-500 hidden lg:inline">— {activeCase.headline}</span>}
            </div>

            <div className="text-[11px] text-slate-400 flex items-center gap-2">
              <span className="text-emerald-400 font-bold">⚡ Dynamic Engine Proof:</span>
              <span>Same attribution algorithm. Different AIS evidence. Different #1 candidate.</span>
            </div>
          </div>

          {/* Main Console Workspace */}
          <main className="flex-1 p-5 max-w-[1800px] w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left: Map Workspace */}
            <section className="lg:col-span-7 flex flex-col space-y-3.5">
              <div className="flex-1 min-h-[460px] lg:min-h-[520px] rounded-2xl border border-slate-800 overflow-hidden relative shadow-2xl bg-slate-900">
                <SpillMap
                  key={data.spill_id}
                  data={data}
                  timelineIdx={timelineIdx}
                  selectedVesselId={selectedVesselId}
                  onVesselSelect={setSelectedVesselId}
                  onTimelineChange={setTimelineIdx}
                />
              </div>

              {/* Timeline Slider */}
              <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/90 backdrop-blur-sm space-y-2.5 shadow-lg">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs font-mono">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 font-bold">INVESTIGATION TIMELINE:</span>
                    <span className={`font-bold ${phaseColor}`}>{phase}</span>
                  </div>
                  <div className="text-slate-300">
                    {currentStep ? new Date(currentStep.timestamp).toUTCString() : ""}
                  </div>
                </div>

                <input
                  type="range"
                  min={0}
                  max={allSteps.length - 1}
                  value={timelineIdx}
                  onChange={(e) => setTimelineIdx(Number(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer h-2 bg-slate-950 rounded-lg appearance-none"
                />

                <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 pt-0.5">
                  <div className="text-left">
                    <span className="text-red-400 font-bold block">-6h</span>
                    <span>ESTIMATED ORIGIN</span>
                  </div>
                  <div className="text-center">
                    <span className="text-amber-400 font-bold block">0h (Observation)</span>
                    <span>OBSERVED SPILL</span>
                  </div>
                  <div className="text-right">
                    <span className="text-emerald-400 font-bold block">+6h</span>
                    <span>FORWARD DRIFT</span>
                  </div>
                </div>
              </div>
            </section>

            {/* Right: Strongest Lead & Evidence */}
            <section className="lg:col-span-5 flex flex-col space-y-4">
              <div className="p-5 rounded-2xl border-2 border-amber-500/70 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 shadow-2xl space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3.5">
                  <div>
                    <span className="text-[11px] font-mono font-bold text-amber-400 uppercase tracking-widest block">
                      {isTopCandidate ? "★ STRONGEST INVESTIGATIVE LEAD" : "SELECTED CANDIDATE VESSEL"}
                    </span>
                    <h2 className="text-2xl sm:text-3xl font-black text-white font-mono mt-1 tracking-tight">
                      {selectedVessel.vessel_name}
                    </h2>
                    <span className="text-xs text-slate-400 font-mono">
                      MMSI: {selectedVessel.vessel_id}
                      {selectedVessel.vessel_type && <> · {selectedVessel.vessel_type}</>}
                      {selectedVessel.flag && <> · {selectedVessel.flag} flag</>}
                      {" "}· Min Distance: {selectedVessel.min_distance_km} km
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className={`px-3 py-1 rounded border text-xs font-mono tracking-wider ${RISK_BADGE[selectedVessel.risk]}`}>
                      {selectedVessel.risk} RISK
                    </span>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-500 uppercase font-bold block">Attribution</span>
                      <span className="text-3xl font-mono font-black text-amber-400">
                        {selectedVessel.score.toFixed(1)} <span className="text-xs font-normal text-slate-400">/ 100</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Score Breakdown Bars */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-mono font-bold text-slate-300">
                    <span>SCORE BREAKDOWN (MAX 100)</span>
                    <span className="text-[10px] text-slate-500 font-normal">Weights: 35 | 20 | 30 | 15</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-slate-400 font-semibold">📍 PROXIMITY</span>
                        <span className="font-bold text-emerald-400">{selectedVessel.proximity_score} / 35</span>
                      </div>
                      <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                        <div
                          className="bg-emerald-400 h-full rounded-full transition-all"
                          style={{ width: `${(selectedVessel.proximity_score / 35) * 100}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono block mt-1">
                        {selectedVessel.min_distance_km} km from origin
                      </span>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-slate-400 font-semibold">🕐 TIMING</span>
                        <span className="font-bold text-indigo-400">{selectedVessel.temporal_score} / 20</span>
                      </div>
                      <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                        <div
                          className="bg-indigo-400 h-full rounded-full transition-all"
                          style={{ width: `${(selectedVessel.temporal_score / 20) * 100}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono block mt-1">
                        {selectedVessel.time_difference_hours}h time offset
                      </span>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-slate-400 font-semibold">🛳 TRAJECTORY</span>
                        <span className="font-bold text-amber-400">{selectedVessel.trajectory_score} / 30</span>
                      </div>
                      <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                        <div
                          className="bg-amber-400 h-full rounded-full transition-all"
                          style={{ width: `${(selectedVessel.trajectory_score / 30) * 100}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono block mt-1">
                        Corridor overlap match
                      </span>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-slate-400 font-semibold">📡 BEHAVIOUR</span>
                        <span className="font-bold text-orange-400">{selectedVessel.behavioral_score} / 15</span>
                      </div>
                      <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                        <div
                          className="bg-orange-400 h-full rounded-full transition-all"
                          style={{ width: `${(selectedVessel.behavioral_score / 15) * 100}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono block mt-1">
                        Speed &amp; transmission metrics
                      </span>
                    </div>
                  </div>
                </div>

                {/* Evidence Checklist */}
                <div className="pt-2 border-t border-slate-800/80">
                  <span className="text-xs font-mono font-bold text-slate-300 uppercase tracking-wider block mb-2">
                    WHY {selectedVessel.vessel_name}? (MEASURED AIS EVIDENCE):
                  </span>
                  <div className="space-y-1.5 bg-slate-950/80 p-3 rounded-lg border border-slate-800">
                    {selectedVessel.reasons.map((reason, rIdx) => (
                      <div key={rIdx} className="text-xs text-slate-200 flex items-start gap-2">
                        <span className="text-emerald-400 font-bold">✓</span>
                        <span className="capitalize">{reason}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Analytical Disclaimer */}
                <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/60 text-[11px] text-slate-400 leading-relaxed">
                  <span className="font-semibold text-slate-300">Analytical Disclaimer:</span> Vessel attribution is an analytical ranking based on spatial, temporal, trajectory, and behavioural correlation. It is not proof of responsibility.
                </div>
              </div>

              {/* Ecological Exposure Panel (Phase 5E Part 3) */}
              <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-400 font-bold">🌿</span>
                    <span className="text-xs font-mono font-bold text-slate-200 uppercase tracking-wider">
                      ECOLOGICAL EXPOSURE (RAMSAR GIS)
                    </span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                      data.ecological_exposure?.response_priority === "CRITICAL_ACTION" ||
                      data.ecological_exposure?.response_priority === "HIGH_PRIORITY" ||
                      data.ecology?.assessment.response_priority === "HIGH"
                        ? "bg-rose-950 text-rose-300 border border-rose-700 font-bold"
                        : "bg-emerald-950 text-emerald-300 border border-emerald-800"
                    }`}
                  >
                    {data.ecological_exposure?.response_priority === "CRITICAL_ACTION"
                      ? "🔴 DIRECT THREAT"
                      : data.ecological_exposure?.response_priority === "HIGH_PRIORITY" ||
                        data.ecology?.assessment.response_priority === "HIGH"
                      ? "🟠 HIGH PRIORITY"
                      : "🟢 LOW EXPOSURE"}
                  </span>
                </div>

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
                      : `No Direct Entry (${topRamsar.minimum_distance_km} km)`;

                    return (
                      <div
                        className={`p-3 rounded-lg border font-mono text-xs space-y-2 ${
                          isCurrent || isForecast
                            ? "bg-rose-950/40 border-rose-800/80"
                            : isNear
                            ? "bg-amber-950/30 border-amber-800/60"
                            : "bg-slate-950/80 border-slate-800"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className={`font-bold text-[11px] ${
                              isCurrent || isForecast ? "text-rose-400" : isNear ? "text-amber-400" : "text-emerald-400"
                            }`}
                          >
                            {bannerTitle}
                          </span>
                          <span
                            className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                              isCurrent || isForecast
                                ? "bg-rose-900 text-rose-200 border border-rose-700"
                                : isNear
                                ? "bg-amber-900 text-amber-200 border border-amber-700"
                                : "bg-emerald-900 text-emerald-200 border border-emerald-700"
                            }`}
                          >
                            {isCurrent ? "CURRENT OVERLAP" : topRamsar.threat_level.replace(/_/g, " ")}
                          </span>
                        </div>

                        <div className="text-white font-bold text-sm">{topRamsar.site_name}</div>
                        <div className="text-[11px] text-slate-400">
                          {topRamsar.state} · Official Ramsar Protected Wetland (
                          {topRamsar.area_hectares ? `${topRamsar.area_hectares.toLocaleString()} ha` : "Surveyed Boundary"}
                          )
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800 text-[11px]">
                          <div>
                            <span className="text-slate-400 block text-[10px]">Forecast Distance:</span>
                            <strong className="text-amber-400">{topRamsar.minimum_distance_km} km</strong>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[10px]">
                              {isCurrent ? "Exposure Basis:" : "Est. First Contact:"}
                            </span>
                            <strong className="text-rose-400">{timingLabel}</strong>
                          </div>
                        </div>

                        <div className="text-[10px] text-slate-300 bg-slate-950/60 p-2 rounded border border-slate-800">
                          {topRamsar.reason}
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  <div className="p-3 rounded-lg bg-emerald-950/30 border border-emerald-800/60 text-xs font-mono text-emerald-300">
                    🟢 NO SENSITIVE HABITAT EXPOSURE DETECTED
                    <p className="text-[10px] text-slate-400 mt-1">
                      The current forecast trajectory remains outside the surveyed Ramsar polygons.
                    </p>
                  </div>
                )}

                <p className="text-[9px] text-slate-500 font-mono leading-tight">
                  Ecological exposure is a spatial screening layer based on physical drift trajectory and surveyed Ramsar GIS polygons. Does not measure actual wildlife damage.
                </p>
              </div>

              {/* Explainable Scoring Guide */}
              <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/80 space-y-2">
                <button
                  type="button"
                  onClick={() => setShowFormulaDetails(!showFormulaDetails)}
                  className="w-full flex items-center justify-between text-xs font-mono font-bold text-slate-300 hover:text-white cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <span className="text-amber-400">⚖</span>
                    <span>NOT A BLACK BOX — EXPLAINABLE SCORING SYSTEM</span>
                  </span>
                  <span className="text-slate-500 text-xs">
                    {showFormulaDetails ? "Hide [-]" : "Show Details [+]"}
                  </span>
                </button>

                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Score = Proximity (35) + Temporal (20) + Trajectory (30) + Behaviour (15) = 100 max.
                </p>

                {showFormulaDetails && (
                  <div className="pt-2 border-t border-slate-800 space-y-1.5 text-[11px] text-slate-300 font-mono">
                    <div>
                      <strong className="text-emerald-400">• Proximity (35 max):</strong> Geodesic Haversine distance from AIS track point to the estimated origin coordinate.
                    </div>
                    <div>
                      <strong className="text-indigo-400">• Temporal (20 max):</strong> Time difference between the vessel AIS timestamp and the estimated spill origin time window (±6h).
                    </div>
                    <div>
                      <strong className="text-amber-400">• Trajectory (30 max):</strong> Whether the vessel transit corridor directly intersects the reconstructed hydrodynamic advection path.
                    </div>
                    <div>
                      <strong className="text-orange-400">• Behaviour (15 max):</strong> Measured operational anomalies such as sudden speed drops (≥50%) or AIS dark periods (≥2h).
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* Bottom: Ranked Candidates Table */}
            <section className="lg:col-span-12 space-y-2 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-slate-300 uppercase tracking-wider">
                  ALL RANKED CANDIDATE VESSELS ({attribution.candidate_vessels.length})
                </span>
                <span className="text-[11px] text-slate-500 font-mono">
                  Click row to inspect evidence &amp; highlight on map
                </span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/90 shadow-xl">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="border-b border-slate-800 bg-slate-950 text-slate-400">
                    <tr>
                      <th className="py-2.5 px-4">#</th>
                      <th className="py-2.5 px-4">Vessel Name</th>
                      <th className="py-2.5 px-4">MMSI</th>
                      <th className="py-2.5 px-4">Min Dist</th>
                      <th className="py-2.5 px-4">Time Offset</th>
                      <th className="py-2.5 px-4">Score Breakdown (Prox / Temp / Traj / Beh)</th>
                      <th className="py-2.5 px-4">Total Score</th>
                      <th className="py-2.5 px-4">Risk</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {attribution.candidate_vessels.map((vessel: CandidateVessel, idx: number) => {
                      const isSelected = selectedVessel.vessel_id === vessel.vessel_id;
                      return (
                        <tr
                          key={vessel.vessel_id}
                          onClick={() => setSelectedVesselId(vessel.vessel_id)}
                          className={`cursor-pointer transition-colors ${
                            isSelected
                              ? "bg-amber-500/15 font-semibold text-white"
                              : "hover:bg-slate-800/50"
                          }`}
                        >
                          <td className="py-2.5 px-4 text-slate-500">{idx + 1}</td>
                          <td className="py-2.5 px-4 text-white font-medium flex items-center gap-1.5">
                            {idx === 0 && <span className="text-amber-400">★</span>}
                            <span>{vessel.vessel_name}</span>
                            {vessel.went_dark && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-black tracking-wider bg-red-950 text-red-300 border border-red-700">
                                ⚠ DARK
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-slate-400">{vessel.vessel_id}</td>
                          <td className="py-2.5 px-4">{vessel.min_distance_km} km</td>
                          <td className="py-2.5 px-4">{vessel.time_difference_hours}h</td>
                          <td className="py-2.5 px-4 text-slate-400">
                            <span className="text-emerald-400 font-bold">{vessel.proximity_score}</span> /{" "}
                            <span className="text-indigo-400 font-bold">{vessel.temporal_score}</span> /{" "}
                            <span className="text-amber-400 font-bold">{vessel.trajectory_score}</span> /{" "}
                            <span className="text-orange-400 font-bold">{vessel.behavioral_score}</span>
                          </td>
                          <td className="py-2.5 px-4 font-bold text-amber-400 text-sm">
                            {vessel.score.toFixed(1)}
                          </td>
                          <td className="py-2.5 px-4">
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
            </section>
          </main>
        </div>
      )}

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="flex-none border-t border-slate-800/80 bg-slate-950 py-3 px-6 text-center text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-mono">
          <span>SlickTrace AI v1.0</span>
          <span>·</span>
          <span>Investigation Experience &amp; Dynamic Attribution Console</span>
        </div>
        <div className="text-[11px] text-slate-600">
          Hydrodynamic Lagrangian Hindcasting + AIS Spatial-Temporal Correlation Engine
        </div>
      </footer>
    </div>
  );
}
