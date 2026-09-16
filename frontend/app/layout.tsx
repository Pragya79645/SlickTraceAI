import type { Metadata } from "next";
import { Roboto_Slab, Public_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

/**
 * Chart & Casefile Typographic System for SlickTrace AI (design.md)
 *
 * Roboto Slab    — Technical survey and stamped chart lettering (Display, H1, H2)
 * Public Sans    — Clean, high-legibility maritime documentation, body copy, and UI
 * IBM Plex Mono  — Strictly for telemetry data, coordinates, timestamps, MMSI, scores
 */

const robotoSlab = Roboto_Slab({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["700", "900"],
  display: "swap",
});

const publicSans = Public_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "SlickTrace AI — Maritime Spill Attribution",
  description:
    "Oil Spill Investigation & Attribution Platform — SAR detection, Lagrangian drift modelling, AIS vessel correlation",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${robotoSlab.variable} ${publicSans.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="h-full bg-paper text-ink">{children}</body>
    </html>
  );
}
