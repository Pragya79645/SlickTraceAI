"use client";

/**
 * SiteNav — the floating CardNav configured for SlickTrace.
 *
 * Sits absolutely over the top of the page, so any page using it needs enough
 * top padding to clear a 60px pill at 1.2em/2em from the top.
 */

import CardNav, { type CardNavItem } from "@/components/CardNav";

const ITEMS: CardNavItem[] = [
  {
    label: "Platform",
    bgColor: "#141B2D",
    textColor: "#fff",
    links: [
      { label: "How it works", href: "/#how-it-works", ariaLabel: "How SlickTrace works" },
      { label: "Capabilities", href: "/#capabilities", ariaLabel: "Platform capabilities" },
    ],
  },
  {
    label: "Investigate",
    bgColor: "#1B2438",
    textColor: "#fff",
    links: [
      { label: "Upload a scene", href: "/investigate", ariaLabel: "Upload a satellite scene" },
      { label: "Demo case", href: "/dashboard", ariaLabel: "Open the SPILL-001 demo case" },
    ],
  },
  {
    label: "Method",
    bgColor: "#232C42",
    textColor: "#fff",
    links: [
      { label: "Model & metrics", href: "/#numbers", ariaLabel: "Model performance and metrics" },
      { label: "Limits & disclaimer", href: "/#method", ariaLabel: "Method limits and disclaimer" },
    ],
  },
];

export default function SiteNav() {
  return (
    <CardNav
      logo="/slicktrace-logo.svg"
      logoAlt="SlickTrace AI"
      items={ITEMS}
      baseColor="#0D1322"
      menuColor="#e2e8f0"
      buttonBgColor="#f59e0b"
      buttonTextColor="#0b1120"
      ctaLabel="Start Investigation"
      ctaHref="/investigate"
      ease="power3.out"
      className="[&_.card-nav]:ring-1 [&_.card-nav]:ring-white/10"
    />
  );
}
