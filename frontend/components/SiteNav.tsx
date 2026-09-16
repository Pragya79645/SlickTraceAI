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
    bgColor: "#E4E6DC",
    textColor: "#13212B",
    links: [
      { label: "How it works", href: "/#how-it-works", ariaLabel: "How SlickTrace works" },
      { label: "Capabilities", href: "/#capabilities", ariaLabel: "Platform capabilities" },
    ],
  },
  {
    label: "Investigate",
    bgColor: "#DDE3D8",
    textColor: "#13212B",
    links: [
      { label: "Upload a scene", href: "/investigate", ariaLabel: "Upload a satellite scene" },
      { label: "Demo case", href: "/dashboard", ariaLabel: "Open the SPILL-001 demo case" },
    ],
  },
  {
    label: "Method",
    bgColor: "#E8E6DA",
    textColor: "#13212B",
    links: [
      { label: "Model & metrics", href: "/#numbers", ariaLabel: "Model performance and metrics" },
      { label: "Limits & disclaimer", href: "/#method", ariaLabel: "Method limits and disclaimer" },
    ],
  },
];

export default function SiteNav() {
  return (
    <CardNav
      logo="/brand-logo-icon.png"
      logoAlt="SlickTrace AI — Detect, trace, attribute"
      items={ITEMS}
      baseColor="#EDEEE6"
      menuColor="#13212B"
      buttonBgColor="#13212B"
      buttonTextColor="#EDEEE6"
      ctaLabel="Start Investigation"
      ctaHref="/investigate"
      ease="power3.out"
      className="[&_.card-nav]:ring-1 [&_.card-nav]:ring-grid"
    />
  );
}
