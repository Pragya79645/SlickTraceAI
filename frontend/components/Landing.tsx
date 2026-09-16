/**
 * Landing — the public homepage.
 *
 * Visual-only redesign: identical copy, links, sections and data. Adds
 * dossier containment, translucent evidence cards and a sparser drafting
 * background so the page reads as one intelligence casefile.
 */

import Link from "next/link";
import {
  Crosshair,
  FileText,
  Gauge,
  Leaf,
  Radar,
  Route,
  Satellite,
  Scale,
  ScanLine,
  Ship,
  SignalZero,
  Undo2,
  Waves,
} from "lucide-react";
import Hero from "@/components/Hero";
import ModelMetricsPanel from "@/components/ModelMetricsPanel";
import Reveal from "@/components/Reveal";
import SiteFooter from "@/components/SiteFooter";
import SiteNav from "@/components/SiteNav";

// ── The four moves of the pipeline ───────────────────────────────────────────

const PIPELINE = [
  {
    step: "01",
    icon: Crosshair,
    title: "Detect",
    body: "Instance segmentation finds the slick in a Sentinel-1 scene and measures its area, perimeter and shape.",
    out: "Slick polygon + geometry",
  },
  {
    step: "02",
    icon: Route,
    title: "Trace back",
    body: "Drift physics runs the ocean backwards six hours, on real current and wind fields, to where the oil entered the water.",
    out: "Origin + probability bands",
  },
  {
    step: "03",
    icon: Ship,
    title: "Attribute",
    body: "AIS traffic is scored against that origin on four weighted factors — including vessels that switched their transponder off.",
    out: "Ranked suspects + evidence",
  },
  {
    step: "04",
    icon: Leaf,
    title: "Protect",
    body: "The forward forecast is intersected with India's official Ramsar wetland polygons to flag what the slick reaches next.",
    out: "Exposure + response priority",
  },
];

// ── What holds up under questioning ──────────────────────────────────────────

const CAPABILITIES = [
  {
    icon: Satellite,
    title: "The scene locates itself",
    body: "A Sentinel-1 GeoTIFF carries its own coordinate system, transform and acquisition time. Every mask vertex lands in real WGS84 and the slick centroid anchors the drift model — nobody types a latitude.",
    tag: "rasterio · CRS-aware",
  },
  {
    icon: ScanLine,
    title: "Published detector numbers",
    body: "Mask mAP50 0.66, precision 0.78, recall 0.56 — read live from the checkpoint, not a slide. Full scenes run as overlapping 256-px tiles behind a physical dark-spot gate, so sea texture never becomes a false slick.",
    tag: "YOLOv8-seg · tiled inference",
  },
  {
    icon: Undo2,
    title: "Physics, run backwards",
    body: "Lagrangian advection — surface current plus a 3% wind factor — steps the slick back in 30-minute increments. Forcing comes from Open-Meteo Marine and ERA5 reanalysis for the actual date and place.",
    tag: "6 h hindcast · real forcing",
  },
  {
    icon: Radar,
    title: "Uncertainty you can see",
    body: "A single backtrack line is false precision. Five hundred particles each carry perturbed current, wind and wind-drift factor plus turbulent diffusion, resolving into 50/80/95% origin probability bands.",
    tag: "500-particle Monte Carlo",
  },
  {
    icon: Scale,
    title: "Every point is explainable",
    body: "Four weighted factors — proximity 35, timing 20, trajectory 30, behaviour 15 — and each returns the sentence that earned it: “passed within 0.06 km of reconstructed origin”.",
    tag: "4-factor · human-readable",
  },
  {
    icon: SignalZero,
    title: "It catches ships that go dark",
    body: "Switching AIS off is the signature of a deliberate discharge. Gaps are judged against each vessel's own cadence; a silence spanning the discharge window is interpolated and scored as inferred evidence, at a discount.",
    tag: "cadence-relative silence",
  },
];

