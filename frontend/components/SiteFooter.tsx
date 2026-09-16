"use client";

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
    <footer className="relative border-t border-grid bg-paper-alt text-ink">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="lg:col-span-1">
            <div className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand-logo-icon.png"
                alt="SlickTrace AI mark"
                className="w-9 h-9 object-contain shrink-0"
              />
              <span className="flex flex-col leading-none">
                <span className="flex items-baseline gap-1">
                  <span className="text-base font-display font-black text-ink tracking-tight">SlickTrace</span>
                  <span className="text-base font-display font-bold text-[#2E8B8F]">AI</span>
                </span>
                <span className="font-mono text-[7.5px] text-ink-soft tracking-[0.22em] mt-1">
                  DETECT / TRACE / ATTRIBUTE
                </span>
              </span>
            </div>
            <p className="mt-2.5 text-xs text-ink-soft leading-relaxed">
              Satellite oil-spill detection, drift reconstruction and explainable vessel
              attribution for marine environment protection and enforcement.
            </p>
            <p className="mt-2 text-[11px] font-mono text-ink-soft">MARPOL Annex I Investigative Protocol</p>
          </div>

          {/* Link columns */}
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h3 className="text-xs font-semibold text-ink">
                {col.title}
              </h3>
              <ul className="mt-2.5 space-y-1.5">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="text-xs text-ink-soft hover:text-ink transition-colors"
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
            <h3 className="text-xs font-semibold text-ink">
              Data sources
            </h3>
            <ul className="mt-2.5 space-y-1">
              {SOURCES.map((s) => (
                <li key={s} className="text-xs text-ink-soft leading-relaxed">
                  {s}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-8 pt-4 border-t border-grid flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-ink-soft">
          <p className="font-mono">
            SAR Detection + Lagrangian Hindcast + Monte Carlo + AIS Attribution
          </p>
          <p className="sm:text-right max-w-md">
            Attribution scores rank consistency with the reconstructed discharge — an
            investigative prioritisation, not proof of responsibility.
          </p>
        </div>
      </div>
    </footer>
  );
}
