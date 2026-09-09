"use client";

/**
 * Hero — the landing statement for SlickTrace AI.
 *
 * Frames the platform as the transformation it performs: an anonymous dark patch on a
 * radar scene becomes a named vessel with the evidence behind the accusation. The animated
 * GhostFibers field sits behind a contrast scrim so the copy stays readable at every size.
 */

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import SpecularButton from "@/components/SpecularButton";


// WebGL background: client-only, and never blocks first paint.
const GhostFibers = dynamic(() => import("@/components/GhostFibers"), { ssr: false });

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
    tag: "Neural Segmentation",
    title: "Mask mAP50 Accuracy",
    description:
      "YOLOv8-seg neural instance segmentation precision benchmarked across diverse Sentinel-1 SAR scenes under varying sea states.",
    accent: "text-accent",
    indicator: "bg-accent",
  },
  {
    value: 500,
    decimals: 0,
    suffix: "",
    tag: "Lagrangian Physics",
    title: "Particle Ensemble",
    description:
      "Hydrodynamic Monte Carlo particles advected backwards 6 hours on real Open-Meteo current and ERA5 wind forcing to map origin bounds.",
    accent: "text-accent",
    indicator: "bg-accent/70",
  },
  {
    value: 4,
    decimals: 0,
    suffix: "-Factor",
    tag: "Attribution Engine",
    title: "Explainable Matrix",
    description:
      "Multi-criteria scoring model evaluating distance, temporal intersection, AIS transponder gaps, and vessel speed anomalies.",
    accent: "text-accent",
    indicator: "bg-accent/50",
  },
  {
    value: 99,
    decimals: 0,
    suffix: "+",
    tag: "Ecological Screening",
    title: "Protected Ramsar Sites",
    description:
      "Official Indian MoEFCC wetland polygons intersected live to identify vulnerable coastal habitats in the slick's forward path.",
    accent: "text-accent",
    indicator: "bg-accent/30",
  },
];

