"use client";

import { useState } from "react";
import { FileText, LoaderCircle } from "lucide-react";
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
        title="Download forensic dossier PDF for enforcement (MARPOL Annex I)"
        className={`text-[11px] font-medium px-2.5 py-1.5 rounded-[2px] border border-grid bg-paper hover:bg-paper-alt text-ink transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-wait ${className}`}
      >
        {busy ? (
          <LoaderCircle size={13} strokeWidth={2} className="animate-spin text-ink-soft" />
        ) : (
          <FileText size={13} strokeWidth={1.75} className="text-ink-soft" />
        )}
        <span className="hidden md:inline">{busy ? "Building dossier…" : "Export dossier"}</span>
      </button>
      {error && <span className="text-[10px] text-hazard font-mono">{error}</span>}
    </div>
  );
}
