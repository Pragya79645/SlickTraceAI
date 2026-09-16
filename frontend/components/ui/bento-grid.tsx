import React from "react";
import { cn } from "@/lib/utils";

export const BentoGrid = ({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) => {
  return (
    <div
      className={cn(
        "grid grid-cols-1 md:grid-cols-3 gap-4 w-full",
        className
      )}
    >
      {children}
    </div>
  );
};

export const BentoGridItem = ({
  className,
  title,
  description,
  header,
  icon,
  tag,
  exhibit,
}: {
  className?: string;
  title?: string | React.ReactNode;
  description?: string | React.ReactNode;
  header?: React.ReactNode;
  icon?: React.ReactNode;
  tag?: string;
  exhibit?: string;
}) => {
  return (
    <div
      className={cn(
        "group/bento relative rounded-xs border border-grid/70 bg-paper-alt/30 hover:bg-paper-alt/50 backdrop-blur-xs p-5 transition-all duration-300 hover:border-grid-strong flex flex-col justify-between overflow-hidden",
        className
      )}
    >
      {/* Top Header / Visual Graphic */}
      {header && (
        <div className="w-full mb-4 overflow-hidden rounded-xs border border-grid/50 bg-paper/60">
          {header}
        </div>
      )}

      {/* Content */}
      <div className="flex flex-col flex-1 justify-between transition duration-200">
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              {icon && (
                <div className="text-ink transition-transform duration-200 group-hover/bento:scale-110">
                  {icon}
                </div>
              )}
              {exhibit && (
                <span className="font-mono text-[10px] text-ink-soft uppercase tracking-wider">
                  {exhibit}
                </span>
              )}
            </div>
            {tag && (
              <span className="font-mono text-[10px] text-ink-soft px-2 py-0.5 rounded-xs bg-paper border border-grid/60">
                {tag}
              </span>
            )}
          </div>

          <div className="font-display font-semibold text-base text-ink tracking-tight mt-2 mb-1.5 group-hover/bento:text-ink">
            {title}
          </div>

          <div className="font-body text-[13px] text-ink-soft leading-relaxed">
            {description}
          </div>
        </div>
      </div>
    </div>
  );
};
