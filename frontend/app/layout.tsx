import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

/**
 * Enterprise Typographic System for SlickTrace AI
 *
 * Plus Jakarta Sans — Crisp, modern executive headings (h1–h3)
 * Inter             — Clean, high-legibility UI, navigation, body copy, and badges
 * JetBrains Mono    — Telemetry data, coordinates, timestamps, MMSI codes, scores
 */

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
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
      className={`${plusJakartaSans.variable} ${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="h-full">{children}</body>
    </html>
  );
}