export default function Hero() {
  return (
    <section className="relative isolate overflow-hidden">
      {/* ── Animated fiber field ─────────────────────────────────────────────── */}
      <div className="absolute inset-0 z-0" aria-hidden="true">
        <GhostFibers
          lineColor="#140E35"
          glowColor="#3437A0"
          speed={0.2}
          scale={2}
          rotation={0}
          rotationSpeed={0.25}
          layers={4}
          waveAmplitude={0.015}
          waveFrequency={3}
          waveSpeed={0.15}
          layerSpeed={0.08}
          twist={0.1}
          twistFrequency={5}
          twistSpeed={1.2}
          lineFrequency={5}
          lineSpacing={2}
          lineSharpness={16}
          glowFalloff={10}
          glowIntensity={1.6}
          brightness={2}
          blueBoost={1.25}
          vignette={0.8}
          grain={0.05}
          dpr={1}
        />
      </div>

      {/* ── Contrast scrim: keeps copy legible over the moving field ─────────── */}
      <div
        className="absolute inset-0 z-[1] bg-[radial-gradient(ellipse_70%_60%_at_50%_42%,rgba(2,6,23,0.30)_0%,rgba(2,6,23,0.76)_55%,rgba(2,6,23,0.94)_100%)]"
        aria-hidden="true"
      />
      <div
        className="absolute inset-x-0 bottom-0 z-[1] h-56 bg-gradient-to-b from-transparent to-slate-950"
        aria-hidden="true"
      />

      {/* ── Content ──────────────────────────────────────────────────────────── */}
      <div className="relative z-10 w-full max-w-6xl mx-auto px-6 pt-36 pb-20 sm:pt-44 sm:pb-28">
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 backdrop-blur-sm text-amber-300 text-[11px] font-semibold uppercase tracking-[0.14em]">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            Satellite → Drift Physics → Vessel Attribution
          </div>

          <h1 className="mt-6 text-4xl sm:text-5xl lg:text-[3.75rem] font-black tracking-tight text-white leading-[1.08]">
            A dark patch on a radar scene.
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-amber-400 to-orange-300">
              Six hours back, a name and an MMSI.
            </span>
          </h1>

          <p className="mt-6 text-base sm:text-lg text-slate-300/90 leading-relaxed max-w-2xl mx-auto">
            Illegal discharges happen where nobody is watching — but the ocean keeps the receipt.
            SlickTrace AI segments the slick from satellite imagery, runs the drift backwards to
            find where the oil entered the water, and correlates AIS traffic to rank which vessel
            was there, showing the evidence behind every point it awards.
          </p>

          <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3.5">
            <SpecularButton
              size="lg"
              radius={18}
              tint="#ffffff"
              tintOpacity={0}
              blur={0}
              textColor="#f5f5f5"
              lineColor="#ffffff"
              baseColor="#525252"
              intensity={1}
              shineSize={10}
              shineFade={40}
              thickness={1}
              speed={0.35}
              followMouse
              proximity={250}
              autoAnimate={false}
              href="/investigate"
              className="font-bold text-sm tracking-wide shadow-xl shadow-amber-500/10"
            >
              <span>START AN INVESTIGATION</span>
              <span aria-hidden="true">→</span>
            </SpecularButton>

            <SpecularButton
              size="lg"
              radius={18}
              tint="#0f172a"
              tintOpacity={0.4}
              blur={8}
              textColor="#cbd5e1"
              lineColor="#94a3b8"
              baseColor="#334155"
              intensity={0.65}
              shineSize={10}
              shineFade={40}
              thickness={1}
              speed={0.35}
              followMouse
              proximity={250}
              autoAnimate={false}
              href="/dashboard"
              className="font-semibold text-sm tracking-wide hover:text-white transition-colors"
            >
              <span>SEE A SOLVED CASE</span>
              <span className="text-slate-400" aria-hidden="true">→</span>
            </SpecularButton>
          </div>

          <p className="mt-4 text-[11px] font-mono text-slate-500">
            Analytical ranking to prioritise investigation — not proof of responsibility.
          </p>
        </div>

        {/* ── Operational Benchmarks — Editorial Data Layout ───────────────────── */}
        <div className="mt-28 sm:mt-36">

          {/* Section eyebrow */}
          <div className="flex items-center gap-4 mb-10">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-400/80 font-mono">
              Benchmarks
            </span>
            <div className="flex-1 h-px bg-slate-800" />
            <span className="text-[10px] font-mono text-slate-600 tracking-widest">
              SYS_VER 2.1 · SAR + AIS
            </span>
          </div>

          {/* Editorial heading — left-aligned, big, confident */}
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-white leading-tight max-w-lg font-display">
            Operational benchmarks
            <br />
            <span className="text-slate-500 font-light">backed by physics.</span>
          </h2>

          {/* Stat rows — each one separated by a swept divider */}
          <div className="mt-14 sm:mt-16 space-y-0">
            {STATS.map((s, i) => (
              <div key={s.title}>
                {/* Full-width divider with animated sweep */}
                <div className="relative w-full h-px bg-slate-800/70 overflow-hidden">
                  <div
                    className="absolute inset-y-0 w-1/4 bg-gradient-to-r from-transparent via-amber-400/60 to-transparent animate-radar-sweep"
                    style={{ animationDelay: `${i * 1.1}s` }}
                  />
                </div>

                {/* Stat row: large number LEFT · label + description RIGHT */}
                <div className="py-8 sm:py-10 flex flex-col sm:flex-row sm:items-start gap-6 sm:gap-0">
                  {/* Left: Giant number */}
                  <div className="sm:w-48 shrink-0 flex items-baseline gap-1">
                    <span className="text-[2.75rem] sm:text-[3.25rem] font-black font-mono leading-none tracking-tighter text-white"
                      style={{ fontVariantNumeric: 'tabular-nums' }}>
                      <AnimatedStatNumber value={s.value} decimals={s.decimals} suffix={s.suffix} />
                    </span>
                  </div>

                  {/* Right: Label stack */}
                  <div className="sm:pl-12 sm:border-l sm:border-slate-800 flex flex-col justify-center gap-2 max-w-xl">
                    <div className="flex items-center gap-2.5">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.indicator}`} />
                      <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-slate-500">
                        {s.tag}
                      </span>
                    </div>
                    <p className="text-lg sm:text-xl font-semibold text-slate-200 leading-snug tracking-tight">
                      {s.title}
                    </p>
                    <p className="text-sm sm:text-[15px] text-slate-500 leading-relaxed font-normal">
                      {s.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}

            {/* Final closing divider */}
            <div className="relative w-full h-px bg-slate-800/70 overflow-hidden">
              <div className="absolute inset-y-0 w-1/4 bg-gradient-to-r from-transparent via-slate-600/40 to-transparent animate-radar-sweep"
                style={{ animationDelay: '4.4s' }} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
