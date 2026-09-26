"use client";

import React from "react";
import {
  Satellite,
  ScanLine,
  Undo2,
  Radar,
  Scale,
  SignalZero,
  Leaf,
  Waves,
  FileText,
  Gauge,
} from "lucide-react";
import { BentoGrid, BentoGridItem } from "@/components/ui/bento-grid";

export default function CapabilitiesBento() {
  return (
    <div className="w-full">
      {/* Section Header */}
      <div className="flex items-baseline gap-5">
        <span className="text-xs font-semibold tracking-wider uppercase text-ink shrink-0">
          What holds up
        </span>
        <span className="flex-1 h-px bg-grid" />
        <span className="font-mono text-[11px] text-ink-soft hidden sm:inline">
          Dossier ST-B · six exhibits
        </span>
      </div>

      <div className="mt-8 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <h2 className="text-3xl sm:text-4xl font-display font-black tracking-tight text-ink max-w-2xl leading-tight">
          Defensible science, not just computer vision
        </h2>
        <span className="inline-flex items-center gap-2 border border-grid px-3 py-1 font-mono text-[11px] text-ink rounded-xs self-start lg:self-auto bg-paper">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Review status: verified
        </span>
      </div>

      <p className="mt-4 text-base text-ink-soft leading-relaxed max-w-2xl">
        Anyone can draw a box around a dark patch. The hard part is defending where the
        coordinates came from, how certain the origin is, and why this ship rather than that one.
      </p>

      {/* Main Bento Grid */}
      <div className="mt-10">
        <BentoGrid>
          {/* Exhibit 1: The scene locates itself (col-span-2) */}
          <BentoGridItem
            className="md:col-span-2"
            exhibit="EXH 01"
            tag="rasterio · CRS-aware"
            icon={<Satellite size={18} strokeWidth={1.75} />}
            title="The scene locates itself"
            description="A Sentinel-1 GeoTIFF carries its own coordinate system, transform and acquisition time. Every mask vertex lands in real WGS84 and the slick centroid anchors the drift model — nobody types a latitude."
            header={
              <div className="h-32 w-full p-3 font-mono text-[11px] text-ink-soft flex flex-col justify-between relative overflow-hidden bg-gradient-to-br from-paper via-paper-alt/50 to-paper">
                <div className="flex items-center justify-between border-b border-grid/50 pb-1.5 text-[10px]">
                  <span className="text-ink font-semibold flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-cyan-500" />
                    WGS 84 / UTM ZONE 43N · EPSG:32643
                  </span>
                  <span className="text-ink-soft">18.952° N, 72.821° E</span>
                </div>
                <div className="grid grid-cols-3 gap-2 py-2 text-[10px]">
                  <div className="p-1.5 rounded-xs bg-paper border border-grid/50">
                    <span className="block text-ink-soft text-[9px]">GSD</span>
                    <span className="text-ink font-medium">10.0 m/px</span>
                  </div>
                  <div className="p-1.5 rounded-xs bg-paper border border-grid/50">
                    <span className="block text-ink-soft text-[9px]">POLARISATION</span>
                    <span className="text-ink font-medium">VV + VH Dual</span>
                  </div>
                  <div className="p-1.5 rounded-xs bg-paper border border-grid/50">
                    <span className="block text-ink-soft text-[9px]">GEOREF RMSE</span>
                    <span className="text-ink font-medium">&lt; 0.12 px</span>
                  </div>
                </div>
                <div className="text-[10px] text-ink-soft flex items-center justify-between pt-1 border-t border-grid/40">
                  <span>Pixel grid auto-aligned to Copernicus DEM</span>
                  <span className="text-emerald-600 font-medium">PASS</span>
                </div>
              </div>
            }
          />

          {/* Exhibit 2: Published detector numbers (col-span-1) */}
          <BentoGridItem
            className="md:col-span-1"
            exhibit="EXH 02"
            tag="YOLOv8-seg · tiled inference"
            icon={<ScanLine size={18} strokeWidth={1.75} />}
            title="Published detector numbers"
            description="Mask mAP50 0.66, precision 0.78, recall 0.56 — read live from the checkpoint, not a slide. Overlapping 256-px tiles ensure sea texture never triggers false slicks."
            header={
              <div className="h-32 w-full p-3 font-mono text-[11px] flex flex-col justify-between bg-paper">
                <div className="flex items-center justify-between text-[10px] text-ink-soft border-b border-grid/50 pb-1">
                  <span>CHECKPOINT METRICS</span>
                  <span className="text-ink font-medium">EPOCH 120</span>
                </div>
                <div className="space-y-2 my-auto">
                  <div>
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className="text-ink-soft">Precision (mAP50)</span>
                      <span className="text-ink font-bold">77.6%</span>
                    </div>
                    <div className="w-full h-1.5 bg-grid/40 rounded-full overflow-hidden">
                      <div className="h-full bg-teal-600 rounded-full" style={{ width: "77.6%" }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className="text-ink-soft">Recall (Low Contrast)</span>
                      <span className="text-ink font-bold">55.8%</span>
                    </div>
                    <div className="w-full h-1.5 bg-grid/40 rounded-full overflow-hidden">
                      <div className="h-full bg-cyan-600 rounded-full" style={{ width: "55.8%" }} />
                    </div>
                  </div>
                </div>
                <div className="text-[9px] text-ink-soft flex justify-between pt-1 border-t border-grid/40">
                  <span>Benchmark: CERISE-SAR-V2</span>
                  <span className="text-ink font-medium">stride 32</span>
                </div>
              </div>
            }
          />

          {/* Exhibit 3: Physics, run backwards (col-span-1) */}
          <BentoGridItem
            className="md:col-span-1"
            exhibit="EXH 03"
            tag="6 h hindcast · real forcing"
            icon={<Undo2 size={18} strokeWidth={1.75} />}
            title="Physics, run backwards"
            description="Lagrangian advection — surface current plus a 3% wind factor — steps the slick back in 30-minute increments on actual Open-Meteo & ERA5 fields."
            header={
              <div className="h-32 w-full p-3 font-mono text-[11px] flex flex-col justify-between bg-paper relative">
                <div className="flex items-center justify-between text-[10px] text-ink-soft border-b border-grid/50 pb-1">
                  <span>HINDCAST TRAJECTORY</span>
                  <span className="text-cyan-600 font-medium">-06:00:00</span>
                </div>
                <div className="relative flex-1 flex items-center justify-around py-2">
                  <div className="text-center">
                    <span className="block text-[9px] text-ink-soft">CURRENT</span>
                    <span className="text-xs font-semibold text-ink">0.42 m/s</span>
                    <span className="block text-[8px] text-ink-soft">245° WSW</span>
                  </div>
                  <div className="h-6 w-px bg-grid" />
                  <div className="text-center">
                    <span className="block text-[9px] text-ink-soft">WIND (10M)</span>
                    <span className="text-xs font-semibold text-ink">14.8 kt</span>
                    <span className="block text-[8px] text-ink-soft">3.0% leeway</span>
                  </div>
                </div>
                <div className="text-[9px] text-ink-soft flex justify-between pt-1 border-t border-grid/40">
                  <span>Time steps: 12 × 30m</span>
                  <span className="text-ink font-medium">RK4 Advection</span>
                </div>
              </div>
            }
          />

          {/* Exhibit 4: Uncertainty you can see (col-span-1) */}
          <BentoGridItem
            className="md:col-span-1"
            exhibit="EXH 04"
            tag="500-particle Monte Carlo"
            icon={<Radar size={18} strokeWidth={1.75} />}
            title="Uncertainty you can see"
            description="A single backtrack line is false precision. Five hundred particles carry perturbed current, wind and turbulent diffusion, resolving into 50/80/95% probability bands."
            header={
              <div className="h-32 w-full p-3 font-mono text-[11px] flex flex-col justify-between bg-paper">
                <div className="flex items-center justify-between text-[10px] text-ink-soft border-b border-grid/50 pb-1">
                  <span>PROBABILITY ELLIPSOIDS</span>
                  <span className="text-ink font-medium">N=500</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5 py-2 text-center">
                  <div className="p-1.5 bg-paper-alt/40 border border-grid/50 rounded-xs">
                    <span className="block text-[9px] text-ink-soft">P50</span>
                    <span className="text-xs font-bold text-ink">0.8 km²</span>
                  </div>
                  <div className="p-1.5 bg-paper-alt/40 border border-grid/50 rounded-xs">
                    <span className="block text-[9px] text-ink-soft">P80</span>
                    <span className="text-xs font-bold text-ink">2.4 km²</span>
                  </div>
                  <div className="p-1.5 bg-paper-alt/40 border border-grid/50 rounded-xs">
                    <span className="block text-[9px] text-ink-soft">P95</span>
                    <span className="text-xs font-bold text-ink">5.1 km²</span>
                  </div>
                </div>
                <div className="text-[9px] text-ink-soft flex justify-between pt-1 border-t border-grid/40">
                  <span>Diffusion: Smagorinsky</span>
                  <span className="text-ink font-medium">Gaussian fit</span>
                </div>
              </div>
            }
          />

          {/* Exhibit 5: Every point is explainable (col-span-1) */}
          <BentoGridItem
            className="md:col-span-1"
            exhibit="EXH 05"
            tag="4-factor · human-readable"
            icon={<Scale size={18} strokeWidth={1.75} />}
            title="Every point is explainable"
            description="Four weighted factors — proximity 35, timing 20, trajectory 30, behaviour 15 — and each returns the exact verifiable sentence that earned it."
            header={
              <div className="h-32 w-full p-3 font-mono text-[10px] flex flex-col justify-between bg-paper">
                <div className="flex items-center justify-between text-ink-soft border-b border-grid/50 pb-1">
                  <span>WEIGHTED EVIDENCE SCORE</span>
                  <span className="text-ink font-bold text-xs">92/100</span>
                </div>
                <div className="space-y-1.5 my-auto">
                  <div className="flex justify-between items-center text-[9px]">
                    <span className="text-ink-soft">Proximity (max 35)</span>
                    <span className="font-semibold text-ink">34 pts · 0.06 km</span>
                  </div>
                  <div className="flex justify-between items-center text-[9px]">
                    <span className="text-ink-soft">Trajectory (max 30)</span>
                    <span className="font-semibold text-ink">28 pts · aligned</span>
                  </div>
                  <div className="flex justify-between items-center text-[9px]">
                    <span className="text-ink-soft">Timing (max 20)</span>
                    <span className="font-semibold text-ink">18 pts · ±6m gap</span>
                  </div>
                  <div className="flex justify-between items-center text-[9px]">
                    <span className="text-ink-soft">Behaviour (max 15)</span>
                    <span className="font-semibold text-ink">12 pts · slow turn</span>
                  </div>
                </div>
                <div className="text-[9px] text-ink-soft flex justify-between pt-1 border-t border-grid/40">
                  <span>Zero black-box scores</span>
                  <span className="text-emerald-600 font-medium">Auditable</span>
                </div>
              </div>
            }
          />

          {/* Exhibit 6: It catches ships that go dark (col-span-3) */}
          <BentoGridItem
            className="md:col-span-3"
            exhibit="EXH 06"
            tag="cadence-relative silence"
            icon={<SignalZero size={18} strokeWidth={1.75} />}
            title="It catches ships that go dark"
            description="Switching AIS off is the signature of a deliberate discharge. Gaps are judged against each vessel's own reporting cadence; an intentional silence spanning the discharge window is interpolated and scored as forensic evidence."
            header={
              <div className="h-24 w-full p-3 font-mono text-[11px] flex flex-col justify-between bg-paper">
                <div className="flex items-center justify-between text-[10px] text-ink-soft border-b border-grid/50 pb-1">
                  <span>AIS BROADCAST CADENCE TIMELINE</span>
                  <span className="text-hazard font-semibold">ANOMALY DETECTED: 64 MIN GAP</span>
                </div>
                <div className="flex items-center justify-between gap-2 py-2">
                  <div className="flex-1 flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="text-[10px] text-ink font-medium">01:15Z</span>
                    <div className="h-0.5 flex-1 bg-emerald-500/50" />
                  </div>
                  <div className="px-3 py-1 bg-hazard/10 border border-hazard/30 rounded-xs text-[10px] text-hazard font-bold flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-hazard animate-ping" />
                    TRANSPONDER DISABLED [01:34Z — 02:38Z]
                  </div>
                  <div className="flex-1 flex items-center gap-1">
                    <div className="h-0.5 flex-1 bg-emerald-500/50" />
                    <span className="text-[10px] text-ink font-medium">02:40Z</span>
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  </div>
                </div>
                <div className="text-[9px] text-ink-soft flex justify-between pt-1 border-t border-grid/40">
                  <span>Normal cadence: 1 msg / 30s</span>
                  <span className="text-ink font-medium">Inferred discharge path calculated</span>
                </div>
              </div>
            }
          />
        </BentoGrid>
      </div>

      {/* Supporting Slips / Capabilities Row */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xs border border-grid/70 bg-paper-alt/25 hover:bg-paper-alt/40 p-4 transition duration-200">
          <div className="flex items-center gap-2.5 text-ink mb-1.5">
            <Leaf size={16} strokeWidth={1.75} className="text-ink" />
            <h4 className="text-[13px] font-semibold tracking-tight">Ecological exposure</h4>
          </div>
          <p className="text-[12px] text-ink-soft leading-relaxed">
            99 official Ramsar polygons intersected as real geometry, with time to first contact.
          </p>
        </div>

        <div className="rounded-xs border border-grid/70 bg-paper-alt/25 hover:bg-paper-alt/40 p-4 transition duration-200">
          <div className="flex items-center gap-2.5 text-ink mb-1.5">
            <Waves size={16} strokeWidth={1.75} className="text-ink" />
            <h4 className="text-[13px] font-semibold tracking-tight">Volume estimate</h4>
          </div>
          <p className="text-[12px] text-ink-soft leading-relaxed">
            Bonn Agreement appearance codes convert slick area to a calibrated tonnage bracket.
          </p>
        </div>

        <div className="rounded-xs border border-grid/70 bg-paper-alt/25 hover:bg-paper-alt/40 p-4 transition duration-200">
          <div className="flex items-center gap-2.5 text-ink mb-1.5">
            <FileText size={16} strokeWidth={1.75} className="text-ink" />
            <h4 className="text-[13px] font-semibold tracking-tight">Enforcement dossier</h4>
          </div>
          <p className="text-[12px] text-ink-soft leading-relaxed">
            One click produces a court-admissible forensic PDF ready for a MARPOL Annex I notice.
          </p>
        </div>

        <div className="rounded-xs border border-grid/70 bg-paper-alt/25 hover:bg-paper-alt/40 p-4 transition duration-200">
          <div className="flex items-center gap-2.5 text-ink mb-1.5">
            <Gauge size={16} strokeWidth={1.75} className="text-ink" />
            <h4 className="text-[13px] font-semibold tracking-tight">Runs without network</h4>
          </div>
          <p className="text-[12px] text-ink-soft leading-relaxed">
            Cached forcing and a regional fallback keep the hindcast and attribution engine alive offline.
          </p>
        </div>
      </div>
    </div>
  );
}
