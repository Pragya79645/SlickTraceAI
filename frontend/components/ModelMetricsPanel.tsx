"use client";

/**
 * ModelMetricsPanel — the segmentation model's own training record.
 *
 * Every number here is read from the checkpoint file by the backend
 * (GET /api/investigations/model/metrics); nothing is typed in by hand.
 */

import { useEffect, useState } from "react";
import { CircuitBoard } from "lucide-react";
import { fetchModelMetrics, type ModelMetrics } from "@/lib/api";

const pct = (v?: number | null) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-center">
      <span className="text-[10px] text-slate-500 uppercase tracking-wider block">{label}</span>
      <span className={`text-lg font-black font-mono ${tone}`}>{value}</span>
    </div>
  );
}

/** Tiny inline SVG sparkline of mask mAP50 across epochs. */
function Sparkline({ rows }: { rows: ModelMetrics["history"] }) {
  const pts = rows.map((r) => r.mask_map50 ?? 0);
  if (pts.length < 2) return null;
  const W = 220, H = 44, max = Math.max(...pts, 0.01);
  const path = pts
    .map((v, i) => `${i === 0 ? "M" : "L"}${((i / (pts.length - 1)) * W).toFixed(1)},${(H - (v / max) * (H - 4) - 2).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={W} height={H} className="block" aria-label="mask mAP50 per epoch">
      <path d={path} fill="none" stroke="#34d399" strokeWidth={1.8} />
      <circle cx={W} cy={H - (pts[pts.length - 1] / max) * (H - 4) - 2} r={2.5} fill="#34d399" />
    </svg>
  );
}

export default function ModelMetricsPanel({ compact = false }: { compact?: boolean }) {
  const [metrics, setMetrics] = useState<ModelMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(!compact);

  useEffect(() => {
    let cancelled = false;
    fetchModelMetrics()
      .then((m) => { if (!cancelled) setMetrics(m); })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : "unavailable"); });
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return <div className="text-[11px] font-mono text-slate-600">Model card unavailable ({error})</div>;
  }
  if (!metrics) {
    return <div className="text-[11px] font-mono text-slate-600">Reading model checkpoint…</div>;
  }

  const trained = metrics.trained_at ? metrics.trained_at.slice(0, 10) : "—";

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3.5 py-2.5 cursor-pointer hover:bg-slate-800/50 rounded-xl"
      >
        <span className="font-mono font-bold text-slate-200 flex items-center gap-2">
          <CircuitBoard size={13} strokeWidth={1.75} className="text-accent" />
          MODEL CARD · {metrics.architecture.toUpperCase()}
          <span className="text-slate-500 font-normal">· mask mAP50 {pct(metrics.mask_map50)} · P {pct(metrics.mask_precision)} · R {pct(metrics.mask_recall)}</span>
        </span>
        <span className="text-slate-500">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="px-3.5 pb-3.5 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat label="Mask mAP50" value={pct(metrics.mask_map50)} tone="text-emerald-400" />
            <Stat label="Mask Precision" value={pct(metrics.mask_precision)} tone="text-sky-300" />
            <Stat label="Mask Recall" value={pct(metrics.mask_recall)} tone="text-amber-300" />
            <Stat label="Mask mAP50-95" value={pct(metrics.mask_map50_95)} tone="text-slate-200" />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
            <div className="font-mono text-[11px] text-slate-400 space-y-0.5">
              <div><span className="text-slate-500">weights</span> {metrics.model_file}</div>
              <div><span className="text-slate-500">training</span> {metrics.epochs} epochs · {metrics.image_size} px · batch {metrics.batch_size} · {metrics.optimizer} · {metrics.pretrained ? "COCO-pretrained" : "from scratch"}</div>
              <div><span className="text-slate-500">trained</span> {trained} · ultralytics {metrics.ultralytics_version}</div>
              <div><span className="text-slate-500">box</span> P {pct(metrics.box_precision)} · R {pct(metrics.box_recall)} · mAP50 {pct(metrics.box_map50)}</div>
            </div>
            <div className="sm:ml-auto">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider block mb-0.5">mask mAP50 by epoch</span>
              <Sparkline rows={metrics.history} />
            </div>
          </div>

          <ul className="text-[11px] text-slate-500 space-y-0.5 list-disc pl-4">
            {metrics.caveats.map((c) => <li key={c}>{c}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
