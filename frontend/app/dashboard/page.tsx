/**
 * /dashboard — Server Component
 *
 * Fetches the SPILL-001 investigation from the FastAPI backend
 * and passes real data to the client-side Dashboard component.
 *
 * All displayed values come from the API response — nothing is hardcoded.
 */

import type { Metadata } from "next";
import { fetchInvestigation } from "@/lib/api";
import Dashboard from "@/components/Dashboard";

export const metadata: Metadata = {
  title: "SPILL-001 | SlickTrace AI",
  description:
    "Oil spill investigation dashboard — detection, drift reconstruction, and vessel attribution for SPILL-001",
};

export default async function DashboardPage() {
  let data;
  try {
    data = await fetchInvestigation("SPILL-001");
  } catch (err) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-slate-950 text-slate-300 gap-4">
        <div className="text-4xl">⚠</div>
        <h1 className="text-xl font-bold text-red-400">Backend Unreachable</h1>
        <p className="text-sm text-slate-500 max-w-md text-center">
          Could not fetch investigation data from the FastAPI backend.
          <br />
          Make sure the backend is running:
        </p>
        <pre className="bg-slate-900 border border-slate-700 rounded px-4 py-2 text-xs font-mono text-slate-300">
          cd backend{"\n"}
          slicktrace-env\Scripts\uvicorn app.main:app --port 8000 --reload
        </pre>
        <p className="text-xs text-slate-600 mt-2">{String(err)}</p>
      </div>
    );
  }

  return <Dashboard data={data} />;
}
