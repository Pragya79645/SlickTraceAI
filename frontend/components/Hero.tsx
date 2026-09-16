"use client";

/**
 * Hero — the landing statement for SlickTrace AI.
 *
 * Visual-only redesign: same copy, same links, same benchmark data and
 * count-up behavior. Adds a forensic dossier visualization (slick contour +
 * backtrack trace) and renders the four benchmarks as miniature evidence
 * sheets instead of editorial rows.
 */

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Reveal from "@/components/Reveal";

/**
 * AnimatedStatNumber — smoothly counts up from 0 to the target number
 * when scrolled into view using easeOutExpo.
 */
function AnimatedStatNumber({
  value,
  decimals = 0,
  suffix = "",
}: {
  value: number;
  decimals?: number;
  suffix?: string;
}) {
  const [displayVal, setDisplayVal] = useState("0");
  const ref = useRef<HTMLSpanElement>(null);
  const [hasStarted, setHasStarted] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setHasStarted(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!hasStarted) return;
    let startTimestamp: number | null = null;
    const duration = 1800;
    let rafId: number;

    const step = (now: number) => {
      if (!startTimestamp) startTimestamp = now;
      const elapsed = now - startTimestamp;
      const progress = Math.min(elapsed / duration, 1);
      const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      const current = ease * value;
      setDisplayVal(current.toFixed(decimals));

      if (progress < 1) {
        rafId = requestAnimationFrame(step);
      }
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [hasStarted, value, decimals]);

  return (
    <span ref={ref}>
      {displayVal}
      {suffix}
    </span>
  );
}

const STATS = [
  {
    value: 0.66,
    decimals: 2,
    suffix: "",
    tag: "Neural segmentation",
    title: "Mask mAP50 accuracy",
    description:
      "YOLOv8-seg neural instance segmentation precision benchmarked across diverse Sentinel-1 SAR scenes under varying sea states.",
    meta: "Checkpoint v8n-seg-maritime-09",
    sheet: "torn-c",
    tone: "evidence-card--cool",
    tilt: "tilt-slight-l",
    kind: "mask" as const,
  },
  {
    value: 500,
    decimals: 0,
    suffix: "",
    tag: "Lagrangian physics",
    title: "Particle ensemble",
    description:
      "Hydrodynamic Monte Carlo particles advected backwards 6 hours on real Open-Meteo current and ERA5 wind forcing to map origin bounds.",
    meta: "500 particles · 50/80/95% bands",
    sheet: "torn-d",
    tone: "",
    tilt: "tilt-slight-r",
    kind: "particles" as const,
  },
  {
    value: 4,
    decimals: 0,
    suffix: "-factor",
    tag: "Attribution engine",
    title: "Explainable matrix",
    description:
      "Multi-criteria scoring model evaluating distance, temporal intersection, AIS transponder gaps, and vessel speed anomalies.",
    meta: "Weights 35 / 20 / 30 / 15",
    sheet: "torn-c",
    tone: "evidence-card--archival",
    tilt: "tilt-slight-l",
    kind: "matrix" as const,
  },
  {
    value: 99,
    decimals: 0,
    suffix: "+",
    tag: "Ecological screening",
    title: "Protected Ramsar sites",
    description:
      "Official Indian MoEFCC wetland polygons intersected live to identify vulnerable coastal habitats in the slick's forward path.",
    meta: "99 polygons · live intersect",
    sheet: "torn-d",
    tone: "evidence-card--warm",
    tilt: "tilt-slight-r",
    kind: "ramsar" as const,
  },
];

