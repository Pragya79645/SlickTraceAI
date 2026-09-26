import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  // Hides the dev-mode "N" badge (bottom-left) that next dev overlays on every
  // page — harmless for normal dev, but it sits in-frame for screen recordings.
  devIndicators: false,
};

export default nextConfig;

