import type { Metadata } from "next";
import StartInvestigation from "@/components/StartInvestigation";

export const metadata: Metadata = {
  title: "SlickTrace AI — Marine Oil Spill Investigation & Attribution",
  description:
    "Detect suspicious oil slicks via SAR/EO imagery, reconstruct origins using Lagrangian ocean drift modeling, and correlate AIS movement for explainable vessel attribution.",
};

export default function HomePage() {
  return <StartInvestigation />;
}
