"use client";

/**
 * Dashboard — the investigation console.
 *
 * Layout follows the argument, not the data model: the verdict strip states the finding,
 * the map carries the reconstruction, and the panels beside it justify the score. One
 * surface level throughout — hairline dividers instead of nested cards — so the eye lands
 * on the map and the evidence rather than on box edges.
 */

import dynamic from "next/dynamic";
import Link from "next/link";
import { useState, useMemo } from "react";
import {
  ArrowRight,
  BookOpen,
  ChevronDown,
  Clock,
  Crosshair,
  Gauge,
  LayoutGrid,
  Leaf,
  MapPin,
  Radio,
  Route,
  Ship,
  Signal,
  Target,
  TriangleAlert,
  Upload,
} from "lucide-react";
import {
  fetchInvestigation,
  buildCaseList,
  type InvestigationResponse,
  type CandidateVessel,
} from "@/lib/api";
import InvestigationStoryMode from "@/components/InvestigationStoryMode";
import DossierButton from "@/components/DossierButton";
import SiteFooter from "@/components/SiteFooter";

// Leaflet requires browser APIs — load client-side only, never SSR
const SpillMap = dynamic(() => import("@/components/SpillMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-ink-900 text-fg-dim text-xs font-mono tracking-wider">
      Loading geospatial reconstruction…
    </div>
  ),
});

/** Risk is data, so it is one of the few places colour carries meaning. */
const RISK_TONE: Record<string, string> = {
  HIGH: "text-risk-high border-risk-high/40 bg-risk-high/10",
  MEDIUM: "text-risk-med border-risk-med/40 bg-risk-med/10",
  LOW: "text-risk-low border-line-strong bg-ink-800",
};

