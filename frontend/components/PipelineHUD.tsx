"use client";

/**
 * PipelineHUD — live execution telemetry.
 *
 * Every line here is a real milestone streamed from the backend as it happens, timed
 * server-side, carrying values read back off the stage that produced it. Nothing is
 * scripted: on a full Sentinel-1 scene the tiled inference genuinely takes seconds, and
 * the log shows it advancing tile by tile.
 *
 * Its job during a demo is to make the work visible — a judge watching this can see the
 * raster being parsed, the model running, the ocean data arriving and the suspect landing.
 */

import { useEffect, useRef } from "react";
import { Check } from "lucide-react";
import type { PipelineStageEvent } from "@/lib/api";

const LEVEL_STYLE: Record<string, { dot: string; text: string; label: string }> = {
  info: { dot: "bg-slate-600", text: "text-slate-300", label: "text-slate-400" },
  warn: { dot: "bg-amber-400", text: "text-amber-200", label: "text-amber-300" },
  error: { dot: "bg-red-500", text: "text-red-200", label: "text-red-300" },
  success: { dot: "bg-emerald-400", text: "text-emerald-200", label: "text-emerald-300" },
};

function stamp(ms: number): string {
  const total = ms / 1000;
  const mm = Math.floor(total / 60);
  const ss = total - mm * 60;
  return `${String(mm).padStart(2, "0")}:${ss.toFixed(2).padStart(5, "0")}`;
}

export interface PipelineHUDProps {
  events: PipelineStageEvent[];
  running: boolean;
  /** Shown as a headline once the run finishes. */
  summary?: string | null;
  error?: string | null;
  className?: string;
}

export default function PipelineHUD({
  events,
  running,
  summary,
  error,
  className = "",
}: PipelineHUDProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Follow the tail as new lines stream in.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events.length, summary, error]);

  const elapsed = events.length ? events[events.length - 1].elapsed_ms : 0;

  return (
    <div
      className={`rounded-xl border border-slate-800 bg-[#080a0f] overflow-hidden ${className}`}
      role="log"
      aria-live="polite"
      aria-label="Pipeline execution telemetry"
    >
      {/* Title bar */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-slate-800 bg-slate-950">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              error ? "bg-red-500" : running ? "bg-amber-400 animate-pulse" : "bg-emerald-400"
            }`}
          />
          <span className="text-[11px] font-mono font-semibold text-slate-300 tracking-wide truncate">
            {error
              ? "PIPELINE HALTED"
              : running
              ? "PIPELINE EXECUTING"
              : "PIPELINE COMPLETE"}
          </span>
        </div>
        <span className="text-[11px] font-mono text-slate-500 tabular-nums shrink-0">
          {events.length} stages · {(elapsed / 1000).toFixed(2)}s
        </span>
      </div>

      {/* Log body */}
      <div
        ref={scrollRef}
        className="max-h-[340px] overflow-y-auto px-4 py-3 font-mono text-[11.5px] leading-[1.75] scroll-smooth"
      >
        {events.length === 0 && !error && (
          <p className="text-slate-600">
            {running ? "awaiting first milestone…" : "no telemetry yet"}
          </p>
        )}

        {events.map((e, i) => {
          const style = LEVEL_STYLE[e.level ?? "info"] ?? LEVEL_STYLE.info;
          const isLast = i === events.length - 1;
          return (
            <div key={`${e.key}-${i}`} className="flex gap-2.5 items-baseline">
              <span className="text-slate-600 tabular-nums shrink-0">[{stamp(e.elapsed_ms)}]</span>
              <span className={`shrink-0 w-[9.5rem] hidden sm:inline ${style.label}`}>
                {e.label}
              </span>
              <span className="min-w-0 flex-1">
                <span className={style.text}>{e.message}</span>
                {typeof e.progress === "number" && e.progress < 1 && (
                  <span className="ml-2 text-slate-600">
                    {"█".repeat(Math.round(e.progress * 12)).padEnd(12, "░")}
                  </span>
                )}
                {e.detail && (
                  <span className="block text-slate-600 pl-0 sm:pl-0">└─ {e.detail}</span>
                )}
                {isLast && running && (
                  <span className="inline-block w-[7px] h-[13px] ml-1 align-middle bg-amber-400 animate-pulse" />
                )}
              </span>
            </div>
          );
        })}

        {error && (
          <div className="mt-2 flex gap-2.5 items-baseline text-red-300">
            <span className="text-red-500 shrink-0">[fail]</span>
            <span className="break-words">{error}</span>
          </div>
        )}
      </div>

      {/* Result strip */}
      {summary && !error && (
        <div className="px-4 py-2.5 border-t border-line bg-ok/10 text-[11.5px] font-mono text-ok flex items-center gap-2">
          <Check size={13} strokeWidth={2.25} className="shrink-0" />
          <span className="min-w-0 truncate">{summary}</span>
        </div>
      )}
    </div>
  );
}
