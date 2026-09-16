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
    <div className="w-full h-full flex items-center justify-center bg-paper-alt text-ink-soft text-xs font-mono">
      Loading geospatial reconstruction…
    </div>
  ),
});

/** Risk is data, so it is one of the few places colour carries meaning. */
const RISK_TONE: Record<string, string> = {
  HIGH: "text-hazard border-hazard/40 bg-hazard/10 font-semibold",
  MEDIUM: "text-pending border-pending/40 bg-pending/10 font-semibold",
  LOW: "text-safe border-safe/40 bg-safe/10 font-semibold",
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
    <div className="min-h-screen bg-paper text-ink flex flex-col font-body">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="flex-none border-b border-grid bg-paper sticky top-0 z-30">
        <div className="px-5 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <Link href="/" className="flex items-center gap-2 shrink-0 group">
              <span className="w-7 h-7 rounded-[2px] bg-paper-alt border border-grid flex items-center justify-center text-ink font-display font-bold text-xs">
                ST
              </span>
              <span className="text-[15px] font-display font-bold tracking-tight text-ink group-hover:text-ink-soft transition-colors">
                SlickTrace
              </span>
            </Link>

            <div className="h-5 w-px bg-grid hidden sm:block" />

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
                    className={`px-2.5 py-1 rounded-[2px] text-[11px] font-mono whitespace-nowrap transition-colors disabled:opacity-50 ${
                      active
                        ? "bg-ink text-paper border border-ink font-medium"
                        : "text-ink-soft hover:text-ink border border-transparent"
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
            <div className="flex items-center rounded-[2px] border border-grid bg-paper-alt p-0.5">
              {([
                ["story", "Story", BookOpen],
                ["console", "Console", LayoutGrid],
              ] as const).map(([mode, label, Icon]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setViewMode(mode)}
                  className={`px-2.5 py-1 rounded-[2px] text-[11px] font-medium flex items-center gap-1.5 transition-colors ${
                    viewMode === mode
                      ? "bg-paper text-ink border border-grid shadow-none"
                      : "text-ink-soft hover:text-ink"
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
              className="text-[11px] font-medium px-2.5 py-1.5 rounded-[2px] border border-grid bg-paper hover:bg-paper-alt text-ink transition-colors flex items-center gap-1.5"
            >
              <Upload size={13} strokeWidth={1.75} />
              <span className="hidden md:inline">Upload</span>
            </Link>
          </div>
        </div>

        {(caseError || notice) && (
          <div className="px-5 pb-2.5 -mt-0.5">
            <p className={`text-[11px] font-mono ${caseError ? "text-hazard" : "text-pending"}`}>
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
          <div className="border-b border-grid bg-paper-alt">
            <div className="max-w-[1800px] mx-auto px-5 py-3 flex flex-col xl:flex-row xl:items-center gap-3 xl:gap-6">
              <div className="flex items-center gap-2.5 shrink-0">
                <span
                  className={`px-2 py-0.5 rounded-[2px] text-[11px] font-mono border ${
                    data.is_live
                      ? "text-safe border-safe/40 bg-safe/10 font-semibold"
                      : "text-ink border-grid bg-paper font-medium"
                  }`}
                >
                  {data.is_live ? "Live" : "Case"} {data.spill_id}
                </span>
                {activeCase && (
                  <span className="text-xs text-ink-soft hidden lg:inline truncate max-w-md">
                    {activeCase.headline}
                  </span>
                )}
              </div>

              {/* The three-step chain — the whole argument, left to right */}
              <div className="flex items-center gap-3 flex-wrap text-xs min-w-0">
                <span className="flex items-center gap-1.5 text-ink">
                  <Crosshair size={13} strokeWidth={1.75} className="text-ink-soft" />
                  <span>Slick</span>
                  <span className="font-mono">{drift.observation.latitude.toFixed(4)}°N {drift.observation.longitude.toFixed(4)}°E</span>
                </span>
                <span className="text-grid-strong" aria-hidden="true">/</span>
                <span className="flex items-center gap-1.5 text-ink">
                  <Route size={13} strokeWidth={1.75} className="text-ink-soft" />
                  <span>Origin −{origin.hours_before_observation}h at</span>
                  <span className="font-mono">{origin.lat.toFixed(4)}°N {origin.lon.toFixed(4)}°E</span>
                </span>
                <span className="text-grid-strong" aria-hidden="true">/</span>
                {topCandidate ? (
                  <span className="flex items-center gap-1.5 text-ink font-semibold">
                    <Ship size={13} strokeWidth={1.75} className="text-ink-soft" />
                    <span>{topCandidate.vessel_name}</span>
                    <span className="text-ink-soft font-normal font-mono text-[11px]">
                      ({topCandidate.min_distance_km} km away, score {topCandidate.score.toFixed(1)}/100)
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded-[2px] border text-[10px] font-mono ${RISK_TONE[topCandidate.risk]}`}
                    >
                      {topCandidate.risk}
                    </span>
                    {topCandidate.went_dark && (
                      <span className="px-1.5 py-0.5 rounded-[2px] border text-[10px] font-mono text-hazard border-hazard/40 bg-hazard/10 flex items-center gap-1">
                        <TriangleAlert size={10} strokeWidth={2} />
                        Went dark
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="text-ink-soft">No vessel in the search radius</span>
                )}
              </div>
            </div>
          </div>

          {/* ── Workspace ───────────────────────────────────────────────────── */}
          <main className="flex-1 max-w-[1800px] w-full mx-auto px-5 py-5 grid grid-cols-1 xl:grid-cols-12 gap-5">
            {/* Map — centre stage */}
            <section className="xl:col-span-8 flex flex-col gap-3">
              <div className="flex-1 min-h-[520px] xl:min-h-[640px] rounded-[2px] border border-grid overflow-hidden relative bg-paper-alt">
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
              <div className="rounded-[2px] border border-grid bg-paper-alt px-4 py-3">
                <div className="flex items-center justify-between gap-3 mb-2.5">
                  <div className="flex items-baseline gap-2.5 min-w-0">
                    <span className="text-xs font-semibold text-ink-soft">
                      {phase}
                    </span>
                    <span className="font-mono text-lg font-bold text-ink tabular-nums">
                      {hoursOffset > 0 ? "+" : ""}
                      {hoursOffset.toFixed(1)}h
                    </span>
                  </div>
                  <span className="text-xs font-mono text-ink-soft truncate">
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
                  className="w-full accent-ink cursor-pointer h-1.5 bg-grid rounded-[2px] appearance-none"
                />

                <div className="flex items-center justify-between text-[11px] font-mono text-ink-soft mt-2">
                  <span>−6h reconstructed origin</span>
                  <span className="text-ink font-semibold">0h observed</span>
                  <span>+6h forecast</span>
                </div>
              </div>
            </section>

            {/* Evidence column */}
            <section className="xl:col-span-4 flex flex-col gap-5">
              {/* Selected vessel */}
              <div className="rounded-[2px] border border-grid bg-paper-alt">
                <div className="px-4 py-3.5 border-b border-grid">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-xs font-semibold text-ink-soft flex items-center gap-1.5">
                        {isTopCandidate ? (
                          <>
                            <Target size={11} strokeWidth={2} className="text-hazard" />
                            Strongest lead
                          </>
                        ) : (
                          "Selected vessel"
                        )}
                      </span>
                      <h2 className="text-xl font-display font-bold text-ink mt-1 truncate">
                        {selectedVessel.vessel_name}
                      </h2>
                      <p className="text-xs font-mono text-ink-soft mt-0.5 truncate">
                        MMSI {selectedVessel.vessel_id}
                        {selectedVessel.vessel_type && `, ${selectedVessel.vessel_type}`}
                        {selectedVessel.flag && `, ${selectedVessel.flag}`}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono text-3xl font-bold text-ink leading-none tabular-nums">
                        {selectedVessel.score.toFixed(1)}
                      </div>
                      <div className="text-[11px] text-ink-soft font-mono mt-1">out of 100</div>
                      <span
                        className={`inline-block mt-1.5 px-1.5 py-0.5 rounded-[2px] border text-[10px] font-mono ${RISK_TONE[selectedVessel.risk]}`}
                      >
                        {selectedVessel.risk}
                      </span>
                    </div>
                  </div>

                  {selectedVessel.origin_band && (
                    <p className="mt-2.5 text-xs font-mono text-ink-soft flex items-center gap-1.5">
                      <Crosshair size={12} strokeWidth={1.75} className="text-ink-soft" />
                      Closest approach falls inside the{" "}
                      <span className="text-ink font-semibold">{selectedVessel.origin_band}</span> origin band
                    </p>
                  )}
                </div>

                {/* Four factors */}
                <div className="px-4 py-3.5 border-b border-grid space-y-3">
                  {FACTORS.map((f) => {
                    const value = selectedVessel[f.key];
                    const pct = Math.min((value / f.max) * 100, 100);
                    const Icon = f.icon;
                    return (
                      <div key={f.key}>
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span className="flex items-center gap-1.5 text-ink-soft">
                            <Icon size={12} strokeWidth={1.75} className="text-ink-soft" />
                            {f.label}
                          </span>
                          <span className="font-mono text-ink tabular-nums font-medium">
                            {value}
                            <span className="text-ink-soft"> / {f.max}</span>
                          </span>
                        </div>
                        <div className="h-1 rounded-[2px] bg-grid overflow-hidden">
                          <div
                            className="h-full rounded-[2px] bg-ink transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <p className="text-[11px] font-mono text-ink-soft mt-1">{f.note(selectedVessel)}</p>
                      </div>
                    );
                  })}
                </div>

                {/* Evidence */}
                <div className="px-4 py-3.5">
                  <h3 className="text-xs font-semibold text-ink mb-2.5">
                    Why this vessel
                  </h3>
                  <ul className="space-y-1.5">
                    {selectedVessel.reasons.map((reason, i) => (
                      <li key={i} className="text-xs text-ink-soft flex gap-2 leading-relaxed">
                        <span className="text-safe mt-0.5 shrink-0" aria-hidden="true">
                          —
                        </span>
                        <span className="first-letter:uppercase text-ink">{reason}</span>
                      </li>
                    ))}
                    {selectedVessel.reasons.length === 0 && (
                      <li className="text-xs text-ink-soft">No evidence recorded.</li>
                    )}
                  </ul>
                </div>
              </div>

              {/* Ecological exposure */}
              {exposure && (
                <div className="rounded-[2px] border border-grid bg-paper-alt">
                  <div className="px-4 py-3 border-b border-grid flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-ink flex items-center gap-1.5">
                      <Leaf size={12} strokeWidth={1.75} className="text-ink-soft" />
                      Ecological exposure
                    </h3>
                    <span
                      className={`text-[11px] font-semibold font-mono ${
                        exposure.response_priority === "CRITICAL_ACTION"
                          ? "text-hazard"
                          : exposure.response_priority === "HIGH_PRIORITY"
                          ? "text-pending"
                          : "text-ink-soft"
                      }`}
                    >
                      {exposure.response_priority.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div className="px-4 py-3 grid grid-cols-3 gap-3 text-center border-b border-grid">
                    {[
                      ["Sites screened", exposure.sites_analyzed],
                      ["Direct threat", exposure.direct_threats_count],
                      ["Near threat", exposure.near_threats_count],
                    ].map(([label, value]) => (
                      <div key={label as string}>
                        <div className="font-mono text-xl font-bold text-ink tabular-nums">{value as number}</div>
                        <div className="text-[11px] text-ink-soft mt-0.5">{label as string}</div>
                      </div>
                    ))}
                  </div>
                  {exposure.nearest_site && (
                    <p className="px-4 py-2.5 text-xs text-ink-soft leading-relaxed">
                      Nearest protected site{" "}
                      <span className="text-ink font-medium">{exposure.nearest_site.site_name}</span> at{" "}
                      <span className="font-mono text-ink">{exposure.nearest_site.minimum_distance_km} km</span>
                      {exposure.nearest_site.estimated_time_to_impact_hours != null && (
                        <span>, first contact in <span className="font-mono text-ink">{exposure.nearest_site.estimated_time_to_impact_hours} h</span></span>
                      )}
                    </p>
                  )}
                </div>
              )}
            </section>

            {/* ── Ranked candidates ─────────────────────────────────────────── */}
            <section className="xl:col-span-12">
              <div className="rounded-[2px] border border-grid bg-paper-alt overflow-hidden">
                <div className="px-4 py-3 border-b border-grid flex items-center justify-between gap-3">
                  <h3 className="text-xs font-semibold text-ink flex items-center gap-1.5">
                    <Signal size={12} strokeWidth={1.75} className="text-ink-soft" />
                    <span>Ranked candidates</span>
                    <span className="text-ink-soft font-normal">
                      ({attribution.candidate_vessels.length} vessels scored against origin)
                    </span>
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowMethod((v) => !v)}
                    className="text-xs text-ink-soft hover:text-ink flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    Scoring method
                    <ChevronDown
                      size={12}
                      className={`transition-transform ${showMethod ? "rotate-180" : ""}`}
                    />
                  </button>
                </div>

                {showMethod && (
                  <div className="px-4 py-3 border-b border-grid bg-paper grid grid-cols-2 md:grid-cols-4 gap-4">
                    {FACTORS.map((f) => (
                      <div key={f.key}>
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                          <f.icon size={12} strokeWidth={1.75} className="text-ink-soft" />
                          {f.label}
                          <span className="font-mono text-ink-soft">/{f.max}</span>
                        </div>
                        <p className="text-[11px] text-ink-soft mt-1 leading-relaxed">
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
                  <table className="w-full text-left text-xs">
                    <thead className="text-[11px] text-ink-soft border-b border-grid bg-paper font-medium">
                      <tr>
                        <th className="py-2.5 px-4 w-10 font-normal">#</th>
                        <th className="py-2.5 px-4 font-normal">Vessel</th>
                        <th className="py-2.5 px-4 font-normal">MMSI</th>
                        <th className="py-2.5 px-4 font-normal hidden md:table-cell">Type</th>
                        <th className="py-2.5 px-4 font-normal text-right">Distance</th>
                        <th className="py-2.5 px-4 font-normal text-right hidden sm:table-cell">Δt</th>
                        <th className="py-2.5 px-4 font-normal text-right">Score</th>
                        <th className="py-2.5 px-4 font-normal">Risk</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attribution.candidate_vessels.map((vessel, idx) => {
                        const isSelected = selectedVessel.vessel_id === vessel.vessel_id;
                        return (
                          <tr
                            key={vessel.vessel_id}
                            onClick={() => setSelectedVesselId(vessel.vessel_id)}
                            className={`cursor-pointer border-b border-grid last:border-0 transition-colors ${
                              isSelected ? "bg-paper font-medium" : "hover:bg-paper/60"
                            }`}
                          >
                            <td className="py-2.5 px-4 font-mono text-ink-soft tabular-nums">{idx + 1}</td>
                            <td className="py-2.5 px-4">
                              <span className={`font-semibold ${isSelected ? "text-ink" : "text-ink"}`}>
                                {vessel.vessel_name}
                              </span>
                              {vessel.went_dark && (
                                <span className="ml-2 px-1.5 py-0.5 rounded-[2px] border text-[9px] font-mono font-semibold text-hazard border-hazard/40 bg-hazard/10 inline-flex items-center gap-1 align-middle">
                                  <TriangleAlert size={9} strokeWidth={2} />
                                  Dark
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-4 font-mono text-ink-soft tabular-nums">{vessel.vessel_id}</td>
                            <td className="py-2.5 px-4 text-ink-soft hidden md:table-cell">{vessel.vessel_type ?? "—"}</td>
                            <td className="py-2.5 px-4 font-mono text-ink-soft text-right tabular-nums">
                              {vessel.min_distance_km} km
                            </td>
                            <td className="py-2.5 px-4 font-mono text-ink-soft text-right tabular-nums hidden sm:table-cell">
                              {vessel.time_difference_hours} h
                            </td>
                            <td className="py-2.5 px-4 font-mono font-bold text-right tabular-nums text-ink">
                              {vessel.score.toFixed(1)}
                            </td>
                            <td className="py-2.5 px-4">
                              <span className={`px-1.5 py-0.5 rounded-[2px] border text-[10px] font-mono ${RISK_TONE[vessel.risk]}`}>
                                {vessel.risk}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <p className="px-4 py-2.5 border-t border-grid text-[11px] text-ink-soft flex items-center gap-1.5">
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
