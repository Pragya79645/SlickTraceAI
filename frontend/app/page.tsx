import type { Metadata } from "next";
import Landing from "@/components/Landing";

export const metadata: Metadata = {
  title: "SlickTrace AI — Marine Oil Spill Investigation & Attribution",
  description:
    "Detect oil slicks in satellite radar, reconstruct where the oil entered the water with Lagrangian drift physics and a 500-particle uncertainty ensemble, and correlate AIS traffic for explainable vessel attribution.",
};

export default function HomePage() {
  return <Landing />;
}