function EvidenceFigure({ kind }: { kind: "mask" | "particles" | "matrix" | "ramsar" }) {
  if (kind === "mask") {
    return (
      <svg viewBox="0 0 260 130" className="w-full h-24" role="img" aria-label="Segmentation contour preview">
        <rect x="6" y="6" width="248" height="118" fill="rgba(19,33,43,0.05)" stroke="#9AA394" strokeWidth="1" strokeDasharray="4 4" />
        {Array.from({ length: 6 }).map((_, i) => (
          <line key={i} x1={20 + i * 40} y1="6" x2={20 + i * 40} y2="124" stroke="#51697A" strokeOpacity="0.14" strokeWidth="1" />
        ))}
        <path
          d="M70,62 C82,44 108,40 128,48 C150,57 168,52 180,66 C190,78 182,96 162,102 C140,109 112,104 94,94 C80,86 64,78 70,62 Z"
          fill="rgba(166,16,63,0.10)"
          stroke="#A6103F"
          strokeWidth="1.6"
        />
        <path
          className="trace-draw"
          d="M70,62 C82,44 108,40 128,48 C150,57 168,52 180,66"
          fill="none"
          stroke="#13212B"
          strokeWidth="1.2"
          strokeDasharray="4 3"
        />
        <circle cx="180" cy="66" r="3" fill="#A6103F" className="slick-pulse" />
        <text x="14" y="20" fontSize="7" fontFamily="monospace" fill="#51697A">CONF 0.82</text>
        <text x="196" y="118" fontSize="7" fontFamily="monospace" fill="#51697A">AREA 2.41 KM2</text>
      </svg>
    );
  }
  if (kind === "particles") {
    return (
      <svg viewBox="0 0 260 130" className="w-full h-24" role="img" aria-label="Particle trajectory preview">
        <rect x="6" y="6" width="248" height="118" fill="rgba(19,33,43,0.05)" stroke="#9AA394" strokeWidth="1" />
        <path d="M30,95 C90,88 140,70 200,40" fill="none" stroke="#51697A" strokeOpacity="0.3" strokeWidth="8" strokeLinecap="round" />
        <path className="trace-draw" d="M30,95 C90,88 140,70 200,40" fill="none" stroke="#13212B" strokeWidth="1.6" />
        <path className="trace-draw trace-draw--late" d="M34,102 C92,96 142,80 198,52" fill="none" stroke="#51697A" strokeWidth="1" strokeDasharray="4 3" />
        <path className="trace-draw trace-draw--later" d="M28,88 C88,80 138,62 202,32" fill="none" stroke="#51697A" strokeWidth="1" strokeDasharray="4 3" />
        <circle cx="200" cy="40" r="3.5" fill="#13212B" />
        <circle cx="200" cy="40" r="7" fill="none" stroke="#A6103F" strokeWidth="1.2" />
        <text x="14" y="20" fontSize="7" fontFamily="monospace" fill="#51697A">WIND 3% · DIFFUSION ON</text>
        <text x="150" y="118" fontSize="7" fontFamily="monospace" fill="#51697A">500 PARTICLES</text>
      </svg>
    );
  }
  if (kind === "matrix") {
    return (
      <div className="w-full" aria-label="Attribution factor preview">
        {[
          { label: "Proximity 35", w: "82%", hot: true },
          { label: "Trajectory 30", w: "68%", hot: false },
          { label: "Timing 20", w: "54%", hot: false },
          { label: "Behaviour 15", w: "41%", hot: false },
        ].map((r) => (
          <div key={r.label} className="flex items-center gap-2 py-[3px]">
            <span className="w-20 shrink-0 font-mono text-[8px] text-ink-soft">{r.label}</span>
            <span className="flex-1 h-[7px] border border-grid bg-paper relative overflow-hidden rounded-[1px]">
              <span
                className="absolute inset-y-0 left-0"
                style={{ width: r.w, background: r.hot ? "#A6103F" : "#13212B", opacity: r.hot ? 0.85 : 0.75 }}
              />
            </span>
          </div>
        ))}
        <p className="mt-1 font-mono text-[8px] text-ink-soft">Passed within 0.06 km of origin</p>
      </div>
    );
  }
  return (
    <svg viewBox="0 0 260 130" className="w-full h-24" role="img" aria-label="Coastal exposure preview">
      <rect x="6" y="6" width="248" height="118" fill="rgba(19,33,43,0.05)" stroke="#9AA394" strokeWidth="1" />
      <path d="M10,90 C60,78 90,92 140,80 C190,68 220,78 254,60 L254,124 L10,124 Z" fill="rgba(31,75,63,0.12)" stroke="#1F4B3F" strokeWidth="1" />
      <path className="trace-draw" d="M40,60 C90,66 140,70 200,78" fill="none" stroke="#A6103F" strokeWidth="1.4" strokeDasharray="5 3" />
      <circle cx="200" cy="78" r="3" fill="#A6103F" />
      <text x="14" y="20" fontSize="7" fontFamily="monospace" fill="#51697A">FORWARD +12H</text>
      <text x="150" y="40" fontSize="7" fontFamily="monospace" fill="#1F4B3F">RAMSAR T-04:12</text>
    </svg>
  );
}

