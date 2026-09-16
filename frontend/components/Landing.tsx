/**
 * Landing — the public homepage.
 *
 * Visual-only redesign: identical copy, links, sections and data. Adds
 * dossier containment, translucent evidence cards and a sparser drafting
 * background so the page reads as one intelligence casefile.
 */

import Link from "next/link";
import Hero from "@/components/Hero";
import ModelMetricsPanel from "@/components/ModelMetricsPanel";
import Reveal from "@/components/Reveal";
import SiteFooter from "@/components/SiteFooter";
import SiteNav from "@/components/SiteNav";
import PipelineTimeline from "@/components/PipelineTimeline";
import CapabilitiesBento from "@/components/CapabilitiesBento";
import MethodLimits from "@/components/MethodLimits";

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
              <aside className="border border-grid/70 bg-paper-alt/30 backdrop-blur-xs p-5 rounded-xs">
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
        <section id="how-it-works" className="scroll-mt-24 border-t border-grid bg-paper">
          <div className="max-w-6xl mx-auto px-6 py-20 sm:py-24">
            <Reveal>
              <PipelineTimeline />
            </Reveal>
          </div>
        </section>

        {/* ── Capabilities ─────────────────────────────────────────────────── */}
        <section id="capabilities" className="scroll-mt-24 border-t border-grid bg-paper">
          <div className="max-w-6xl mx-auto px-6 py-20 sm:py-24">
            <Reveal>
              <CapabilitiesBento />
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
        <section id="method" className="scroll-mt-24 border-t border-grid bg-paper">
          <div className="max-w-6xl mx-auto px-6 py-20 sm:py-24">
            <Reveal>
              <MethodLimits />
            </Reveal>
          </div>
        </section>

        {/* ── Final CTA ────────────────────────────────────────────────────── */}
        <section className="border-t border-grid">
          <div className="max-w-5xl mx-auto px-6 py-20 sm:py-24">
            <Reveal>
              <div className="max-w-3xl mx-auto text-center">
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
