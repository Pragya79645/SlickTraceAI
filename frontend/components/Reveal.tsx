"use client";

/**
 * Reveal — safe scroll reveal wrapper (visual-only).
 *
 * Safety: content is visible by default. The hidden pre-enter state is only
 * applied via JS after mount, and a fallback timer forces visibility even if
 * IntersectionObserver never fires (tab switch, re-render, hot reload).
 */

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

export default function Reveal({
  children,
  className = "",
  delay = 0,
  rotate = "0deg",
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  rotate?: string;
  as?: "div" | "section" | "span";
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [entered, setEntered] = useState(false);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    // Arm the hidden state only on the client after mount.
    setArmed(true);
    const el = ref.current;
    if (!el) {
      setEntered(true);
      return;
    }
    // Fallback: never leave content hidden.
    const fallback = window.setTimeout(() => setEntered(true), 1400 + delay);
    if (typeof IntersectionObserver === "undefined") {
      setEntered(true);
      return () => window.clearTimeout(fallback);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          window.setTimeout(() => setEntered(true), delay);
          observer.disconnect();
          window.clearTimeout(fallback);
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -4% 0px" }
    );
    observer.observe(el);
    const onVisible = () => {
      if (document.visibilityState === "visible") setEntered(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      observer.disconnect();
      window.clearTimeout(fallback);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [delay]);

  const style = { "--reveal-rot": rotate } as CSSProperties;
  const state = !armed || entered ? "entered" : "pre-enter";

  if (Tag === "section") {
    return (
      <section ref={ref as never} style={style} className={`reveal ${state} ${className}`}>
        {children}
      </section>
    );
  }
  return (
    <div ref={ref} style={style} className={`reveal ${state} ${className}`}>
      {children}
    </div>
  );
}