function HeroVisualization() {
  return (
    <div className="dossier-sheet torn-a tape fold-corner hero-settle relative overflow-visible">
      <span aria-hidden="true" className="tape-strip tl" />
      <span aria-hidden="true" className="tape-strip tr" />
      <span aria-hidden="true" className="fold" />
      <div className="flex items-center justify-between px-[4%] py-2 border-b border-grid bg-paper-alt/70">
        <span className="doc-label">
          <b>Scene S1A-142</b> Sentinel-1 · VV band · 10 m GRD
        </span>
        <span className="font-mono text-[10px] text-hazard font-bold">Slick contrast −4.8 dB</span>
      </div>
      <div className="relative">
        <svg viewBox="0 0 520 340" className="w-full h-auto block" role="img" aria-label="Oil slick detection and backtrack visualization">
          <rect x="0" y="0" width="520" height="340" fill="rgba(19,33,43,0.06)" />
          {Array.from({ length: 9 }).map((_, i) => (
            <line key={`v${i}`} x1={40 + i * 55} y1="0" x2={40 + i * 55} y2="340" stroke="#51697A" strokeOpacity="0.10" strokeWidth="1" />
          ))}
          {Array.from({ length: 6 }).map((_, i) => (
            <line key={`h${i}`} x1="0" y1={40 + i * 50} x2="520" y2={40 + i * 50} stroke="#51697A" strokeOpacity="0.10" strokeWidth="1" />
          ))}
          <g fill="none" stroke="#51697A" strokeOpacity="0.22" strokeWidth="1">
            <path d="M-10,70 C90,55 180,85 290,68 C390,53 450,72 530,60" strokeDasharray="6 7" />
            <path d="M-10,250 C100,235 210,265 320,248 C410,234 460,252 530,242" />
          </g>
          {/* uncertainty corridor */}
          <path d="M120,220 C190,205 250,170 330,120 C360,100 390,85 420,70" fill="none" stroke="#51697A" strokeOpacity="0.28" strokeWidth="26" strokeLinecap="round" />
          {/* slick body */}
          <path
            d="M150,235 C170,200 215,188 255,196 C300,205 330,195 345,215 C358,233 340,258 305,266 C265,275 215,272 185,260 C165,252 143,252 150,235 Z"
            fill="rgba(166,16,63,0.10)"
            stroke="#A6103F"
            strokeWidth="1.8"
          />
          {/* backtrack trace */}
          <path
            className="trace-draw"
            d="M175,232 C220,210 270,175 330,120 C360,100 390,85 420,70"
            fill="none"
            stroke="#13212B"
            strokeWidth="2"
          />
          <path
            className="trace-draw trace-draw--late"
            d="M185,244 C228,224 276,190 332,132"
            fill="none"
            stroke="#51697A"
            strokeWidth="1.2"
            strokeDasharray="5 4"
          />
          <circle cx="420" cy="70" r="5" fill="#A6103F" className="slick-pulse" />
          <circle cx="420" cy="70" r="11" fill="none" stroke="#A6103F" strokeWidth="1.2" />
          <circle cx="175" cy="232" r="4" fill="#13212B" />
          <g fontFamily="monospace" fontSize="10" fill="#51697A">
            <text x="28" y="26">19.07N · 72.96E</text>
            <text x="398" y="326">T-06:00 ORIGIN</text>
            <text x="28" y="326">T+00:00 SCENE</text>
          </g>
          <g fontFamily="monospace" fontSize="10" fill="#13212B">
            <text x="348" y="52">DISCHARGE WINDOW</text>
          </g>
        </svg>
        {/* floating technical chips */}
        <div className="absolute left-5 top-10 sm:left-6 px-2 py-1 bg-paper border border-grid font-mono text-[9px] text-ink shadow-sm rounded-[1px]">
          SEGMENTED MASK <b>0.82</b>
        </div>
        <div className="absolute right-5 bottom-10 sm:right-6 px-2 py-1 bg-ink text-paper font-mono text-[9px] shadow-sm rounded-[1px]">
          ORIGIN BAND <b>95%</b>
        </div>
      </div>
      <div className="grid grid-cols-3 divide-x divide-grid border-t border-grid bg-paper-alt/70 font-mono text-[9px] text-ink-soft px-[4%] pb-4">
        <div className="px-3 py-2"><span className="block">Detect</span><b className="text-ink text-[10px]">Slick polygon</b></div>
        <div className="px-3 py-2"><span className="block">Trace back</span><b className="text-ink text-[10px]">−6 h hindcast</b></div>
        <div className="px-3 py-2"><span className="block">Attribute</span><b className="text-ink text-[10px]">Ranked suspect</b></div>
      </div>
    </div>
  );
}

