import type { Metadata } from "next";
import StartInvestigation from "@/components/StartInvestigation";

export const metadata: Metadata = {
  title: "New Investigation | SlickTrace AI",
  description:
    "Upload a SAR or EO satellite scene to run live YOLOv8 segmentation, drift reconstruction, AIS vessel attribution and ecological exposure screening.",
};

export default function InvestigatePage() {
  return <StartInvestigation />;
}
