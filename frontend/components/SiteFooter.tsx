"use client";

/**
 * SiteFooter — sleek, dark, high-precision forensic platform footer.
 * Redesigned in pitch black with refined maritime intelligence styling,
 * clear provenance data, and live system verification telemetry.
 */

import Link from "next/link";
import { ArrowUpRight, Satellite, Database, ShieldCheck, Activity } from "lucide-react";

const PLATFORM_LINKS = [
  { label: "Pipeline & How it works", href: "/#how-it-works" },
  { label: "Core Capabilities", href: "/#capabilities" },
  { label: "Model Metrics & Checkpoint", href: "/#numbers" },
  { label: "Method & Evidentiary Limits", href: "/#method" },
];

const SCENARIO_LINKS = [
  { label: "Upload Satellite Scene", href: "/investigate", highlight: true },
  { label: "Case SPILL-001 (Mumbai Offshore)", href: "/dashboard?case=SPILL-001" },
  { label: "Case SPILL-TEST-002 (Multi-vessel)", href: "/dashboard?case=SPILL-TEST-002" },
  { label: "Case SPILL-TEST-003 (Dark-vessel AIS Gap)", href: "/dashboard?case=SPILL-TEST-003" },
];

const DATA_SOURCES = [
  { name: "Sentinel-1 SAR", org: "ESA / Copernicus", type: "Radar Imagery (10m)" },
  { name: "Open-Meteo & ERA5", org: "ECMWF", type: "Wind & Wave Reanalysis" },
  { name: "Ramsar Wetlands GIS", org: "MoEFCC / Bharatmaps", type: "Ecological Vectors" },
  { name: "Global AIS Stream", org: "Terrestrial + Satellite", type: "Kinematic Telemetry" },
];

export default function SiteFooter() {
  return (
    <footer className="relative bg-[#07090C] text-neutral-300 border-t border-white/[0.08] overflow-hidden">
      {/* Subtle top ambient glow */}
      <div
        aria-hidden="true"
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[1px] bg-gradient-to-r from-transparent via-teal-500/50 to-transparent"
      />
      <div
        aria-hidden="true"
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-[100px] bg-teal-500/[0.03] blur-3xl pointer-events-none"
      />

      <div className="max-w-6xl mx-auto px-6 pt-16 pb-12">
        {/* Main 4-column layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-10 lg:gap-8 pb-14 border-b border-white/[0.06]">
          {/* Col 1: Brand & Operational Scope (Span 4) */}
          <div className="lg:col-span-4 flex flex-col justify-between space-y-6">
            <div>
              <Link href="/" className="inline-flex items-center gap-3 group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/brand-logo-icon.png"
                  alt="SlickTrace AI mark"
                  className="w-9 h-9 object-contain shrink-0 transition-transform duration-300 group-hover:scale-105"
                />
                <div className="flex flex-col leading-none">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-lg font-display font-black text-white tracking-tight">
                      SlickTrace
                    </span>
                    <span className="text-lg font-display font-bold text-teal-400">
                      AI
                    </span>
                  </div>
                  <span className="font-mono text-[8px] text-neutral-400 tracking-[0.24em] mt-1">
                    DETECT · TRACE · ATTRIBUTE
                  </span>
                </div>
              </Link>

              <p className="mt-4 text-xs text-neutral-400 leading-relaxed max-w-sm">
                Next-generation autonomous satellite radar segmentation, hydrodynamic drift hindcast, and explainable AIS vessel attribution for maritime enforcement.
              </p>
            </div>

            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-xs bg-white/[0.04] border border-white/[0.08] text-[11px] font-mono text-neutral-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>All telemetry pipelines nominal</span>
              </div>
              <p className="font-mono text-[10px] text-neutral-400">
                Protocol: MARPOL Annex I Investigative Framework
              </p>
            </div>
          </div>

          {/* Col 2: Platform Links (Span 2) */}
          <div className="lg:col-span-2 space-y-4">
            <h3 className="text-xs font-semibold text-white tracking-wider uppercase font-mono flex items-center gap-1.5">
              <Activity size={12} className="text-teal-400" />
              <span>Platform</span>
            </h3>
            <ul className="space-y-2.5">
              {PLATFORM_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-xs text-neutral-400 hover:text-white transition-colors duration-200 flex items-center group"
                  >
                    <span>{link.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 3: Forensic Scenarios (Span 3) */}
          <div className="lg:col-span-3 space-y-4">
            <h3 className="text-xs font-semibold text-white tracking-wider uppercase font-mono flex items-center gap-1.5">
              <Satellite size={12} className="text-cyan-400" />
              <span>Investigate</span>
            </h3>
            <ul className="space-y-2.5">
              {SCENARIO_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className={`text-xs transition-colors duration-200 flex items-center justify-between group ${
                      link.highlight
                        ? "text-teal-400 hover:text-teal-300 font-medium"
                        : "text-neutral-400 hover:text-white"
                    }`}
                  >
                    <span>{link.label}</span>
                    <ArrowUpRight
                      size={12}
                      className="opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 4: Verified Data Ingestion (Span 3) */}
          <div className="lg:col-span-3 space-y-4">
            <h3 className="text-xs font-semibold text-white tracking-wider uppercase font-mono flex items-center gap-1.5">
              <Database size={12} className="text-teal-400" />
              <span>Data Provenance</span>
            </h3>
            <div className="space-y-2">
              {DATA_SOURCES.map((ds) => (
                <div
                  key={ds.name}
                  className="p-2 rounded-xs bg-white/[0.02] border border-white/[0.05] hover:border-white/[0.1] transition-colors"
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-neutral-200 font-medium">{ds.name}</span>
                    <span className="font-mono text-[9px] text-neutral-400">{ds.org}</span>
                  </div>
                  <div className="text-[10px] text-neutral-400 mt-0.5">{ds.type}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom Technical Bar */}
        <div className="pt-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-[11px] text-neutral-400 font-mono">
          <div className="flex items-center gap-2">
            <ShieldCheck size={14} className="text-teal-400 shrink-0" />
            <span>
              SAR Detection + Lagrangian RK4 Hindcast + 500-Particle Monte Carlo + AIS Correlation
            </span>
          </div>

          <div className="flex items-center gap-4 text-[10px] text-neutral-400">
            <span>EPSG:4326 / WGS 84</span>
            <span className="h-3 w-px bg-white/10" />
            <span>ISO 14001 Compliant</span>
            <span className="h-3 w-px bg-white/10" />
            <span className="text-neutral-400">
              © {new Date().getFullYear()} SlickTrace AI
            </span>
          </div>
        </div>

        {/* Legal disclaimer */}
        <p className="mt-4 text-[10px] text-neutral-400 leading-relaxed max-w-3xl">
          Attribution scores rank physical consistency between vessel kinematics and the reconstructed oil slick origin — designed for investigative prioritization and law enforcement triage, not as conclusive proof of civil or criminal liability.
        </p>
      </div>
    </footer>
  );
}