export default function Hero() {
  return (
    <section className="relative isolate overflow-hidden bg-transparent">
      <div className="relative z-10 w-full max-w-6xl mx-auto px-6 pt-36 pb-16 sm:pt-44 sm:pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-start">
          <div className="lg:col-span-6 text-left">
            <div className="archival-stamp inline-block border-ink text-ink text-[11px] px-3 py-1 text-xs">
              Satellite · Drift physics · Vessel attribution
            </div>

            <h1 className="mt-6 text-4xl sm:text-5xl lg:text-[3.5rem] font-display font-bold tracking-tight text-ink leading-[1.08]">
              A dark patch on a radar scene.
              <br />
              <span className="text-ink-soft">
                Six hours back, a name and an MMSI.
              </span>
            </h1>

            <p className="mt-6 text-base sm:text-lg text-ink-soft leading-relaxed max-w-xl">
              Illegal discharges happen where nobody is watching — but the ocean keeps the receipt.
              SlickTrace AI segments the slick from satellite imagery, runs the drift backwards to
              find where the oil entered the water, and correlates AIS traffic to rank which vessel
              was there, showing the evidence behind every point it awards.
            </p>

            <div className="mt-9 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 max-w-xl">
              <Link
                href="/investigate"
                className="w-full sm:w-auto px-7 py-3.5 rounded-[2px] bg-ink hover:bg-ink-soft text-paper font-bold text-sm transition-colors text-center"
              >
                Start an investigation
              </Link>

              <Link
                href="/dashboard"
                className="w-full sm:w-auto px-7 py-3.5 rounded-[2px] border border-grid-strong bg-paper hover:bg-paper-alt text-ink font-semibold text-sm transition-colors text-center"
              >
                See a solved case
              </Link>
            </div>

            <p className="mt-4 text-[11px] text-ink-soft">
              Analytical ranking to prioritise investigation — not proof of responsibility.
            </p>

            <div className="mt-8 flex items-center gap-3 max-w-xl">
              <span className="hazard-tick" aria-hidden="true" />
              <p className="font-mono text-[10px] text-ink-soft">
                Live chain: SAR scene <span className="text-grid-strong">·</span> drift hindcast <span className="text-grid-strong">·</span> AIS corridor
              </p>
            </div>
          </div>

          <div className="lg:col-span-6">
            <HeroVisualization />
            <p className="mt-3 font-mono text-[10px] text-ink-soft flex items-center justify-between">
              <span>FIG. 01 — BACKTRACK SCHEMATIC, NOT LIVE DATA</span>
              <span>DATUM WGS 84</span>
            </p>
          </div>
        </div>

        {/* ── Operational Benchmarks — forensic evidence sheets ─────────────── */}
        <div className="mt-24 sm:mt-28">
          <div className="flex items-center gap-4 mb-6">
            <span className="text-xs text-ink-soft">
              Benchmarks
            </span>
            <div className="flex-1 h-px bg-grid" />
            <div className="flex items-center gap-3 text-[10px] font-mono text-ink-soft">
              <span>SYS VER 2.1</span>
              <span className="w-px h-3 bg-grid-strong" aria-hidden="true" />
              <span>SAR plus AIS</span>
            </div>
          </div>

          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-display font-bold tracking-tight text-ink leading-tight max-w-xl">
            Operational benchmarks
            <br />
            <span className="text-ink-soft font-normal">backed by physics.</span>
          </h2>

          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
            {STATS.map((s, i) => (
              <Reveal key={s.title} delay={Math.min(i * 90, 270)} rotate={i % 2 ? "0.4deg" : "-0.4deg"}>
                <article className={`dossier-sheet ${s.sheet} ${s.tone} ${s.tilt} evidence-card corner-tick p-4 h-full flex flex-col`}>
                  <i aria-hidden="true" /><i aria-hidden="true" /><i aria-hidden="true" /><i aria-hidden="true" />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-ink-soft">{s.tag}</span>
                    <span className="font-mono text-[10px] text-ink-soft">EXH 0{i + 1}</span>
                  </div>
                  <p
                    className="mt-2 font-mono font-bold text-ink leading-none tracking-tight text-[2rem]"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    <AnimatedStatNumber value={s.value} decimals={s.decimals} suffix={s.suffix} />
                  </p>
                  <p className="mt-1 text-[15px] font-semibold text-ink tracking-tight">{s.title}</p>
                  <div className="mt-3 border border-grid bg-paper/70 p-2 rounded-[1px]">
                    <EvidenceFigure kind={s.kind} />
                  </div>
                  <p className="mt-3 text-[13px] text-ink-soft leading-relaxed flex-1">{s.description}</p>
                  <p className="mt-4 pt-3 border-t border-grid text-[10px] font-mono text-ink-soft">
                    {s.meta}
                  </p>
                </article>
              </Reveal>
            ))}
          </div>
          <p className="mt-4 font-mono text-[10px] text-ink-soft">
            Figures are schematic previews of real pipeline outputs. Values served from the model checkpoint.
          </p>
        </div>
      </div>
    </section>
  );
}