const FACTORS = [
  { key: "proximity_score" as const, max: 35, label: "Proximity", icon: MapPin, note: (v: CandidateVessel) => `${v.min_distance_km} km from origin` },
  { key: "temporal_score" as const, max: 20, label: "Timing", icon: Clock, note: (v: CandidateVessel) => `${v.time_difference_hours} h offset` },
  { key: "trajectory_score" as const, max: 30, label: "Trajectory", icon: Route, note: () => "origin corridor overlap" },
  { key: "behavioral_score" as const, max: 15, label: "Behaviour", icon: Gauge, note: (v: CandidateVessel) => (v.went_dark ? "transponder silence" : "speed & transmission") },
];

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
  const [showMethod, setShowMethod] = useState(false);

  const { drift, attribution } = data;

  // Chronological timeline: origin (−6h) → observation → forecast (+6h).
  // The backend orders hindcast.trajectory observation-first, so reverse it here.
  const allSteps = useMemo(
    () => [...[...drift.hindcast.trajectory].reverse(), ...drift.forecast.trajectory.slice(1)],
    [drift]
  );
  const obsIdx = drift.hindcast.trajectory.length - 1;

  const [timelineIdx, setTimelineIdx] = useState(obsIdx);
  const [selectedVesselId, setSelectedVesselId] = useState<string | null>(
    attribution.candidate_vessels[0]?.vessel_id || null
  );

  const currentStep = allSteps[timelineIdx];
  const hoursOffset =
    currentStep?.hours_before_observation != null
      ? -currentStep.hours_before_observation
      : currentStep?.hours_after_observation ?? 0;

  const phase =
    timelineIdx < obsIdx ? "Hindcast" : timelineIdx === obsIdx ? "Observation" : "Forecast";

  const selectedVessel: CandidateVessel = useMemo(() => {
    if (!attribution.candidate_vessels.length) {
      return {
        vessel_id: "—", vessel_name: "No candidates", score: 0, risk: "LOW",
        min_distance_km: 0, time_difference_hours: 0, proximity_score: 0,
        temporal_score: 0, trajectory_score: 0, behavioral_score: 0, reasons: [],
      };
    }
    return (
      attribution.candidate_vessels.find((v) => v.vessel_id === selectedVesselId) ||
      attribution.candidate_vessels[0]
    );
  }, [attribution, selectedVesselId]);

  const topCandidate = attribution.candidate_vessels[0];
  const isTopCandidate = selectedVessel.vessel_id === topCandidate?.vessel_id;
  const activeCase = cases.find((c) => c.id === data.spill_id);
  const origin = drift.hindcast.estimated_origin;
  const exposure = data.ecological_exposure;

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
      setCaseError(err instanceof Error ? err.message : "Failed to load case");
    } finally {
      setIsLoadingCase(false);
    }
  };

  return (
    <div className="min-h-screen bg-ink-950 text-fg flex flex-col font-sans selection:bg-accent/30">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="flex-none border-b border-line bg-ink-900/95 backdrop-blur-md sticky top-0 z-30">
        <div className="px-5 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <Link href="/" className="flex items-center gap-2 shrink-0 group">
              <span className="w-7 h-7 rounded-md bg-accent/15 border border-accent/40 flex items-center justify-center text-accent font-black text-xs">
                ST
              </span>
              <span className="text-[15px] font-bold tracking-tight text-fg group-hover:text-accent transition-colors">
                SlickTrace
              </span>
            </Link>

            <div className="h-5 w-px bg-line hidden sm:block" />

            {/* Case switcher */}
            <div className="flex items-center gap-1 min-w-0 overflow-x-auto">
              {cases.map((c) => {
                const active = data.spill_id === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleSwitchCase(c.id)}
                    disabled={isLoadingCase}
                    title={c.headline}
                    className={`px-2.5 py-1 rounded text-[11px] font-mono whitespace-nowrap transition-colors disabled:opacity-50 ${
                      active
                        ? "bg-ink-800 text-accent border border-line-strong"
                        : "text-fg-dim hover:text-fg-muted border border-transparent"
                    }`}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* View toggle */}
            <div className="flex items-center rounded-md border border-line bg-ink-850 p-0.5">
              {([
                ["story", "Story", BookOpen],
                ["console", "Console", LayoutGrid],
              ] as const).map(([mode, label, Icon]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setViewMode(mode)}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium flex items-center gap-1.5 transition-colors ${
                    viewMode === mode ? "bg-ink-700 text-fg" : "text-fg-dim hover:text-fg-muted"
                  }`}
                >
                  <Icon size={13} strokeWidth={1.75} />
                  <span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </div>

            <DossierButton data={data} />

            <Link
              href="/investigate"
              className="text-[11px] font-medium px-2.5 py-1.5 rounded-md border border-line bg-ink-850 hover:bg-ink-800 text-fg-muted hover:text-fg transition-colors flex items-center gap-1.5"
            >
              <Upload size={13} strokeWidth={1.75} />
              <span className="hidden md:inline">Upload</span>
            </Link>
          </div>
        </div>

        {(caseError || notice) && (
          <div className="px-5 pb-2.5 -mt-0.5">
            <p className={`text-[11px] font-mono ${caseError ? "text-risk-high" : "text-risk-med"}`}>
              {caseError ?? notice}
            </p>
          </div>
        )}
      </header>

      {viewMode === "story" ? (
        <InvestigationStoryMode
          data={data}
          onSwitchCase={handleSwitchCase}
          onOpenConsole={() => setViewMode("console")}
        />
      ) : (
        <>
          {/* ── Verdict strip: the finding, in one line ──────────────────────── */}
          <div className="border-b border-line bg-ink-900">
            <div className="max-w-[1800px] mx-auto px-5 py-3.5 flex flex-col xl:flex-row xl:items-center gap-3 xl:gap-6">
              <div className="flex items-center gap-2.5 shrink-0">
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-[0.12em] border ${
                    data.is_live
                      ? "text-ok border-ok/40 bg-ok/10"
                      : "text-fg-muted border-line-strong bg-ink-850"
                  }`}
                >
                  {data.is_live ? "Live" : "Case"} {data.spill_id}
                </span>
                {activeCase && (
                  <span className="text-[11px] text-fg-dim hidden lg:inline truncate max-w-md">
                    {activeCase.headline}
                  </span>
                )}
              </div>

              {/* The three-step chain — the whole argument, left to right */}
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap text-[11px] font-mono min-w-0">
                <span className="flex items-center gap-1.5 text-fg-muted">
                  <Crosshair size={13} strokeWidth={1.75} className="text-fg-dim" />
                  Slick {drift.observation.latitude.toFixed(4)}°N {drift.observation.longitude.toFixed(4)}°E
                </span>
                <ArrowRight size={12} className="text-fg-dim shrink-0" />
                <span className="flex items-center gap-1.5 text-fg-muted">
                  <Route size={13} strokeWidth={1.75} className="text-fg-dim" />
                  Origin −{origin.hours_before_observation}h at {origin.lat.toFixed(4)}°N {origin.lon.toFixed(4)}°E
                </span>
                <ArrowRight size={12} className="text-fg-dim shrink-0" />
                {topCandidate ? (
                  <span className="flex items-center gap-1.5 text-fg font-semibold">
                    <Ship size={13} strokeWidth={1.75} className="text-accent" />
                    {topCandidate.vessel_name}
                    <span className="text-fg-dim font-normal">
                      · {topCandidate.min_distance_km} km away · {topCandidate.score.toFixed(1)}/100
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${RISK_TONE[topCandidate.risk]}`}
                    >
                      {topCandidate.risk}
                    </span>
                    {topCandidate.went_dark && (
                      <span className="px-1.5 py-0.5 rounded border text-[10px] font-bold text-risk-high border-risk-high/40 bg-risk-high/10 flex items-center gap-1">
                        <TriangleAlert size={10} strokeWidth={2} />
                        WENT DARK
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="text-fg-dim">No vessel in the search radius</span>
                )}
              </div>
            </div>
          </div>

          {/* ── Workspace ───────────────────────────────────────────────────── */}
          <main className="flex-1 max-w-[1800px] w-full mx-auto px-5 py-5 grid grid-cols-1 xl:grid-cols-12 gap-5">
            {/* Map — centre stage */}
            <section className="xl:col-span-8 flex flex-col gap-3">
              <div className="flex-1 min-h-[520px] xl:min-h-[640px] rounded-lg border border-line overflow-hidden relative bg-ink-900">
                <SpillMap
                  key={data.spill_id}
                  data={data}
                  timelineIdx={timelineIdx}
                  selectedVesselId={selectedVesselId}
                  onVesselSelect={setSelectedVesselId}
                  onTimelineChange={setTimelineIdx}
                />
              </div>

              {/* Timeline scrubber */}
              <div className="rounded-lg border border-line bg-ink-900 px-4 py-3">
                <div className="flex items-center justify-between gap-3 mb-2.5">
                  <div className="flex items-baseline gap-2.5 min-w-0">
                    <span className="text-[11px] font-semibold text-fg-muted uppercase tracking-wider">
                      {phase}
                    </span>
                    <span className="font-mono text-lg font-bold text-accent tabular-nums">
                      {hoursOffset > 0 ? "+" : ""}
                      {hoursOffset.toFixed(1)}h
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-fg-dim truncate">
                    {currentStep ? new Date(currentStep.timestamp).toUTCString() : ""}
                  </span>
                </div>

                <input
                  type="range"
                  min={0}
                  max={allSteps.length - 1}
                  value={timelineIdx}
                  onChange={(e) => setTimelineIdx(Number(e.target.value))}
                  aria-label="Investigation timeline"
                  className="w-full accent-[#f0b429] cursor-pointer h-1.5 bg-ink-800 rounded-full appearance-none"
                />

                <div className="flex items-center justify-between text-[10px] font-mono text-fg-dim mt-2">
                  <span>−6h · reconstructed origin</span>
                  <span className="text-accent">0h · observed</span>
                  <span>+6h · forecast</span>
                </div>
              </div>
            </section>

            {/* Evidence column */}
            <section className="xl:col-span-4 flex flex-col gap-5">
              {/* Selected vessel */}
              <div className="rounded-lg border border-line bg-ink-900">
                <div className="px-4 py-3.5 border-b border-line">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-dim flex items-center gap-1.5">
                        {isTopCandidate ? (
                          <>
                            <Target size={11} strokeWidth={2} className="text-accent" />
                            Strongest lead
                          </>
                        ) : (
                          "Selected vessel"
                        )}
                      </span>
                      <h2 className="text-xl font-bold text-fg mt-1 truncate">
                        {selectedVessel.vessel_name}
                      </h2>
                      <p className="text-[11px] font-mono text-fg-dim mt-0.5 truncate">
                        MMSI {selectedVessel.vessel_id}
                        {selectedVessel.vessel_type && ` · ${selectedVessel.vessel_type}`}
                        {selectedVessel.flag && ` · ${selectedVessel.flag}`}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono text-3xl font-black text-accent leading-none tabular-nums">
                        {selectedVessel.score.toFixed(1)}
                      </div>
                      <div className="text-[10px] text-fg-dim font-mono mt-1">out of 100</div>
                      <span
                        className={`inline-block mt-1.5 px-1.5 py-0.5 rounded border text-[10px] font-bold ${RISK_TONE[selectedVessel.risk]}`}
                      >
                        {selectedVessel.risk}
                      </span>
                    </div>
                  </div>

                  {selectedVessel.origin_band && (
                    <p className="mt-2.5 text-[11px] font-mono text-fg-muted flex items-center gap-1.5">
                      <Crosshair size={12} strokeWidth={1.75} className="text-fg-dim" />
                      Closest approach falls inside the{" "}
                      <span className="text-accent">{selectedVessel.origin_band}</span> origin band
                    </p>
                  )}
                </div>

                {/* Four factors */}
                <div className="px-4 py-3.5 border-b border-line space-y-3">
                  {FACTORS.map((f) => {
                    const value = selectedVessel[f.key];
                    const pct = Math.min((value / f.max) * 100, 100);
                    const Icon = f.icon;
                    return (
                      <div key={f.key}>
                        <div className="flex items-center justify-between text-[11px] mb-1.5">
                          <span className="flex items-center gap-1.5 text-fg-muted">
                            <Icon size={12} strokeWidth={1.75} className="text-fg-dim" />
                            {f.label}
                          </span>
                          <span className="font-mono text-fg tabular-nums">
                            {value}
                            <span className="text-fg-dim"> / {f.max}</span>
                          </span>
                        </div>
                        <div className="h-1 rounded-full bg-ink-800 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-accent/80 transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <p className="text-[10px] font-mono text-fg-dim mt-1">{f.note(selectedVessel)}</p>
                      </div>
                    );
                  })}
                </div>

                {/* Evidence */}
                <div className="px-4 py-3.5">
                  <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-dim mb-2.5">
                    Why this vessel
                  </h3>
                  <ul className="space-y-1.5">
                    {selectedVessel.reasons.map((reason, i) => (
                      <li key={i} className="text-[12px] text-fg-muted flex gap-2 leading-relaxed">
                        <span className="text-ok mt-0.5 shrink-0" aria-hidden="true">
                          —
                        </span>
                        <span className="first-letter:uppercase">{reason}</span>
                      </li>
                    ))}
                    {selectedVessel.reasons.length === 0 && (
                      <li className="text-[12px] text-fg-dim">No evidence recorded.</li>
                    )}
                  </ul>
                </div>
              </div>

              {/* Ecological exposure */}
              {exposure && (
                <div className="rounded-lg border border-line bg-ink-900">
                  <div className="px-4 py-3 border-b border-line flex items-center justify-between">
                    <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-dim flex items-center gap-1.5">
                      <Leaf size={12} strokeWidth={1.75} />
                      Ecological exposure
                    </h3>
                    <span
                      className={`text-[10px] font-bold font-mono ${
                        exposure.response_priority === "CRITICAL_ACTION"
                          ? "text-risk-high"
                          : exposure.response_priority === "HIGH_PRIORITY"
                          ? "text-risk-med"
                          : "text-fg-muted"
                      }`}
                    >
                      {exposure.response_priority.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div className="px-4 py-3 grid grid-cols-3 gap-3 text-center border-b border-line">
                    {[
                      ["Sites screened", exposure.sites_analyzed],
                      ["Direct threat", exposure.direct_threats_count],
                      ["Near threat", exposure.near_threats_count],
                    ].map(([label, value]) => (
                      <div key={label as string}>
                        <div className="font-mono text-xl font-bold text-fg tabular-nums">{value as number}</div>
                        <div className="text-[10px] text-fg-dim mt-0.5">{label as string}</div>
                      </div>
                    ))}
                  </div>
                  {exposure.nearest_site && (
                    <p className="px-4 py-2.5 text-[11px] text-fg-muted leading-relaxed">
                      Nearest protected site{" "}
                      <span className="text-fg font-medium">{exposure.nearest_site.site_name}</span> at{" "}
                      <span className="font-mono">{exposure.nearest_site.minimum_distance_km} km</span>
                      {exposure.nearest_site.estimated_time_to_impact_hours != null && (
                        <> · first contact in <span className="font-mono">{exposure.nearest_site.estimated_time_to_impact_hours} h</span></>
                      )}
                    </p>
                  )}
                </div>
              )}
            </section>

            {/* ── Ranked candidates ─────────────────────────────────────────── */}
            <section className="xl:col-span-12">
              <div className="rounded-lg border border-line bg-ink-900 overflow-hidden">
                <div className="px-4 py-3 border-b border-line flex items-center justify-between gap-3">
                  <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-dim flex items-center gap-1.5">
                    <Signal size={12} strokeWidth={1.75} />
                    Ranked candidates
                    <span className="text-fg-dim/70 normal-case tracking-normal font-normal">
                      · {attribution.candidate_vessels.length} vessels scored against the origin
                    </span>
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowMethod((v) => !v)}
                    className="text-[11px] text-fg-dim hover:text-fg-muted flex items-center gap-1 transition-colors"
                  >
                    Scoring method
                    <ChevronDown
                      size={12}
                      className={`transition-transform ${showMethod ? "rotate-180" : ""}`}
                    />
                  </button>
                </div>

                {showMethod && (
                  <div className="px-4 py-3 border-b border-line bg-ink-850 grid grid-cols-2 md:grid-cols-4 gap-4">
                    {FACTORS.map((f) => (
                      <div key={f.key}>
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-fg-muted">
                          <f.icon size={12} strokeWidth={1.75} className="text-fg-dim" />
                          {f.label}
                          <span className="font-mono text-fg-dim">/{f.max}</span>
                        </div>
                        <p className="text-[10px] text-fg-dim mt-1 leading-relaxed">
                          {f.key === "proximity_score" && "How close the track passed to the reconstructed origin."}
                          {f.key === "temporal_score" && "How near in time the closest approach was to the discharge."}
                          {f.key === "trajectory_score" && "Whether the course crosses the origin corridor."}
                          {f.key === "behavioral_score" && "Speed drops near the window, and anomalous AIS silence."}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[12px]">
                    <thead className="text-[10px] uppercase tracking-wider text-fg-dim border-b border-line">
                      <tr>
                        <th className="py-2 px-4 font-medium w-10">#</th>
                        <th className="py-2 px-4 font-medium">Vessel</th>
                        <th className="py-2 px-4 font-medium">MMSI</th>
                        <th className="py-2 px-4 font-medium hidden md:table-cell">Type</th>
                        <th className="py-2 px-4 font-medium text-right">Distance</th>
                        <th className="py-2 px-4 font-medium text-right hidden sm:table-cell">Δt</th>
                        <th className="py-2 px-4 font-medium text-right">Score</th>
                        <th className="py-2 px-4 font-medium">Risk</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attribution.candidate_vessels.map((vessel, idx) => {
                        const isSelected = selectedVessel.vessel_id === vessel.vessel_id;
                        return (
                          <tr
                            key={vessel.vessel_id}
                            onClick={() => setSelectedVesselId(vessel.vessel_id)}
                            className={`cursor-pointer border-b border-line/60 last:border-0 transition-colors ${
                              isSelected ? "bg-accent/[0.07]" : "hover:bg-ink-850"
                            }`}
                          >
                            <td className="py-2 px-4 font-mono text-fg-dim tabular-nums">{idx + 1}</td>
                            <td className="py-2 px-4">
                              <span className={`font-medium ${isSelected ? "text-accent" : "text-fg"}`}>
                                {vessel.vessel_name}
                              </span>
                              {vessel.went_dark && (
                                <span className="ml-2 px-1.5 py-0.5 rounded border text-[9px] font-bold text-risk-high border-risk-high/40 bg-risk-high/10 inline-flex items-center gap-1 align-middle">
                                  <TriangleAlert size={9} strokeWidth={2} />
                                  DARK
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-4 font-mono text-fg-dim tabular-nums">{vessel.vessel_id}</td>
                            <td className="py-2 px-4 text-fg-dim hidden md:table-cell">{vessel.vessel_type ?? "—"}</td>
                            <td className="py-2 px-4 font-mono text-fg-muted text-right tabular-nums">
                              {vessel.min_distance_km} km
                            </td>
                            <td className="py-2 px-4 font-mono text-fg-muted text-right tabular-nums hidden sm:table-cell">
                              {vessel.time_difference_hours} h
                            </td>
                            <td className="py-2 px-4 font-mono font-bold text-right tabular-nums text-fg">
                              {vessel.score.toFixed(1)}
                            </td>
                            <td className="py-2 px-4">
                              <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${RISK_TONE[vessel.risk]}`}>
                                {vessel.risk}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <p className="px-4 py-2.5 border-t border-line text-[10px] text-fg-dim flex items-center gap-1.5">
                  <Radio size={11} strokeWidth={1.75} />
                  Analytical ranking to prioritise investigation — not proof of responsibility.
                </p>
              </div>
            </section>
          </main>
        </>
      )}

      <SiteFooter />
    </div>
  );
}