const ALSO = [
  { icon: Leaf, title: "Ecological exposure", body: "99 official Ramsar polygons intersected as real geometry, with time to first contact." },
  { icon: Waves, title: "Volume estimate", body: "Bonn Agreement appearance codes convert slick area to a tonnage bracket." },
  { icon: FileText, title: "Enforcement dossier", body: "One click produces a four-page PDF ready for a MARPOL Annex I notice." },
  { icon: Gauge, title: "Runs without a network", body: "Cached forcing and a regional fallback keep the pipeline alive offline." },
];

const SHEETS = ["torn-c", "torn-d", "torn-c", "torn-d", "torn-c", "torn-d"];
const TONES = ["", "evidence-card--cool", "evidence-card--archival", "evidence-card--warm", "", "evidence-card--cool"];
const TILTS = ["tilt-slight-l", "tilt-slight-r", "tilt-slight-r", "tilt-slight-l", "tilt-slight-l", "tilt-slight-r"];

export default function Landing() {
  return (
    <div className="min-h-screen bg-paper text-ink font-body landing-grid selection:bg-ink selection:text-paper overflow-x-clip">
      <SiteNav />

      <main>
        <Hero />

        {/* ── The problem ──────────────────────────────────────────────────── */}
        <section className="border-t border-grid">
          <div className="max-w-6xl mx-auto px-6 py-20 sm:py-24 grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
            <Reveal className="lg:col-span-8">
              <span className="text-xs text-ink-soft">
                The problem
              </span>
              <p className="mt-8 text-2xl sm:text-3xl lg:text-[2.5rem] text-ink leading-[1.3] font-display font-bold tracking-tight max-w-3xl">
                Most marine oil pollution isn&apos;t a tanker disaster. It is routine, deliberate
                discharge — released at night, far offshore, where nobody is looking.
              </p>
              <p className="mt-7 text-base sm:text-lg text-ink-soft leading-relaxed max-w-2xl">
                Satellites see the slick hours later. By then the ship has moved on, and the missing
                link between the oil and its source is exactly what lets it go unpunished. SlickTrace
                closes that gap with drift physics and public vessel telemetry.
              </p>
            </Reveal>
            <Reveal delay={120} rotate="0.4deg" className="lg:col-span-4">
              <aside className="dossier-sheet torn-d evidence-card--warm tape p-4">
                <span aria-hidden="true" className="tape-strip tc" />
                <p className="doc-label"><b>Field note 07</b> Night discharge pattern</p>
                <svg viewBox="0 0 260 110" className="mt-3 w-full h-24" role="img" aria-label="Night discharge schematic">
                  <rect x="4" y="4" width="252" height="102" fill="rgba(19,33,43,0.05)" stroke="#9AA394" strokeWidth="1" />
                  <path d="M20,78 C80,70 140,74 220,58" fill="none" stroke="#13212B" strokeWidth="1.4" strokeDasharray="5 4" className="trace-draw" />
                  <path d="M60,70 C90,62 120,60 150,56" fill="rgba(166,16,63,0.12)" stroke="#A6103F" strokeWidth="1.2" />
                  <circle cx="220" cy="58" r="3" fill="#13212B" />
                  <text x="12" y="20" fontSize="8" fontFamily="monospace" fill="#51697A">02:14Z · NO AIS</text>
                  <text x="150" y="100" fontSize="8" fontFamily="monospace" fill="#51697A">30 KM CORRIDOR</text>
                </svg>
                <p className="mt-3 text-[12px] text-ink-soft leading-relaxed">
                  The slick is found hours after release. The vessel&apos;s track must be reconstructed,
                  not assumed.
                </p>
                <p className="mt-3 pt-3 border-t border-grid font-mono text-[10px] text-ink-soft">
                  Source: discharge-window analysis
                </p>
              </aside>
            </Reveal>
          </div>
        </section>

        {/* ── How it works ─────────────────────────────────────────────────── */}
        <section id="how-it-works" className="scroll-mt-24 border-t border-grid">
          <div className="max-w-6xl mx-auto px-6 py-20 sm:py-24">
            <Reveal>
              <div className="dossier-sheet torn-a tape p-5 sm:p-8">
                <span aria-hidden="true" className="tape-strip tl" />
                <span aria-hidden="true" className="tape-strip tr" />
                <div className="flex items-baseline gap-5">
                  <span className="text-xs text-ink shrink-0">
                    How it works
                  </span>
                  <span className="flex-1 h-px bg-grid" />
                  <span className="font-mono text-[10px] text-ink-soft hidden sm:inline">Chain ST-4 · four moves</span>
                </div>

                <h2 className="mt-8 text-3xl sm:text-4xl font-display font-black tracking-tight text-ink max-w-xl leading-tight">
                  One scene in.
                  <br />
                  <span className="text-ink-soft font-light">A named suspect out.</span>
                </h2>

                <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {PIPELINE.map((s, i) => {
                    const Icon = s.icon;
                    return (
                      <Reveal key={s.step} delay={Math.min(i * 90, 270)}>
                        <div className="evidence-card corner-tick p-4 h-full">
                          <i aria-hidden="true" /><i aria-hidden="true" /><i aria-hidden="true" /><i aria-hidden="true" />
                          <div className="flex items-center justify-between">
                            <Icon size={18} strokeWidth={1.5} className="text-ink shrink-0" />
                            <span className="font-mono text-[11px] text-ink-soft tabular-nums">{s.step}</span>
                          </div>
                          <div className="mt-3 h-px bg-grid" aria-hidden="true" />
                          <h3 className="mt-3 text-lg font-semibold text-ink tracking-tight">{s.title}</h3>
                          <p className="mt-2 text-[13px] text-ink-soft leading-relaxed">{s.body}</p>
                          <p className="mt-4 text-[11px] text-ink-soft flex items-center gap-1.5">
                            <span className="text-grid-strong" aria-hidden="true">—</span>
                            {s.out}
                          </p>
                        </div>
                      </Reveal>
                    );
                  })}
                </div>
                <p className="mt-6 font-mono text-[10px] text-ink-soft flex items-center justify-between">
                  <span>Each move emits verifiable geometry, not a narrative</span>
                  <span className="hidden sm:inline">WGS 84 · EPSG:4326</span>
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── Capabilities ─────────────────────────────────────────────────── */}
        <section id="capabilities" className="scroll-mt-24 border-t border-grid">
          <div className="max-w-6xl mx-auto px-6 py-20 sm:py-24">
            <Reveal>
              <div className="dossier-sheet dossier-cool torn-b p-5 sm:p-8">
                <div className="flex items-baseline gap-5">
                  <span className="text-xs text-ink shrink-0">
                    What holds up
                  </span>
                  <span className="flex-1 h-px bg-grid" />
                  <span className="font-mono text-[10px] text-ink-soft hidden sm:inline">Dossier ST-B · six exhibits</span>
                </div>

                <div className="mt-8 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
                  <h2 className="text-3xl sm:text-4xl font-display font-black tracking-tight text-ink max-w-2xl leading-tight">
                    Built to survive an expert&apos;s questions
                  </h2>
                  <span className="archival-stamp border-ink text-ink text-[10px] px-2.5 py-1 font-mono self-start lg:self-auto">
                    Review status: open
                  </span>
                </div>
                <p className="mt-5 text-base text-ink-soft leading-relaxed max-w-2xl">
                  Anyone can draw a box around a dark patch. The hard part is defending where the
                  coordinates came from, how certain the origin is, and why this ship rather than that one.
                </p>

                <div className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {CAPABILITIES.map((c, i) => {
                    const Icon = c.icon;
                    return (
                      <Reveal key={c.title} delay={Math.min((i % 3) * 90, 180)} rotate={i % 2 ? "0.3deg" : "-0.3deg"}>
                        <div className={`evidence-card ${TONES[i % TONES.length]} ${TILTS[i % TILTS.length]} corner-tick dossier-sheet ${SHEETS[i % SHEETS.length]} p-4 h-full`}>
                          <i aria-hidden="true" /><i aria-hidden="true" /><i aria-hidden="true" /><i aria-hidden="true" />
                          <div className="flex items-center justify-between">
                            <Icon size={20} strokeWidth={1.5} className="text-ink" />
                            <span className="font-mono text-[10px] text-ink-soft">EXH {String(i + 1).padStart(2, "0")}</span>
                          </div>
                          <h3 className="mt-4 text-[15px] font-semibold text-ink tracking-tight">
                            {c.title}
                          </h3>
                          <p className="mt-2.5 text-[13px] text-ink-soft leading-relaxed">{c.body}</p>
                          <p className="mt-4 pt-3 border-t border-grid text-[10px] font-mono text-ink-soft">
                            {c.tag}
                          </p>
                        </div>
                      </Reveal>
                    );
                  })}
                </div>

                {/* Secondary capabilities — supporting slips */}
                <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {ALSO.map((a, i) => {
                    const Icon = a.icon;
                    return (
                      <Reveal key={a.title} delay={Math.min(i * 80, 240)}>
                        <div className="evidence-card evidence-card--archival p-3.5 h-full flex gap-3">
                          <Icon size={16} strokeWidth={1.5} className="text-ink-soft shrink-0 mt-0.5" />
                          <div>
                            <h4 className="text-[13px] font-semibold text-ink-soft">{a.title}</h4>
                            <p className="mt-1 text-[12px] text-ink-soft leading-relaxed">{a.body}</p>
                          </div>
                        </div>
                      </Reveal>
                    );
                  })}
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── Model card ───────────────────────────────────────────────────── */}
        <section id="numbers" className="scroll-mt-24 border-t border-grid">
          <div className="max-w-6xl mx-auto px-6 py-20 sm:py-24">
            <div className="flex items-baseline gap-5 mb-10">
              <span className="text-xs text-ink shrink-0">
                The model, in the open
              </span>
              <span className="flex-1 h-px bg-grid" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              <Reveal className="lg:col-span-7">
                <h2 className="text-3xl sm:text-4xl font-display font-black tracking-tight text-ink max-w-2xl leading-tight">
                  Metrics read from the checkpoint,
                  <br />
                  <span className="text-ink-soft font-light">not the pitch deck.</span>
                </h2>
                <p className="mt-5 text-base text-ink-soft leading-relaxed max-w-2xl">
                  The detector&apos;s training record is served straight from the weights file. A recall
                  of 0.56 means it misses faint slicks — we would rather show that than hide it.
                </p>
                <div className="mt-8">
                  <ModelMetricsPanel />
                </div>
              </Reveal>
              <Reveal delay={140} rotate="0.35deg" className="lg:col-span-5">
                <aside className="evidence-card evidence-card--cool corner-tick p-4 lg:sticky lg:top-24">
                  <i aria-hidden="true" /><i aria-hidden="true" /><i aria-hidden="true" /><i aria-hidden="true" />
                  <p className="doc-label"><b>Reading note</b> Why recall matters</p>
                  <p className="mt-3 text-[13px] text-ink-soft leading-relaxed">
                    Precision keeps false alarms down; recall admits what the sensor still misses in
                    low-contrast seas. Both numbers ship with the weights, beside the backscatter
                    curve above.
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-3 font-mono text-[10px]">
                    <div className="border border-grid bg-paper/70 p-2 rounded-[1px]">
                      <span className="block text-ink-soft">Precision</span>
                      <b className="text-ink text-sm">77.6%</b>
                    </div>
                    <div className="border border-grid bg-paper/70 p-2 rounded-[1px]">
                      <span className="block text-ink-soft">Recall</span>
                      <b className="text-ink text-sm">55.8%</b>
                    </div>
                  </div>
                  <p className="mt-3 pt-3 border-t border-grid font-mono text-[10px] text-ink-soft">
                    Benchmark: CERISE-SAR-V2 · stride 32
                  </p>
                </aside>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ── Method & limits ──────────────────────────────────────────────── */}
        <section id="method" className="scroll-mt-24 border-t border-grid">
          <div className="max-w-6xl mx-auto px-6 py-20 sm:py-24">
            <Reveal>
              <div className="dossier-sheet torn-a tape p-5 sm:p-8">
                <span aria-hidden="true" className="tape-strip tc" />
                <div className="flex items-baseline gap-5">
                  <span className="text-xs text-ink-soft shrink-0">
                    Method &amp; limits
                  </span>
                  <span className="flex-1 h-px bg-grid" />
                  <span className="font-mono text-[10px] text-ink-soft hidden sm:inline">Filed with every export</span>
                </div>

                <div className="mt-8 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
                  <h2 className="text-3xl sm:text-4xl font-display font-black tracking-tight text-ink leading-tight">
                    What this is — and what it isn&apos;t
                  </h2>
                  <span className="archival-stamp border-hazard text-hazard text-[10px] px-2.5 py-1 font-mono self-start lg:self-auto">
                    Read before acting
                  </span>
                </div>

                <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="evidence-card p-5">
                    <p className="doc-label"><b>Exhibit L-01</b> Supported use</p>
                    <h3 className="mt-3 text-[11px] font-semibold text-ok">
                      It is
                    </h3>
                    <ul className="mt-4 space-y-4">
                      {[
                        "A screening and prioritisation tool that turns hours of manual cross-referencing into one pass.",
                        "Fully explainable: every score decomposes into factors, and every factor into a sentence.",
                        "Honest about provenance — the data source behind each number is shown on screen.",
                      ].map((t) => (
                        <li key={t} className="text-[14px] text-ink-soft leading-relaxed flex gap-3">
                          <span className="text-ok shrink-0 mt-0.5">—</span>
                          {t}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="evidence-card evidence-card--warm p-5">
                    <p className="doc-label"><b>Exhibit L-02</b> Boundary of proof</p>
                    <h3 className="mt-3 text-[11px] font-semibold text-risk-high">
                      It is not
                    </h3>
                    <ul className="mt-4 space-y-4">
                      {[
                        "Proof of responsibility. Confirmation needs oil fingerprinting and vessel inspection.",
                        "A confirmed measure of ecological damage — exposure is geometric screening.",
                        "Free of physical simplification: drift holds forcing constant and ignores bathymetry.",
                      ].map((t) => (
                        <li key={t} className="text-[14px] text-ink-soft leading-relaxed flex gap-3">
                          <span className="text-risk-high shrink-0 mt-0.5">—</span>
                          {t}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <p className="mt-6 pt-6 border-t border-grid text-[13px] text-ink-soft leading-relaxed max-w-2xl">
                  Every screen in the application carries the same caveat, and so does the exported
                  dossier. A forensic tool that overstates its certainty is worse than no tool at all.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── Final CTA ────────────────────────────────────────────────────── */}
        <section className="border-t border-grid">
          <div className="max-w-5xl mx-auto px-6 py-20 sm:py-24">
            <Reveal>
              <div className="dossier-sheet torn-bottom tape p-6 sm:p-12 text-center overflow-visible">
                <span aria-hidden="true" className="tape-strip tc" />
                <p className="doc-label justify-center"><b>Final sheet</b> Open a case</p>
                <h2 className="mt-4 text-3xl sm:text-4xl font-display font-black tracking-tight text-ink">
                  Bring a scene. Get a suspect.
                </h2>
                <p className="mt-5 text-base text-ink-soft leading-relaxed max-w-xl mx-auto">
                  Upload a Sentinel-1 GeoTIFF and watch the chain execute live — or open a solved case
                  and step through the reconstruction stage by stage.
                </p>
                <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
                  <Link
                    href="/investigate"
                    className="w-full sm:w-auto px-7 py-3.5 rounded-[2px] bg-ink hover:bg-ink-soft text-paper font-bold text-sm transition-colors flex items-center justify-center gap-2"
                  >
                    Upload a scene
                  </Link>
                  <Link
                    href="/dashboard"
                    className="w-full sm:w-auto px-7 py-3.5 rounded-[2px] border border-grid-strong bg-paper-alt hover:bg-paper-alt text-ink-soft hover:text-ink font-semibold text-sm transition-colors flex items-center justify-center gap-2"
                  >
                    Open a solved case
                  </Link>
                </div>
                <p className="mt-6 font-mono text-[10px] text-ink-soft">
                  Chain ST-4 · SAR plus drift plus AIS · Filed under MARPOL Annex I
                </p>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
