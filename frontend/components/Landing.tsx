/**
 * Landing — the public homepage.
 *
 * Its job is comprehension, not interaction: by the bottom of this page a visitor should
 * know what the platform detects, how it reasons, what it can prove, and what it cannot.
 * The upload flow lives on its own route (/investigate) so it never interrupts that story.
 *
 * Layout is editorial rather than card-based — hairline rules and whitespace do the
 * separating, so the page reads as a document instead of a wall of boxes.
 */

import Link from "next/link";
import {
  ArrowRight,
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

export default function Landing() {
  return (
    <div className="min-h-screen bg-ink-950 text-fg font-sans selection:bg-accent/30">
      <SiteNav />

      <main>
        <Hero />

        {/* ── The problem ──────────────────────────────────────────────────── */}
        <section className="border-t border-line">
          <div className="max-w-5xl mx-auto px-6 py-24 sm:py-32">
            <span className="text-[10px] font-mono font-semibold uppercase tracking-[0.2em] text-fg-dim">
              The problem
            </span>
            <p className="mt-8 text-2xl sm:text-3xl lg:text-[2.5rem] text-fg leading-[1.3] font-display font-bold tracking-tight max-w-3xl">
              Most marine oil pollution isn&apos;t a tanker disaster. It is routine, deliberate
              discharge — released at night, far offshore, where nobody is looking.
            </p>
            <p className="mt-7 text-base sm:text-lg text-fg-muted leading-relaxed max-w-2xl">
              Satellites see the slick hours later. By then the ship has moved on, and the missing
              link between the oil and its source is exactly what lets it go unpunished. SlickTrace
              closes that gap with drift physics and public vessel telemetry.
            </p>
          </div>
        </section>

        {/* ── How it works ─────────────────────────────────────────────────── */}
        <section id="how-it-works" className="scroll-mt-24 border-t border-line bg-ink-900/40">
          <div className="max-w-6xl mx-auto px-6 py-24 sm:py-28">
            <div className="flex items-baseline gap-5 mb-14">
              <span className="text-[10px] font-mono font-semibold uppercase tracking-[0.2em] text-accent shrink-0">
                How it works
              </span>
              <span className="flex-1 h-px bg-line" />
            </div>

            <h2 className="text-3xl sm:text-4xl font-display font-black tracking-tight text-fg max-w-xl leading-tight">
              One scene in.
              <br />
              <span className="text-fg-dim font-light">A named suspect out.</span>
            </h2>

            {/* Four steps as a rail, divided by hairlines rather than boxed */}
            <div className="mt-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              {PIPELINE.map((s, i) => {
                const Icon = s.icon;
                return (
                  <div
                    key={s.step}
                    className={`py-6 lg:py-0 lg:px-7 border-t sm:border-t-0 border-line ${
                      i === 0 ? "lg:pl-0" : "lg:border-l lg:border-line"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon size={18} strokeWidth={1.5} className="text-accent shrink-0" />
                      <span className="font-mono text-[11px] text-fg-dim tabular-nums">{s.step}</span>
                    </div>
                    <h3 className="mt-4 text-lg font-semibold text-fg tracking-tight">{s.title}</h3>
                    <p className="mt-2.5 text-[13px] text-fg-muted leading-relaxed">{s.body}</p>
                    <p className="mt-4 text-[11px] font-mono text-fg-dim flex items-center gap-1.5">
                      <ArrowRight size={11} strokeWidth={2} />
                      {s.out}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── Capabilities ─────────────────────────────────────────────────── */}
        <section id="capabilities" className="scroll-mt-24 border-t border-line">
          <div className="max-w-6xl mx-auto px-6 py-24 sm:py-28">
            <div className="flex items-baseline gap-5 mb-14">
              <span className="text-[10px] font-mono font-semibold uppercase tracking-[0.2em] text-accent shrink-0">
                What holds up
              </span>
              <span className="flex-1 h-px bg-line" />
            </div>

            <h2 className="text-3xl sm:text-4xl font-display font-black tracking-tight text-fg max-w-2xl leading-tight">
              Built to survive an expert&apos;s questions
            </h2>
            <p className="mt-5 text-base text-fg-muted leading-relaxed max-w-2xl">
              Anyone can draw a box around a dark patch. The hard part is defending where the
              coordinates came from, how certain the origin is, and why this ship rather than that one.
            </p>

            <div className="mt-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-12">
              {CAPABILITIES.map((c) => {
                const Icon = c.icon;
                return (
                  <div key={c.title}>
                    <Icon size={20} strokeWidth={1.5} className="text-accent" />
                    <h3 className="mt-4 text-[15px] font-semibold text-fg tracking-tight">
                      {c.title}
                    </h3>
                    <p className="mt-2.5 text-[13px] text-fg-muted leading-relaxed">{c.body}</p>
                    <p className="mt-4 pt-3 border-t border-line text-[10px] font-mono text-fg-dim">
                      {c.tag}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Secondary capabilities — one compact row, no boxes */}
            <div className="mt-20 pt-10 border-t border-line grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-10 gap-y-8">
              {ALSO.map((a) => {
                const Icon = a.icon;
                return (
                  <div key={a.title} className="flex gap-3">
                    <Icon size={16} strokeWidth={1.5} className="text-fg-dim shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-[13px] font-semibold text-fg-muted">{a.title}</h4>
                      <p className="mt-1 text-[12px] text-fg-dim leading-relaxed">{a.body}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── Model card ───────────────────────────────────────────────────── */}
        <section id="numbers" className="scroll-mt-24 border-t border-line bg-ink-900/40">
          <div className="max-w-4xl mx-auto px-6 py-24 sm:py-28">
            <div className="flex items-baseline gap-5 mb-14">
              <span className="text-[10px] font-mono font-semibold uppercase tracking-[0.2em] text-accent shrink-0">
                The model, in the open
              </span>
              <span className="flex-1 h-px bg-line" />
            </div>

            <h2 className="text-3xl sm:text-4xl font-display font-black tracking-tight text-fg max-w-2xl leading-tight">
              Metrics read from the checkpoint,
              <br />
              <span className="text-fg-dim font-light">not the pitch deck.</span>
            </h2>
            <p className="mt-5 text-base text-fg-muted leading-relaxed max-w-2xl">
              The detector&apos;s training record is served straight from the weights file. A recall
              of 0.56 means it misses faint slicks — we would rather show that than hide it.
            </p>

            <div className="mt-12">
              <ModelMetricsPanel />
            </div>
          </div>
        </section>

        {/* ── Method & limits ──────────────────────────────────────────────── */}
        <section id="method" className="scroll-mt-24 border-t border-line">
          <div className="max-w-5xl mx-auto px-6 py-24 sm:py-28">
            <div className="flex items-baseline gap-5 mb-14">
              <span className="text-[10px] font-mono font-semibold uppercase tracking-[0.2em] text-fg-dim shrink-0">
                Method &amp; limits
              </span>
              <span className="flex-1 h-px bg-line" />
            </div>

            <h2 className="text-3xl sm:text-4xl font-display font-black tracking-tight text-fg leading-tight">
              What this is — and what it isn&apos;t
            </h2>

            <div className="mt-14 grid grid-cols-1 md:grid-cols-2 gap-x-14 gap-y-10">
              <div>
                <h3 className="text-[11px] font-mono font-semibold uppercase tracking-[0.16em] text-ok">
                  It is
                </h3>
                <ul className="mt-5 space-y-4">
                  {[
                    "A screening and prioritisation tool that turns hours of manual cross-referencing into one pass.",
                    "Fully explainable: every score decomposes into factors, and every factor into a sentence.",
                    "Honest about provenance — the data source behind each number is shown on screen.",
                  ].map((t) => (
                    <li key={t} className="text-[14px] text-fg-muted leading-relaxed flex gap-3">
                      <span className="text-ok shrink-0 mt-0.5">—</span>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="md:border-l md:border-line md:pl-14">
                <h3 className="text-[11px] font-mono font-semibold uppercase tracking-[0.16em] text-risk-high">
                  It is not
                </h3>
                <ul className="mt-5 space-y-4">
                  {[
                    "Proof of responsibility. Confirmation needs oil fingerprinting and vessel inspection.",
                    "A confirmed measure of ecological damage — exposure is geometric screening.",
                    "Free of physical simplification: drift holds forcing constant and ignores bathymetry.",
                  ].map((t) => (
                    <li key={t} className="text-[14px] text-fg-muted leading-relaxed flex gap-3">
                      <span className="text-risk-high shrink-0 mt-0.5">—</span>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <p className="mt-14 pt-8 border-t border-line text-[13px] text-fg-dim leading-relaxed max-w-2xl">
              Every screen in the application carries the same caveat, and so does the exported
              dossier. A forensic tool that overstates its certainty is worse than no tool at all.
            </p>
          </div>
        </section>

        {/* ── Final CTA ────────────────────────────────────────────────────── */}
        <section className="border-t border-line bg-ink-900/40">
          <div className="max-w-3xl mx-auto px-6 py-24 sm:py-28 text-center">
            <h2 className="text-3xl sm:text-4xl font-display font-black tracking-tight text-fg">
              Bring a scene. Get a suspect.
            </h2>
            <p className="mt-5 text-base text-fg-muted leading-relaxed">
              Upload a Sentinel-1 GeoTIFF and watch the chain execute live — or open a solved case
              and step through the reconstruction stage by stage.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href="/investigate"
                className="w-full sm:w-auto px-7 py-3.5 rounded-lg bg-accent hover:bg-accent-hover text-ink-950 font-bold text-sm tracking-wide transition-colors flex items-center justify-center gap-2"
              >
                Upload a scene
                <ArrowRight size={15} strokeWidth={2.25} />
              </Link>
              <Link
                href="/dashboard"
                className="w-full sm:w-auto px-7 py-3.5 rounded-lg border border-line-strong bg-ink-850 hover:bg-ink-800 text-fg-muted hover:text-fg font-semibold text-sm tracking-wide transition-colors flex items-center justify-center gap-2"
              >
                Open a solved case
                <ArrowRight size={15} strokeWidth={2.25} />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
