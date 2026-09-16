"use client";

import React from "react";
import {
  CheckCircle2,
  XCircle,
  Layers,
  FileCheck2,
  AlertOctagon,
  Info,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";

export default function MethodLimits() {
  const isItems = [
    {
      icon: CheckCircle2,
      headline: "Rapid Screening & Prioritisation",
      text: "A triage tool that turns hours of manual cross-referencing between satellite SAR scenes and global AIS tracks into a single automated pass.",
      badge: "High-Speed Triage",
    },
    {
      icon: Layers,
      headline: "Fully Explainable Attribution",
      text: "Every candidate score decomposes into weighted factors (proximity, trajectory, timing, behaviour), and every factor resolves into an auditable sentence.",
      badge: "Zero Black Box",
    },
    {
      icon: FileCheck2,
      headline: "Uncompromising Provenance",
      text: "The exact satellite scene ID, weather reanalysis model run, and sensor timestamp behind every coordinate are cited directly on screen.",
      badge: "Verifiable Lineage",
    },
  ];

  const isNotItems = [
    {
      icon: XCircle,
      headline: "Not Final Legal Proof of Guilt",
      text: "Attributions identify prime suspects and reconstructed trajectories; definitive court conviction requires physical oil fingerprinting and port-state vessel inspection.",
      badge: "Probable Cause Only",
    },
    {
      icon: AlertOctagon,
      headline: "Not Confirmed Ecological Damage",
      text: "Marine sanctuary warnings indicate geometric exposure screening against official Ramsar wetland polygons, not in-situ wildlife impact assessments.",
      badge: "Exposure Screening",
    },
    {
      icon: Info,
      headline: "Subject to Hydrodynamic Simplifications",
      text: "Drift physics uses Lagrangian surface advection with constant 30-minute meteo-forcing and ignores deep bathymetric friction or sub-surface turbulent mixing.",
      badge: "Surface Drift Model",
    },
  ];

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-baseline gap-5">
        <span className="text-xs font-semibold tracking-wider uppercase text-ink shrink-0">
          Method &amp; limits
        </span>
        <span className="flex-1 h-px bg-grid" />
        <span className="font-mono text-[11px] text-ink-soft hidden sm:inline">
          Filed with every forensic export · MARPOL Annex I
        </span>
      </div>

      <div className="mt-8 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h2 className="text-3xl sm:text-4xl font-display font-black tracking-tight text-ink leading-tight">
            What this is — and what it isn&apos;t
          </h2>
          <p className="mt-3 text-base text-ink-soft max-w-2xl leading-relaxed">
            Forensic integrity demands explicit clarity about analytical scope. We state operational capabilities and legal boundaries side by side.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 border border-hazard/40 bg-hazard/5 text-hazard px-3 py-1 font-mono text-[11px] rounded-xs self-start lg:self-auto shrink-0">
          <ShieldAlert size={14} className="text-hazard" />
          <span>Evidentiary Caveat · Read before action</span>
        </div>
      </div>

      {/* Side-by-side sleek comparison cards */}
      <div className="mt-10 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: It is (Valid Scope) */}
        <div className="rounded-xs border border-teal-600/30 bg-paper-alt/25 backdrop-blur-xs p-6 flex flex-col justify-between transition-all duration-300 hover:border-teal-600/60">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-grid/60">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-xs bg-teal-600/10 text-teal-700 dark:text-teal-400 border border-teal-600/20">
                  <CheckCircle2 size={18} strokeWidth={2} />
                </div>
                <div>
                  <h3 className="font-display text-lg font-bold text-ink">It is</h3>
                  <p className="text-[11px] font-mono text-teal-700 dark:text-teal-400">Validated Analytical Scope</p>
                </div>
              </div>
              <span className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-xs bg-paper border border-grid/60 text-ink-soft">
                Exhibit L-01
              </span>
            </div>

            <div className="mt-6 space-y-4">
              {isItems.map((item, idx) => {
                const Icon = item.icon;
                return (
                  <div
                    key={idx}
                    className="p-4 rounded-xs bg-paper/70 border border-grid/50 transition-all duration-200 hover:border-grid-strong"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2">
                        <Icon size={16} className="text-teal-600 shrink-0" />
                        <h4 className="text-sm font-semibold text-ink tracking-tight">
                          {item.headline}
                        </h4>
                      </div>
                      <span className="font-mono text-[9px] px-1.5 py-0.5 rounded-xs bg-teal-500/10 text-teal-700 dark:text-teal-400 font-medium">
                        {item.badge}
                      </span>
                    </div>
                    <p className="text-[13px] text-ink-soft leading-relaxed pl-6">
                      {item.text}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-grid/40 flex items-center justify-between font-mono text-[10px] text-ink-soft">
            <span>Primary role: Decision-support &amp; triage</span>
            <span className="text-teal-700 dark:text-teal-400 font-medium">OPERATIONAL</span>
          </div>
        </div>

        {/* Right Column: It is not (Caveats & Limits) */}
        <div className="rounded-xs border border-hazard/30 bg-paper-alt/25 backdrop-blur-xs p-6 flex flex-col justify-between transition-all duration-300 hover:border-hazard/60">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-grid/60">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-xs bg-hazard/10 text-hazard border border-hazard/20">
                  <XCircle size={18} strokeWidth={2} />
                </div>
                <div>
                  <h3 className="font-display text-lg font-bold text-ink">It is not</h3>
                  <p className="text-[11px] font-mono text-hazard">Boundary of Legal Proof</p>
                </div>
              </div>
              <span className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-xs bg-paper border border-grid/60 text-ink-soft">
                Exhibit L-02
              </span>
            </div>

            <div className="mt-6 space-y-4">
              {isNotItems.map((item, idx) => {
                const Icon = item.icon;
                return (
                  <div
                    key={idx}
                    className="p-4 rounded-xs bg-paper/70 border border-grid/50 transition-all duration-200 hover:border-grid-strong"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2">
                        <Icon size={16} className="text-hazard shrink-0" />
                        <h4 className="text-sm font-semibold text-ink tracking-tight">
                          {item.headline}
                        </h4>
                      </div>
                      <span className="font-mono text-[9px] px-1.5 py-0.5 rounded-xs bg-hazard/10 text-hazard font-medium">
                        {item.badge}
                      </span>
                    </div>
                    <p className="text-[13px] text-ink-soft leading-relaxed pl-6">
                      {item.text}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-grid/40 flex items-center justify-between font-mono text-[10px] text-ink-soft">
            <span>Requires: Physical chemical sample &amp; boarding</span>
            <span className="text-hazard font-medium">CAVEAT</span>
          </div>
        </div>
      </div>

      {/* Forensic Integrity Banner */}
      <div className="mt-6 p-4 rounded-xs border border-grid/70 bg-paper/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xs bg-paper-alt border border-grid text-ink shrink-0">
            <ShieldCheck size={18} />
          </div>
          <p className="text-xs sm:text-[13px] text-ink-soft leading-relaxed">
            <b className="text-ink font-semibold">Integrity Protocol:</b> Every screen in the application carries the same caveat, and so does the exported dossier. A forensic tool that overstates its certainty is worse than no tool at all.
          </p>
        </div>
        <span className="font-mono text-[10px] text-ink-soft shrink-0 border border-grid/60 px-2 py-1 rounded-xs bg-paper-alt">
          EPSG:4326 · WGS84
        </span>
      </div>
    </div>
  );
}
