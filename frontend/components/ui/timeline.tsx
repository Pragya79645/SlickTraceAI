"use client";

import React, { useEffect, useRef, useState } from "react";

export interface TimelineEntry {
  title: string;
  content: React.ReactNode;
}

interface TimelineProps {
  data: TimelineEntry[];
  headerTitle?: string;
  headerTag?: string;
  heading?: React.ReactNode;
  footerNote?: string;
  footerCoord?: string;
}

export function Timeline({
  data,
  headerTitle,
  headerTag,
  heading,
  footerNote,
  footerCoord,
}: TimelineProps) {
  const ref = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  const [beamHeight, setBeamHeight] = useState(0);
  const [beamOpacity, setBeamOpacity] = useState(0);

  useEffect(() => {
    const updateDimensions = () => {
      if (ref.current) {
        const rect = ref.current.getBoundingClientRect();
        setHeight(rect.height);
      }
    };

    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, [data]);

  useEffect(() => {
    let animationFrameId: number;

    const handleScroll = () => {
      if (!containerRef.current || !ref.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const windowHeight = window.innerHeight;

      // Start calculating when container starts coming into view
      // Similar to Aceternity's offset: ["start 15%", "end 60%"]
      const start = windowHeight * 0.85;
      const end = windowHeight * 0.3;
      const totalScrollable = rect.height;

      const current = start - rect.top;
      const progress = Math.min(Math.max(current / (totalScrollable + (start - end)), 0), 1);

      animationFrameId = requestAnimationFrame(() => {
        setBeamHeight(progress * height);
        setBeamOpacity(progress > 0.02 ? 1 : progress * 50);
      });
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => {
      window.removeEventListener("scroll", handleScroll);
      cancelAnimationFrame(animationFrameId);
    };
  }, [height]);

  return (
    <div
      ref={containerRef}
      className="relative w-full text-ink"
    >
      {/* Header section if provided */}
      {(headerTitle || heading) && (
        <div className="mb-12">
          {headerTitle && (
            <div className="flex items-baseline gap-5">
              <span className="text-xs font-semibold tracking-wider uppercase text-ink shrink-0">
                {headerTitle}
              </span>
              <span className="flex-1 h-px bg-grid" />
              {headerTag && (
                <span className="font-mono text-[11px] text-ink-soft hidden sm:inline">
                  {headerTag}
                </span>
              )}
            </div>
          )}

          {heading && (
            <div className="mt-8">
              {heading}
            </div>
          )}
        </div>
      )}

      {/* Timeline items & vertical track */}
      <div ref={ref} className="relative pb-10">
        {data.map((item, index) => (
          <div
            key={index}
            className="flex flex-col md:flex-row justify-start pt-8 md:pt-16 gap-4 md:gap-10"
          >
            {/* Left sticky title column */}
            <div className="sticky flex items-center md:items-start z-30 top-32 self-start max-w-full md:max-w-xs md:w-full">
              {/* Radar indicator dot */}
              <div className="h-9 w-9 absolute -left-1 md:left-3 rounded-full bg-paper border border-grid flex items-center justify-center shadow-xs">
                <div className="h-3 w-3 rounded-full bg-ink/70 border border-grid transition-all duration-300 group-hover:scale-125" />
              </div>

              {/* Title on Desktop */}
              <div className="hidden md:block pl-16">
                <h3 className="text-xl lg:text-2xl font-display font-bold text-ink tracking-tight">
                  {item.title}
                </h3>
              </div>
            </div>

            {/* Content card on Right (and mobile title) */}
            <div className="relative pl-12 md:pl-4 pr-2 w-full">
              <div className="md:hidden block mb-3">
                <h3 className="text-lg font-display font-bold text-ink tracking-tight">
                  {item.title}
                </h3>
              </div>
              {item.content}
            </div>
          </div>
        ))}

        {/* Static vertical background track line */}
        <div
          style={{ height: `${height}px` }}
          className="absolute left-3.5 md:left-[30px] top-4 w-[2px] bg-gradient-to-b from-grid/20 via-grid/60 to-grid/20 [mask-image:linear-gradient(to_bottom,transparent_0%,black_5%,black_95%,transparent_100%)] pointer-events-none"
        >
          {/* Animated fill beam tracking scroll position */}
          <div
            style={{
              height: `${beamHeight}px`,
              opacity: beamOpacity,
              transition: "height 0.1s ease-out, opacity 0.2s ease-out",
            }}
            className="absolute inset-x-0 top-0 w-[2px] bg-gradient-to-b from-cyan-600 via-teal-500 to-emerald-500 rounded-full shadow-[0_0_10px_rgba(20,184,166,0.6)]"
          />
        </div>
      </div>

      {/* Technical footer note if provided */}
      {(footerNote || footerCoord) && (
        <div className="mt-8 pt-4 border-t border-grid flex items-center justify-between font-mono text-[11px] text-ink-soft">
          <span>{footerNote}</span>
          {footerCoord && <span className="hidden sm:inline">{footerCoord}</span>}
        </div>
      )}
    </div>
  );
}
