/**
 * SiteFooter — shared footer across the landing, investigate and dashboard pages.
 *
 * Carries the provenance a forensic tool owes its reader: what the data is, where
 * it comes from, and what the output is not.
 */

import Link from "next/link";

const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Platform",
    links: [
      { label: "How it works", href: "/#how-it-works" },
      { label: "Capabilities", href: "/#capabilities" },
      { label: "Model & metrics", href: "/#numbers" },
    ],
  },
  {
    title: "Investigate",
    links: [
      { label: "Upload a scene", href: "/investigate" },
      { label: "Demo — SPILL-001", href: "/dashboard?case=SPILL-001" },
      { label: "Multi-vessel scenario", href: "/dashboard?case=SPILL-TEST-002" },
      { label: "Dark-vessel scenario", href: "/dashboard?case=SPILL-TEST-003" },
    ],
  },
];

const SOURCES = [
  "Sentinel-1 SAR (Copernicus)",
  "Open-Meteo Marine + ERA5 reanalysis",
  "MoEFCC / Bharatmaps Ramsar GIS",
  "AIS vessel telemetry",
];

export default function SiteFooter() {
  return (
    <footer className="relative border-t border-slate-800/80 bg-slate-950">
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
          {/* Brand */}
          <div className="lg:col-span-1">
            <div className="flex items-center gap-1.5">
              <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-black text-sm">
                ST
              </div>
              <span className="text-lg font-black tracking-tight text-white">SlickTrace</span>
              <span className="text-lg font-light text-amber-400">AI</span>
            </div>
            <p className="mt-3 text-xs text-slate-400 leading-relaxed">
              Satellite oil-spill detection, drift reconstruction and explainable vessel
              attribution for marine environment protection and enforcement.
            </p>
            <p className="mt-3 text-[11px] font-mono text-slate-600">v1.0 · Smart India Hackathon 2026</p>
          </div>

          {/* Link columns */}
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h3 className="text-[11px] font-bold text-slate-300 uppercase tracking-[0.14em]">
                {col.title}
              </h3>
              <ul className="mt-3.5 space-y-2">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="text-xs text-slate-400 hover:text-amber-300 transition-colors"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Data provenance */}
          <div>
            <h3 className="text-[11px] font-bold text-slate-300 uppercase tracking-[0.14em]">
              Data sources
            </h3>
            <ul className="mt-3.5 space-y-2">
              {SOURCES.map((s) => (
                <li key={s} className="text-xs text-slate-400 leading-relaxed">
                  {s}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 pt-6 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-[11px] font-mono text-slate-600 text-center sm:text-left">
            SAR Detection + Lagrangian Hindcast + Monte Carlo + AIS Attribution
          </p>
          <p className="text-[11px] text-slate-500 text-center sm:text-right max-w-md">
            Attribution scores rank consistency with the reconstructed discharge — they are an
            investigative prioritisation, not proof of responsibility.
          </p>
        </div>
      </div>
    </footer>
  );
}
