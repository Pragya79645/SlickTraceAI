"use client";

import { useState } from "react";
import type { InvestigationResponse } from "@/lib/api";
import { exportForensicDossier } from "@/lib/dossier";

export default function DossierButton({ data, className = "" }: { data: InvestigationResponse; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onClick = async () => {
    setBusy(true);
    setError(null);
    try {
      await exportForensicDossier(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "export failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-0.5">
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        title="Download a forensic dossier PDF for enforcement (MARPOL Annex I)"
        className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-60 disabled:cursor-wait bg-red-950/60 hover:bg-red-900/70 text-red-200 border-red-800 ${className}`}
      >
        <span>{busy ? "⏳" : "📄"}</span>
        <span>{busy ? "Building dossier…" : "Export Forensic Dossier (PDF)"}</span>
      </button>
      {error && <span className="text-[10px] text-red-400 font-mono">{error}</span>}
    </div>
  );
}
