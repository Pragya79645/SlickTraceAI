"use client";

import React from "react";
import { Crosshair, Route, Ship, Leaf } from "lucide-react";
import { Timeline, type TimelineEntry } from "@/components/ui/timeline";

export default function PipelineTimeline() {
  const data: TimelineEntry[] = [
    {
      title: "01 · Detect",
      content: (
        <div className="border border-grid/70 bg-paper-alt/30 backdrop-blur-xs p-5 md:p-6 rounded-xs transition-all duration-300 hover:border-grid-strong">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xs bg-paper border border-grid text-ink">
                <Crosshair size={20} strokeWidth={1.75} />
              </div>
              <div>
                <h4 className="text-base font-semibold text-ink tracking-tight">Detect</h4>
                <p className="text-xs font-mono text-ink-soft">Phase 01 · Satellite Acquisition</p>
              </div>
            </div>
            <span className="font-mono text-xs px-2.5 py-1 bg-paper border border-grid text-ink-soft rounded-xs">
              01 / 04
            </span>
          </div>

          <p className="mt-4 text-[13px] md:text-sm text-ink-soft leading-relaxed">
            Instance segmentation finds the slick in a Sentinel-1 scene and measures its area,
            perimeter, and shape.
          </p>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
            <div className="px-3 py-1.5 bg-paper/80 border border-grid/60 rounded-xs flex items-center justify-between">
              <span className="text-ink-soft">Sensor</span>
              <span className="text-ink font-medium">Sentinel-1 SAR (C-band)</span>
            </div>
            <div className="px-3 py-1.5 bg-paper/80 border border-grid/60 rounded-xs flex items-center justify-between">
              <span className="text-ink-soft">Resolution</span>
              <span className="text-ink font-medium">10m spatial pixel size</span>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-grid flex items-center justify-between text-xs">
            <span className="text-ink-soft font-mono text-[11px]">Primary Output:</span>
            <span className="font-medium text-ink flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />
              Slick polygon + geometry
            </span>
          </div>
        </div>
      ),
    },
    {
      title: "02 · Trace back",
      content: (
        <div className="border border-grid/70 bg-paper-alt/30 backdrop-blur-xs p-5 md:p-6 rounded-xs transition-all duration-300 hover:border-grid-strong">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xs bg-paper border border-grid text-ink">
                <Route size={20} strokeWidth={1.75} />
              </div>
              <div>
                <h4 className="text-base font-semibold text-ink tracking-tight">Trace back</h4>
                <p className="text-xs font-mono text-ink-soft">Phase 02 · Hydrodynamic Hindcast</p>
              </div>
            </div>
            <span className="font-mono text-xs px-2.5 py-1 bg-paper border border-grid text-ink-soft rounded-xs">
              02 / 04
            </span>
          </div>

          <p className="mt-4 text-[13px] md:text-sm text-ink-soft leading-relaxed">
            Drift physics runs the ocean backwards six hours, on real current and wind fields, to
            where the oil entered the water.
          </p>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
            <div className="px-3 py-1.5 bg-paper/80 border border-grid/60 rounded-xs flex items-center justify-between">
              <span className="text-ink-soft">Drift Engine</span>
              <span className="text-ink font-medium">Lagrangian RK4 Hindcast</span>
            </div>
            <div className="px-3 py-1.5 bg-paper/80 border border-grid/60 rounded-xs flex items-center justify-between">
              <span className="text-ink-soft">Meteo Forcing</span>
              <span className="text-ink font-medium">NOAA GFS + CMEMS</span>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-grid flex items-center justify-between text-xs">
            <span className="text-ink-soft font-mono text-[11px]">Primary Output:</span>
            <span className="font-medium text-ink flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />
              Origin + probability bands
            </span>
          </div>
        </div>
      ),
    },
    {
      title: "03 · Attribute",
      content: (
        <div className="border border-grid/70 bg-paper-alt/30 backdrop-blur-xs p-5 md:p-6 rounded-xs transition-all duration-300 hover:border-grid-strong">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xs bg-paper border border-grid text-ink">
                <Ship size={20} strokeWidth={1.75} />
              </div>
              <div>
                <h4 className="text-base font-semibold text-ink tracking-tight">Attribute</h4>
                <p className="text-xs font-mono text-ink-soft">Phase 03 · AIS Vessel Correlation</p>
              </div>
            </div>
            <span className="font-mono text-xs px-2.5 py-1 bg-paper border border-grid text-ink-soft rounded-xs">
              03 / 04
            </span>
          </div>

          <p className="mt-4 text-[13px] md:text-sm text-ink-soft leading-relaxed">
            AIS traffic is scored against that origin on four weighted factors — including vessels
            that switched their transponder off.
          </p>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
            <div className="px-3 py-1.5 bg-paper/80 border border-grid/60 rounded-xs flex items-center justify-between">
              <span className="text-ink-soft">Surveillance</span>
              <span className="text-ink font-medium">Terrestrial & Satellite AIS</span>
            </div>
            <div className="px-3 py-1.5 bg-paper/80 border border-grid/60 rounded-xs flex items-center justify-between">
              <span className="text-ink-soft">Anomaly Filter</span>
              <span className="text-ink font-medium">Dark vessel gap detection</span>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-grid flex items-center justify-between text-xs">
            <span className="text-ink-soft font-mono text-[11px]">Primary Output:</span>
            <span className="font-medium text-ink flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />
              Ranked suspects + evidence
            </span>
          </div>
        </div>
      ),
    },
    {
      title: "04 · Protect",
      content: (
        <div className="border border-grid/70 bg-paper-alt/30 backdrop-blur-xs p-5 md:p-6 rounded-xs transition-all duration-300 hover:border-grid-strong">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xs bg-paper border border-grid text-ink">
                <Leaf size={20} strokeWidth={1.75} />
              </div>
              <div>
                <h4 className="text-base font-semibold text-ink tracking-tight">Protect</h4>
                <p className="text-xs font-mono text-ink-soft">Phase 04 · Ramsar Impact Forecast</p>
              </div>
            </div>
            <span className="font-mono text-xs px-2.5 py-1 bg-paper border border-grid text-ink-soft rounded-xs">
              04 / 04
            </span>
          </div>

          <p className="mt-4 text-[13px] md:text-sm text-ink-soft leading-relaxed">
            The forward forecast is intersected with India&apos;s official Ramsar wetland polygons
            to flag what the slick reaches next.
          </p>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
            <div className="px-3 py-1.5 bg-paper/80 border border-grid/60 rounded-xs flex items-center justify-between">
              <span className="text-ink-soft">Ecological Vectors</span>
              <span className="text-ink font-medium">Official Ramsar Sanctuaries</span>
            </div>
            <div className="px-3 py-1.5 bg-paper/80 border border-grid/60 rounded-xs flex items-center justify-between">
              <span className="text-ink-soft">Forecast Span</span>
              <span className="text-ink font-medium">24-hour forward diffusion</span>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-grid flex items-center justify-between text-xs">
            <span className="text-ink-soft font-mono text-[11px]">Primary Output:</span>
            <span className="font-medium text-ink flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />
              Exposure + response priority
            </span>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="w-full">
      <Timeline
        headerTitle="How it works"
        headerTag="Chain ST-4 · four moves"
        heading={
          <h2 className="text-3xl sm:text-4xl font-display font-black tracking-tight text-ink max-w-xl leading-tight">
            One scene in.
            <br />
            <span className="text-ink-soft font-light">A named suspect out.</span>
          </h2>
        }
        data={data}
        footerNote="Each move emits verifiable geometry, not a narrative"
        footerCoord="WGS 84 · EPSG:4326"
      />
    </div>
  );
}
