/**
 * /dashboard — Server Component
 *
 * Fetches an investigation from the FastAPI backend and hands it to the client-side
 * Dashboard. `?case=<id>` selects the case: a bundled scenario (SPILL-001 default,
 * SPILL-TEST-002, SPILL-TEST-003) or a persisted live upload (SPILL-LIVE-…).
 *
 * All displayed values come from the API response — nothing is hardcoded.
 */

import type { Metadata } from "next";
import { fetchInvestigation, isLiveCaseId, type InvestigationResponse } from "@/lib/api";
import Dashboard from "@/components/Dashboard";

const DEFAULT_CASE = "SPILL-001";

export const metadata: Metadata = {
  title: "Investigation | SlickTrace AI",
  description:
    "Oil spill investigation dashboard — detection, drift reconstruction, vessel attribution and ecological exposure",
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ case?: string | string[] }>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.case) ? params.case[0] : params.case;
  const requested = (raw ?? "").trim() || DEFAULT_CASE;

  let data: InvestigationResponse | undefined;
  let notice: string | undefined;
  let lastError: unknown;

  try {
    data = await fetchInvestigation(requested);
  } catch (err) {
    lastError = err;
    if (requested !== DEFAULT_CASE) {
      // A missing/incomplete live case shouldn't strand the user — fall back to the baseline
      try {
        data = await fetchInvestigation(DEFAULT_CASE);
        notice = `Case "${requested}" could not be loaded (${String(err instanceof Error ? err.message : err)}). Showing ${DEFAULT_CASE} instead.`;
      } catch (err2) {
        lastError = err2;
      }
    }
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-paper text-ink gap-4 p-6">
        <div className="text-4xl text-hazard">⚠</div>
        <h1 className="text-xl font-display font-bold text-hazard">Backend unreachable</h1>
        <p className="text-sm text-ink-soft max-w-md text-center">
          Could not fetch investigation data from the FastAPI backend.
          <br />
          Ensure the backend service is active:
        </p>
        <pre className="bg-paper-alt border border-grid rounded-[2px] px-4 py-2 text-xs font-mono text-ink">
          cd backend{"\n"}
          python -m uvicorn app.main:app --port 8000 --reload
        </pre>
        <p className="text-xs text-ink-soft mt-2 font-mono">{String(lastError)}</p>
      </div>
    );
  }

  return (
    <Dashboard
      data={data}
      liveCaseId={isLiveCaseId(data.spill_id) ? data.spill_id : undefined}
      notice={notice}
    />
  );
}
