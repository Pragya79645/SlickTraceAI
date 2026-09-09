"use client";

/**
 * SpillMap — Forensic Reconstruction, Dynamic AIS Trajectories & Ecological Threat Overlay
 *
 * Core Causal & Ecological Chain:
 *   ① observed slick → ② backward drift → ③ estimated source corridor → ④ AIS corridor match → ⑤ top candidate → ⑥ ecological screening
 *
 * Features:
 *   - Real chronological AIS vessel tracks from telemetry dataset
 *   - Translucent Hydrodynamic Uncertainty Source Corridor (-6h)
 *   - Closest approach distance vector connector line (e.g. 0.06 km)
 *   - Measured evidence markers (Speed Reduction, Closest Approach, Corridor Transit)
 *   - Sensitive Marine Habitats & Prototype Screening Radii (Phase 5E)
 *   - Investigation replay controller (-6h → now → +6h)
 *   - "Why #1?" Forensic callout card & explainable scoring breakdown
 */

import { useEffect, useRef, useState, useMemo } from "react";
import type { GeoTimestep, InvestigationResponse, CandidateVessel, HabitatImpact, RamsarThreatSite, SpillDetection } from "@/lib/api";
import { Leaf, Radar, TriangleAlert, X } from "lucide-react";
import { fetchRamsarGeoJSON } from "@/lib/api";

const METERS_PER_DEG_LAT = 111195; // matches backend drift_service.py

/**
 * Projects a Phase 1 pixel coordinate onto the map.
 *
 * The detection's own centroid is anchored at the observation coordinate, and pixel
 * offsets are scaled by the detection's real ground sample distance (area.gsd_m_per_pixel)
 * with a cos(latitude) correction on longitude — the same equirectangular projection the
 * backend drift model uses. Nothing here assumes a fixed scene size or resolution.
 */
function pixelToLatLon(
  px: number,
  py: number,
  detection: SpillDetection,
  anchorLat: number,
  anchorLon: number
): [number, number] {
  const gsd = detection.area.gsd_m_per_pixel;
  const cosLat = Math.max(Math.abs(Math.cos((anchorLat * Math.PI) / 180)), 1e-6);

  const dLat = (-(py - detection.centroid.pixel_y) * gsd) / METERS_PER_DEG_LAT;
  const dLon = ((px - detection.centroid.pixel_x) * gsd) / (METERS_PER_DEG_LAT * cosLat);

  return [anchorLat + dLat, anchorLon + dLon];
}

const RISK_COLORS: Record<string, string> = {
  HIGH: "#ef4444",
  MEDIUM: "#f59e0b",
  LOW: "#64748b",
};

const THREAT_COLORS: Record<string, { border: string; fill: string; badge: string }> = {
  HIGH: { border: "#f43f5e", fill: "#f43f5e33", badge: "bg-rose-950 text-rose-300 border-rose-700 font-bold" },
  MEDIUM: { border: "#f59e0b", fill: "#f59e0b22", badge: "bg-amber-950 text-amber-300 border-amber-700 font-bold" },
  LOW: { border: "#10b981", fill: "#10b98118", badge: "bg-emerald-950 text-emerald-300 border-emerald-800" },
};

interface SpillMapProps {
  data: InvestigationResponse;
  timelineIdx: number;
  selectedVesselId: string | null;
  onVesselSelect: (id: string | null) => void;
  onTimelineChange?: (idx: number) => void;
}

export default function SpillMap({
  data,
  timelineIdx,
  selectedVesselId,
  onVesselSelect,
  onTimelineChange,
}: SpillMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<import("leaflet").Map | null>(null);
  const slickMarkerRef = useRef<import("leaflet").CircleMarker | null>(null);
  const selectedVesselLayersRef = useRef<import("leaflet").LayerGroup | null>(null);
  
  // Layer group refs for toggling
  const spillLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const hindcastLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const forecastLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const vesselsLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const ramsarLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const uncertaintyLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const timelineEllipseRef = useRef<import("leaflet").Polygon | null>(null);

  const [layers, setLayers] = useState({
    spill: true,
    hindcast: true,
    forecast: true,
    vessels: true,
    ramsar: true,
    uncertainty: true,
  });

  const [isReplaying, setIsReplaying] = useState(false);
  const [showWhyCard, setShowWhyCard] = useState(true);

  const obsLat = data.drift.observation.latitude;
  const obsLon = data.drift.observation.longitude;
  const origin = data.drift.hindcast.estimated_origin;

  const topCandidate = data.attribution.candidate_vessels[0];
  const activeVesselId = selectedVesselId || topCandidate?.vessel_id || null;
  const activeVessel: CandidateVessel | undefined =
    data.attribution.candidate_vessels.find((v) => v.vessel_id === activeVesselId) ||
    topCandidate;
  const isTopActive = activeVessel?.vessel_id === topCandidate?.vessel_id;

  // Chronological timeline: −6h origin → observation → +6h forecast.
  // The backend orders hindcast.trajectory observation-first (k=0 is 0h, last is −6h),
  // so it is reversed here; forecast.trajectory[0] duplicates the observation and is skipped.
  const allTimelineSteps: GeoTimestep[] = useMemo(
    () => [
      ...[...data.drift.hindcast.trajectory].reverse(),
      ...data.drift.forecast.trajectory.slice(1),
    ],
    [data.drift.hindcast.trajectory, data.drift.forecast.trajectory]
  );
  const obsIndex = data.drift.hindcast.trajectory.length - 1;

  // Ensemble step matching a timeline index (same ordering as allTimelineSteps)
  const ensembleStepAt = (idx: number) => {
    const ens = data.drift.ensemble;
    if (!ens) return null;
    const H = ens.hindcast_steps.length;
    return idx < H ? ens.hindcast_steps[H - 1 - idx] : ens.forecast_steps[idx - H + 1] ?? null;
  };

  // ── Investigation Replay Sequencer ──────────────────────────────────────────
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isReplaying) {
      timer = setInterval(() => {
        if (!onTimelineChange) return;
        if (timelineIdx >= allTimelineSteps.length - 1) {
          setIsReplaying(false);
          onTimelineChange(obsIndex); // reset to observation
        } else {
          onTimelineChange(timelineIdx + 1);
        }
      }, 700);
    }
    return () => clearInterval(timer);
  }, [isReplaying, timelineIdx, allTimelineSteps.length, obsIndex, onTimelineChange]);

  // ── Map Initialization ──────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined" || !mapRef.current) return;

    let isCancelled = false;

    const initMap = async () => {
      const L = (await import("leaflet")).default;

      if (isCancelled || !mapRef.current) return;

      // Fix default icons
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((mapRef.current as any)._leaflet_id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (mapRef.current as any)._leaflet_id;
      }

      if (isCancelled || !mapRef.current) return;

      const map = L.map(mapRef.current, {
        center: [obsLat, obsLon],
        zoom: 12,
        zoomControl: false,
        attributionControl: true,
      });

      if (isCancelled) {
        map.remove();
        return;
      }

      // Add Zoom Control at bottom right
      L.control.zoom({ position: "bottomright" }).addTo(map);

      // Add Tile Layer
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
        crossOrigin: true, // lets the dossier exporter rasterise the map without tainting the canvas
      }).addTo(map);

      mapInstanceRef.current = map;

      // ── Layer Groups ────────────────────────────────────────────────────────
      const spillGroup = L.layerGroup().addTo(map);
      const hindcastGroup = L.layerGroup().addTo(map);
      const forecastGroup = L.layerGroup().addTo(map);
      const vesselsGroup = L.layerGroup().addTo(map);
      const ramsarGroup = L.layerGroup().addTo(map);
      const uncertaintyGroup = L.layerGroup().addTo(map);

      spillLayerRef.current = spillGroup;
      hindcastLayerRef.current = hindcastGroup;
      forecastLayerRef.current = forecastGroup;
      vesselsLayerRef.current = vesselsGroup;
      ramsarLayerRef.current = ramsarGroup;
      uncertaintyLayerRef.current = uncertaintyGroup;

      // ── ① OBSERVED SLICK EXTENT (Polygon + Badge) ───────────────────────────
      // A georeferenced scene ships real WGS84 vertices; otherwise project pixels around the anchor
      const polyLatLons: [number, number][] =
        data.detection.polygon_latlon && data.detection.polygon_latlon.length >= 3
          ? data.detection.polygon_latlon
          : data.detection.polygon.map(([px, py]) => pixelToLatLon(px, py, data.detection, obsLat, obsLon));

      L.polygon(polyLatLons, {
        color: "#f59e0b",
        fillColor: "#f59e0b",
        fillOpacity: 0.3,
        weight: 2.5,
        dashArray: "6 4",
      })
        .bindTooltip(
          "<b>① OBSERVED OIL SLICK</b><br>Detected via Sentinel-1 SAR YOLOv8 segmentation",
          { sticky: true }
        )
        .addTo(spillGroup);

      // Observed Slick Center Marker
      const obsIcon = L.divIcon({
        className: "",
        html: `
        <div style="position:relative;display:flex;align-items:center;justify-content:center;">
          <span style="position:absolute;width:30px;height:30px;border-radius:50%;background:#f59e0b44;animation:ping 2s infinite;"></span>
          <div style="width:22px;height:22px;border-radius:50%;background:#f59e0b;border:3px solid #fff;box-shadow:0 0 12px #f59e0b;display:flex;align-items:center;justify-content:center;color:#000;font-size:10px;font-weight:900;">
            ①
          </div>
        </div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      L.marker([obsLat, obsLon], { icon: obsIcon, zIndexOffset: 500 })
        .bindPopup(
          `<div style="font-family:monospace;font-size:12px;line-height:1.5">
            <b style="color:#f59e0b;font-size:13px">① OBSERVED OIL SLICK</b><br>
            <b>Status:</b> Satellite Detection Anchor (0h)<br>
            <b>Area:</b> ${data.detection.area.km2} km² · <b>Perimeter:</b> ${data.detection.perimeter.km} km<br>
            <b>Time:</b> ${new Date(data.drift.observation.timestamp).toUTCString()}<br>
            <b>Confidence:</b> ${(data.detection.confidence * 100).toFixed(2)}%
          </div>`
        )
        .addTo(spillGroup);

      // ── ② BACKWARD DRIFT TRAJECTORY (Hindcast Path) ──────────────────────────
      const hindcastCoords: [number, number][] =
        data.drift.hindcast.trajectory.map((p) => [p.lat, p.lon]);

      L.polyline(hindcastCoords, {
        color: "#818cf8",
        weight: 3.5,
        dashArray: "8 5",
        opacity: 0.95,
      })
        .bindTooltip(
          `<b>② BACKWARD DRIFT TRAJECTORY</b><br>Lagrangian advection: ${data.drift.hindcast.duration_hours}h backtrack along ocean current + wind`,
          { sticky: true }
        )
        .addTo(hindcastGroup);

      // Directional Flow Badge along Drift Path
      const midIdx = Math.floor(hindcastCoords.length / 2);
      const midPoint = hindcastCoords[midIdx];
      if (midPoint) {
        const flowIcon = L.divIcon({
          className: "",
          html: `<div style="background:#4338ca;color:#e0e7ff;padding:2px 6px;border-radius:6px;font-size:9px;font-weight:900;border:1px solid #6366f1;box-shadow:0 2px 6px #0008;white-space:nowrap;">
            DRIFT ${(data.drift.environment.drift.speed_ms * 1.94384).toFixed(1)} kts
          </div>`,
          iconSize: [120, 18],
          iconAnchor: [60, 9],
        });
        L.marker(midPoint, { icon: flowIcon, zIndexOffset: 200 }).addTo(hindcastGroup);
      }

      // ── ③ ESTIMATED SOURCE CORRIDOR (Origin Zone & Confidence Circle) ────────
      const originIcon = L.divIcon({
        className: "",
        html: `
        <div style="position:relative;display:flex;align-items:center;justify-content:center;">
          <span style="position:absolute;width:38px;height:38px;border-radius:50%;background:#ef444455;animation:pulse 1.5s infinite;"></span>
          <div style="width:26px;height:26px;border-radius:50%;background:#ef4444;border:3px solid #fff;box-shadow:0 0 16px #ef4444;display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:900;">
            ③
          </div>
        </div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const ensemble = data.drift.ensemble ?? null;
      const originStep = ensemble?.hindcast_steps.at(-1) ?? null;
      const origin80 = originStep?.ellipses.find((e) => e.confidence === 0.8) ?? null;

      L.marker([origin.lat, origin.lon], { icon: originIcon, zIndexOffset: 600 })
        .bindPopup(
          `<div style="font-family:monospace;font-size:12px;line-height:1.5">
            <b style="color:#ef4444;font-size:13px">③ ESTIMATED SOURCE CORRIDOR</b><br>
            <b>Reconstructed Time:</b> -${origin.hours_before_observation}h before detection<br>
            <b>Timestamp:</b> ${new Date(origin.timestamp).toUTCString()}<br>
            ${
              origin80 && ensemble
                ? `<b>80% Origin Band:</b> ${origin80.semi_major_km} × ${origin80.semi_minor_km} km (${origin80.area_km2} km²)<br>
                   <b>Method:</b> ${ensemble.n_particles}-particle Monte Carlo ensemble<br>`
                : `<b>Corridor Radius:</b> 2.5 km nominal envelope<br>`
            }
            <b>Geodesic Backtrack:</b> (${origin.lat.toFixed(4)}°N, ${origin.lon.toFixed(4)}°E)
          </div>`
        )
        .addTo(hindcastGroup);

      // ── MONTE CARLO UNCERTAINTY (corridor hull → 95/80/50 % bands → particle cloud) ──
      if (ensemble && originStep) {
        if (ensemble.origin_corridor.length >= 4) {
          L.polygon(ensemble.origin_corridor, {
            color: "#f97316",
            weight: 1.5,
            dashArray: "6 4",
            fillColor: "#f97316",
            fillOpacity: 0.06,
            interactive: true,
          })
            .bindTooltip(
              `<b>HINDCAST CORRIDOR</b><br>Convex hull of all ${ensemble.n_particles} particle paths over ${data.drift.hindcast.duration_hours}h backtrack`,
              { sticky: true }
            )
            .addTo(uncertaintyGroup);
        }

        const bandStyle: Record<number, { fill: number; weight: number }> = {
          0.95: { fill: 0.08, weight: 1 },
          0.8: { fill: 0.14, weight: 1.5 },
          0.5: { fill: 0.22, weight: 2 },
        };
        [...originStep.ellipses]
          .sort((a, b) => b.confidence - a.confidence) // draw widest first so tighter bands sit on top
          .forEach((e) => {
            const style = bandStyle[e.confidence] ?? { fill: 0.1, weight: 1 };
            L.polygon(e.polygon, {
              color: "#ef4444",
              weight: style.weight,
              fillColor: "#ef4444",
              fillOpacity: style.fill,
            })
              .bindTooltip(
                `<b>${Math.round(e.confidence * 100)}% ORIGIN PROBABILITY BAND</b><br>${e.semi_major_km} × ${e.semi_minor_km} km · ${e.area_km2} km² · axis ${e.orientation_deg}°`,
                { sticky: true }
              )
              .addTo(uncertaintyGroup);
          });

        ensemble.origin_particles.forEach(([plat, plon]) => {
          L.circleMarker([plat, plon], {
            radius: 1.6,
            stroke: false,
            fillColor: "#fca5a5",
            fillOpacity: 0.55,
            interactive: false,
          }).addTo(uncertaintyGroup);
        });

        // Timeline-synced band: follows the replay slider (updated in the timeline effect)
        const startStep = ensembleStepAt(obsIndex) ?? originStep;
        const start80 = startStep.ellipses.find((e) => e.confidence === 0.8) ?? startStep.ellipses[0];
        timelineEllipseRef.current = L.polygon(start80.polygon, {
          color: "#a78bfa",
          weight: 2,
          dashArray: "3 3",
          fillColor: "#a78bfa",
          fillOpacity: 0.18,
          interactive: false,
        }).addTo(uncertaintyGroup);
      } else {
        // No ensemble on this payload — fall back to a nominal envelope
        L.circle([origin.lat, origin.lon], {
          radius: 2500,
          color: "#ef4444",
          fillColor: "#ef4444",
          fillOpacity: 0.15,
          weight: 2,
          dashArray: "4 4",
        })
          .bindTooltip(`<b>Source Uncertainty Envelope (2.5 km nominal)</b>`, { sticky: true })
          .addTo(hindcastGroup);
      }

      // ── FORECAST DRIFT TRAJECTORY (+6h Outlook) ──────────────────────────────
      const forecastCoords: [number, number][] =
        data.drift.forecast.trajectory.map((p) => [p.lat, p.lon]);

      L.polyline(forecastCoords, {
        color: "#38bdf8",
        weight: 3,
        dashArray: "4 4",
        opacity: 0.9,
      })
        .bindTooltip(
          `<b>FORECAST DRIFT TRAJECTORY (+${data.drift.forecast.duration_hours}h)</b><br>Forward advection towards coastal sensitive habitats`,
          { sticky: true }
        )
        .addTo(forecastGroup);

      // Forecast endpoint marker
      const fEnd = forecastCoords[forecastCoords.length - 1];
      if (fEnd) {
        const fEndIcon = L.divIcon({
          className: "",
          html: `<div style="background:#0284c7;color:#fff;border-radius:50%;width:14px;height:14px;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:900;">
            +6
          </div>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        });
        L.marker(fEnd, { icon: fEndIcon, zIndexOffset: 250 })
          .bindTooltip(`<b>Forecast Endpoint (+6h)</b>`, { sticky: true })
          .addTo(forecastGroup);
      }

      // ── ④ & ⑤ AIS CANDIDATE VESSEL TRACKS & RANKED MARKERS ──────────────────
      data.attribution.candidate_vessels.forEach((vessel, idx) => {
        const isTop = idx === 0;
        const color = RISK_COLORS[vessel.risk] ?? "#64748b";

        // Draw Actual Historic AIS Track Line
        if (vessel.track && vessel.track.length > 1) {
          const trackCoords: [number, number][] = vessel.track.map((pt) => [
            pt.lat,
            pt.lon,
          ]);

          L.polyline(trackCoords, {
            color: isTop ? "#f59e0b" : color,
            weight: isTop ? 3.5 : 2,
            opacity: isTop ? 0.95 : 0.6,
            dashArray: isTop ? undefined : "3 3",
          })
            .bindTooltip(
              `<b>${vessel.vessel_name} (Rank #${idx + 1})</b><br>Score: <b>${vessel.score.toFixed(1)}/100</b> (${vessel.risk})<br>Min Dist to Origin: <b>${vessel.min_distance_km} km</b><br>Points in Window: ${vessel.track.length}`,
              { sticky: true }
            )
            .addTo(vesselsGroup);
        }

        // ── AIS SILENCE — dashed red segment across each anomalous gap ──────────
        (vessel.ais_gaps ?? []).forEach((gap) => {
          const dark = gap.spans_origin_time;
          const a: [number, number] = [gap.start_lat, gap.start_lon];
          const b: [number, number] = [gap.end_lat, gap.end_lon];
          const hhmm = (iso: string) => new Date(iso).toISOString().slice(11, 16);
          const label = `AIS SILENT ${hhmm(gap.start_timestamp)}–${hhmm(gap.end_timestamp)} UTC (${gap.duration_hours.toFixed(1)} h)`;

          L.polyline([a, b], {
            color: dark ? "#ef4444" : "#f97316",
            weight: dark ? 4 : 2.5,
            opacity: dark ? 0.95 : 0.7,
            dashArray: "10 8",
          })
            .bindTooltip(
              `<b style="color:${dark ? "#ef4444" : "#f97316"}">${label}</b><br>${vessel.vessel_name} — transponder gap ${dark ? "<b>spans the estimated discharge time</b>" : "outside the discharge window"}`,
              { sticky: true }
            )
            .addTo(vesselsGroup);

          const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
          const badge = L.divIcon({
            className: "",
            html: `<div style="background:${dark ? "#7f1d1d" : "#431407"};color:${dark ? "#fecaca" : "#fed7aa"};padding:2px 7px;border-radius:6px;font-size:9px;font-weight:900;border:1.5px solid ${dark ? "#ef4444" : "#f97316"};box-shadow:0 2px 8px #000a;white-space:nowrap;letter-spacing:0.03em;">
              ${label}
            </div>`,
            iconSize: [200, 18],
            iconAnchor: [100, 9],
          });
          L.marker(mid, { icon: badge, zIndexOffset: dark ? 520 : 300, interactive: false }).addTo(vesselsGroup);

          if (dark && gap.inferred_lat != null && gap.inferred_lon != null) {
            const inferred: [number, number] = [gap.inferred_lat, gap.inferred_lon];
            const qIcon = L.divIcon({
              className: "",
              html: `<div style="width:22px;height:22px;border-radius:50%;background:#ef4444;border:2.5px dashed #fff;box-shadow:0 0 14px #ef4444;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:12px;">?</div>`,
              iconSize: [22, 22],
              iconAnchor: [11, 11],
            });
            L.marker(inferred, { icon: qIcon, zIndexOffset: 560 })
              .bindTooltip(
                `<b style="color:#ef4444">INFERRED POSITION DURING SILENCE</b><br>Linear interpolation at the estimated discharge time<br>${gap.inferred_distance_km} km from reconstructed origin`,
                { sticky: true }
              )
              .addTo(vesselsGroup);
            L.polyline([inferred, [origin.lat, origin.lon]], {
              color: "#ef4444",
              weight: 1.5,
              opacity: 0.8,
              dashArray: "2 4",
              interactive: false,
            }).addTo(vesselsGroup);
          }
        });

        // Vessel Icon / Marker
        const primaryCoord: [number, number] =
          vessel.track && vessel.track.length > 0
            ? [
                (
                  vessel.track.find((p) => p.is_closest_approach) ||
                  vessel.track[Math.floor(vessel.track.length / 2)]
                ).lat,
                (
                  vessel.track.find((p) => p.is_closest_approach) ||
                  vessel.track[Math.floor(vessel.track.length / 2)]
                ).lon,
              ]
            : [obsLat + (idx + 1) * 0.015, obsLon + (idx + 1) * 0.015];

        const vIcon = L.divIcon({
          className: "",
          html: `
          <div style="
            width:${isTop ? "26px" : "20px"};
            height:${isTop ? "26px" : "20px"};
            border-radius:${isTop ? "6px" : "4px"};
            background:${isTop ? "#f59e0b" : color};
            border:2px solid #fff;
            box-shadow:0 0 ${isTop ? "14px #f59e0b" : "6px #000"};
            display:flex;align-items:center;justify-content:center;
            color:#000;font-weight:900;font-size:${isTop ? "11px" : "9px"};
            transform:rotate(45deg);
            cursor:pointer;
          ">
            <span style="transform:rotate(-45deg);">${isTop ? "1" : idx + 1}</span>
          </div>`,
          iconSize: [isTop ? 26 : 20, isTop ? 20 : 20],
          iconAnchor: [isTop ? 13 : 10, isTop ? 13 : 10],
        });

        const vMarker = L.marker(primaryCoord, { icon: vIcon, zIndexOffset: isTop ? 480 : 220 })
          .bindPopup(
            `<div style="font-family:monospace;min-width:240px;line-height:1.5;font-size:12px">
              <b style="font-size:13px">${isTop ? "⭐ #1 TOP SUSPECT: " : `#${idx + 1} `}${vessel.vessel_name}</b><br>
              <span style="color:${color};font-weight:bold">● ${vessel.risk} RISK</span>
              &nbsp; Score: <b>${vessel.score.toFixed(1)} / 100</b><br>
              <b>Min Distance to Origin:</b> ${vessel.min_distance_km} km<br>
              <b>Time Offset:</b> ${vessel.time_difference_hours}h<br>
              <hr style="margin:6px 0;border-color:#334155">
              <b>Measured AIS Evidence:</b><br>
              ${vessel.reasons.map((r) => `&bull; ${r}`).join("<br>")}
              <hr style="margin:6px 0;border-color:#334155">
              <small style="color:#94a3b8">Analytical ranking, not proof of responsibility.</small>
            </div>`
          )
          .addTo(vesselsGroup);

        vMarker.on("click", () => {
          onVesselSelect(vessel.vessel_id);
        });
      });

      // ── ⑥ SENSITIVE MARINE HABITATS & SCREENING RADII (Phase 5E) ────────────
      if (data.ecology && data.ecology.impacts) {
        data.ecology.impacts.forEach((imp: HabitatImpact) => {
          const conf = THREAT_COLORS[imp.threat_level] ?? THREAT_COLORS.LOW;
          const isThreatened = imp.threat_level === "HIGH";

          L.circle([imp.latitude, imp.longitude], {
            radius: imp.impact_radius_km * 1000,
            color: conf.border,
            fillColor: conf.fill,
            fillOpacity: isThreatened ? 0.22 : 0.08,
            weight: isThreatened ? 2.5 : 1.2,
            dashArray: isThreatened ? undefined : "4 4",
          })
            .bindTooltip(
              `<b>${imp.habitat_name}</b><br>Type: ${imp.type} · Radius: ${imp.impact_radius_km} km<br>Threat Level: <b>${imp.threat_level}</b><br>Min Forecast Dist: <b>${imp.minimum_distance_km} km</b>${
                imp.estimated_time_to_impact_hours !== null
                  ? `<br>Est. Exposure Time: <b>+${imp.estimated_time_to_impact_hours}h</b>`
                  : ""
              }`,
              { sticky: true }
            )
            .addTo(ramsarGroup);

          const habIcon = L.divIcon({
            className: "",
            html: `
            <div style="
              width:22px;height:22px;border-radius:50%;
              background:${isThreatened ? "#f43f5e" : "#059669"};
              border:2.5px solid #fff;box-shadow:0 0 10px ${conf.border};
              display:flex;align-items:center;justify-content:center;
              font-size:11px;cursor:pointer;
            ">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>
            </div>`,
            iconSize: [22, 22],
            iconAnchor: [11, 11],
          });

          L.marker([imp.latitude, imp.longitude], { icon: habIcon, zIndexOffset: 350 })
            .bindPopup(
              `<div style="font-family:monospace;min-width:260px;line-height:1.5;font-size:12px">
                <b style="font-size:13px;color:#10b981">SENSITIVE MARINE HABITAT</b><br>
                <b style="color:#fff">${imp.habitat_name}</b> (${imp.type})<br>
                <span style="color:${conf.border};font-weight:bold">● THREAT LEVEL: ${imp.threat_level}</span><br>
                <b>Screening Radius:</b> ${imp.impact_radius_km} km<br>
                <b>Min Forecast Distance:</b> ${imp.minimum_distance_km} km<br>
                ${
                  imp.estimated_time_to_impact_hours !== null
                    ? `<b>Estimated Exposure Window:</b> <span style="color:#f43f5e;font-weight:bold">+${imp.estimated_time_to_impact_hours} hours</span><br>`
                    : ""
                }
                <hr style="margin:6px 0;border-color:#334155">
                <b>Ecological Analysis:</b><br>
                <small style="color:#cbd5e1">${imp.reason}</small>
                <hr style="margin:6px 0;border-color:#334155">
                <small style="color:#94a3b8">Screening uses prototype proximity radii and drift forecast. Threat indicates potential exposure, not confirmed environmental damage.</small>
              </div>`
            )
            .addTo(ramsarGroup);
        });
      }

      // ── ⑥ AUTHORITATIVE RAMSAR WETLAND POLYGONS (GeoJSON Layer) ────────────
      try {
        const ramsarGeoJSON = await fetchRamsarGeoJSON();
        if (ramsarGeoJSON && ramsarGeoJSON.features && !isCancelled) {
          const threatsMap = new Map<string, RamsarThreatSite>();
          if (data.ecological_exposure?.threats) {
            data.ecological_exposure.threats.forEach((t: RamsarThreatSite) => {
              threatsMap.set(t.site_name.toLowerCase(), t);
            });
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          L.geoJSON(ramsarGeoJSON as any, {
            style: (feature) => {
              const name = feature?.properties?.name?.toLowerCase() || "";
              const matchedThreat = threatsMap.get(name);
              const isDirect = matchedThreat?.threat_level === "DIRECT_THREAT" || matchedThreat?.intersection;
              const isNear = matchedThreat?.threat_level === "NEAR_THREAT";

              return {
                color: isDirect ? "#f43f5e" : isNear ? "#f59e0b" : "#10b981",
                weight: isDirect ? 3 : isNear ? 2 : 1.2,
                fillColor: isDirect ? "#f43f5e" : isNear ? "#f59e0b" : "#10b981",
                fillOpacity: isDirect ? 0.45 : isNear ? 0.25 : 0.12,
                dashArray: isDirect ? undefined : "3 3",
              };
            },
            onEachFeature: (feature, layer) => {
              const props = feature.properties || {};
              const name = props.name || "Unnamed Ramsar Wetland";
              const state = props.state || "India";
              const matchedThreat = threatsMap.get(name.toLowerCase());
              const exposureBasis = matchedThreat?.exposure_basis || "NO_EXPOSURE";
              const distStr = matchedThreat ? `${matchedThreat.minimum_distance_km} km` : "N/A";

              let contactStr = "No Direct Boundary Contact";
              let exposureLabel = "NO EXPOSURE";
              let badgeColor = "#34d399";
              let badgeBg = "#064e3b";

              if (exposureBasis === "CURRENT_OBSERVATION") {
                contactStr = "Observed Spill Overlap (t=0h)";
                exposureLabel = "CURRENTLY INTERSECTED";
                badgeColor = "#fda4af";
                badgeBg = "#881337";
              } else if (exposureBasis === "FORECAST_INTERSECTION") {
                contactStr = `Estimated first contact: +${matchedThreat?.estimated_time_to_impact_hours}h`;
                exposureLabel = "FORECAST IMPACT";
                badgeColor = "#fda4af";
                badgeBg = "#881337";
              } else if (exposureBasis === "PROXIMITY_ONLY") {
                contactStr = `Proximity Approach (${distStr})`;
                exposureLabel = matchedThreat?.threat_level === "NEAR_THREAT" ? "◐ WITHIN 10 KM" : "◐ MONITORING";
                badgeColor = "#fcd34d";
                badgeBg = "#78350f";
              }

              const screeningDesc =
                exposureBasis === "CURRENT_OBSERVATION"
                  ? "Slick already overlaps surveyed boundary at t=0h"
                  : exposureBasis === "FORECAST_INTERSECTION"
                  ? `Trajectory enters polygon at +${matchedThreat?.estimated_time_to_impact_hours}h`
                  : `Nearest approach is ${distStr} (no polygon entry)`;

              layer.bindPopup(
                `<div style="font-family:monospace;min-width:280px;line-height:1.5;font-size:12px">
                  <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #334155;padding-bottom:4px;margin-bottom:6px;">
                    <b style="color:#10b981;font-size:13px">RAMSAR WETLAND</b>
                    <span style="font-size:10px;padding:2px 6px;border-radius:4px;font-weight:bold;background:${badgeBg};color:${badgeColor};">${exposureLabel}</span>
                  </div>
                  <b style="color:#fff;font-size:13px">${name}</b> <span style="color:#94a3b8">(${state})</span><br>
                  ${matchedThreat?.area_hectares ? `<b>Designated Area:</b> ${matchedThreat.area_hectares.toLocaleString()} ha<br>` : ""}
                  <b>Minimum Distance:</b> ${distStr}<br>
                  <b>Timing / Exposure:</b> ${contactStr}<br>
                  
                  <div style="margin:8px 0;padding:6px;background:#020617;border:1px solid #1e293b;border-radius:6px;font-size:11px;">
                    <span style="color:#f59e0b;font-weight:bold">① OBSERVATION:</span> Current spill detection anchor (0h)<br>
                    <span style="color:#38bdf8;font-weight:bold">② FORECAST:</span> +6h hydrodynamic drift path<br>
                    <span style="color:#10b981;font-weight:bold">③ SCREENING:</span> ${screeningDesc}
                  </div>

                  <small style="color:#cbd5e1">${
                    matchedThreat?.reason ||
                    "Official Ramsar boundary surveyed by MoEFCC / Bharatmaps."
                  }</small>
                  <hr style="margin:6px 0;border-color:#334155">
                  <small style="color:#94a3b8">Screening assessment based on physical drift trajectory and surveyed Ramsar polygons. Does not measure actual wildlife damage or confirm physical oil stranding.</small>
                </div>`
              );
            },
          }).addTo(ramsarGroup);
        }
      } catch (err) {
        console.warn("Could not load Ramsar GeoJSON layer:", err);
      }

      // ── Pulsing Timeline Slick Marker ───────────────────────────────────────
      const slickMarker = L.circleMarker([obsLat, obsLon], {
        radius: 8,
        color: "#38bdf8",
        fillColor: "#38bdf8",
        fillOpacity: 0.9,
        weight: 2,
      }).addTo(map);

      slickMarkerRef.current = slickMarker;

      // Fit map bounds cleanly around origin, slick, and relevant habitats
      const allLats = [
        ...hindcastCoords.map((p) => p[0]),
        ...forecastCoords.map((p) => p[0]),
      ];
      const allLons = [
        ...hindcastCoords.map((p) => p[1]),
        ...forecastCoords.map((p) => p[1]),
      ];
      if (data.ecology?.impacts) {
        data.ecology.impacts.slice(0, 3).forEach((h) => {
          allLats.push(h.latitude);
          allLons.push(h.longitude);
        });
      }

      const bounds = L.latLngBounds(
        [Math.min(...allLats) - 0.03, Math.min(...allLons) - 0.03],
        [Math.max(...allLats) + 0.03, Math.max(...allLons) + 0.03]
      );
      map.fitBounds(bounds, { padding: [35, 35] });
    };

    initMap();

    return () => {
      isCancelled = true;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [data]);

  // ── Highlight Active/Selected Vessel & Draw Forensic Connector Line ─────────
  useEffect(() => {
    if (!mapInstanceRef.current || !activeVessel) return;
    const map = mapInstanceRef.current;

    if (selectedVesselLayersRef.current) {
      selectedVesselLayersRef.current.clearLayers();
      map.removeLayer(selectedVesselLayersRef.current);
    }

    import("leaflet").then((L) => {
      const grp = L.layerGroup().addTo(map);
      selectedVesselLayersRef.current = grp;

      let closestLat = origin.lat;
      let closestLon = origin.lon;

      if (activeVessel.track && activeVessel.track.length > 0) {
        const closestPt =
          activeVessel.track.find((p) => p.is_closest_approach) ||
          activeVessel.track[Math.floor(activeVessel.track.length / 2)];
        closestLat = closestPt.lat;
        closestLon = closestPt.lon;

        activeVessel.track.forEach((pt) => {
          if (pt.is_speed_reduction) {
            const spdIcon = L.divIcon({
              className: "",
              html: `<div style="background:#ea580c;color:#fff;font-size:9px;font-weight:900;padding:2px 5px;border-radius:4px;border:1px solid #fed7aa;box-shadow:0 2px 6px #000a;white-space:nowrap;">
                SPEED DROP (${pt.sog_knots} kts)
              </div>`,
              iconSize: [110, 18],
              iconAnchor: [55, 9],
            });
            L.marker([pt.lat, pt.lon], { icon: spdIcon })
              .bindPopup(
                `<b>MEASURED SPEED REDUCTION ANOMALY</b><br>Speed dropped to <b>${pt.sog_knots} knots</b> near spill window.`
              )
              .addTo(grp);
          }
        });
      }

      // Draw dashed connector line between vessel track and origin
      const connector = L.polyline(
        [
          [origin.lat, origin.lon],
          [closestLat, closestLon],
        ],
        {
          color: "#f59e0b",
          weight: 2.5,
          dashArray: "4 4",
          opacity: 0.9,
        }
      ).addTo(grp);

      connector.bindTooltip(
        `<b>FORENSIC CORRELATION VECTOR</b><br>Min Geodesic Distance: <b>${activeVessel.min_distance_km} km</b><br>Temporal Offset: <b>${activeVessel.time_difference_hours}h</b>`,
        { sticky: true }
      );
    });
  }, [activeVessel, origin]);

  // ── Sync Layer Visibility Toggles ───────────────────────────────────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (spillLayerRef.current) {
      if (layers.spill && !map.hasLayer(spillLayerRef.current)) map.addLayer(spillLayerRef.current);
      else if (!layers.spill && map.hasLayer(spillLayerRef.current)) map.removeLayer(spillLayerRef.current);
    }
    if (hindcastLayerRef.current) {
      if (layers.hindcast && !map.hasLayer(hindcastLayerRef.current)) map.addLayer(hindcastLayerRef.current);
      else if (!layers.hindcast && map.hasLayer(hindcastLayerRef.current)) map.removeLayer(hindcastLayerRef.current);
    }
    if (forecastLayerRef.current) {
      if (layers.forecast && !map.hasLayer(forecastLayerRef.current)) map.addLayer(forecastLayerRef.current);
      else if (!layers.forecast && map.hasLayer(forecastLayerRef.current)) map.removeLayer(forecastLayerRef.current);
    }
    if (vesselsLayerRef.current) {
      if (layers.vessels && !map.hasLayer(vesselsLayerRef.current)) map.addLayer(vesselsLayerRef.current);
      else if (!layers.vessels && map.hasLayer(vesselsLayerRef.current)) map.removeLayer(vesselsLayerRef.current);
    }
    if (ramsarLayerRef.current) {
      if (layers.ramsar && !map.hasLayer(ramsarLayerRef.current)) map.addLayer(ramsarLayerRef.current);
      else if (!layers.ramsar && map.hasLayer(ramsarLayerRef.current)) map.removeLayer(ramsarLayerRef.current);
    }
    if (uncertaintyLayerRef.current) {
      if (layers.uncertainty && !map.hasLayer(uncertaintyLayerRef.current)) map.addLayer(uncertaintyLayerRef.current);
      else if (!layers.uncertainty && map.hasLayer(uncertaintyLayerRef.current)) map.removeLayer(uncertaintyLayerRef.current);
    }
  }, [layers]);

  // ── Sync Pulsing Marker + Uncertainty Band with Timeline Slider ─────────────
  useEffect(() => {
    if (!mapInstanceRef.current || !slickMarkerRef.current) return;
    const step = allTimelineSteps[timelineIdx];
    if (step) {
      slickMarkerRef.current.setLatLng([step.lat, step.lon]);
    }

    const ellipse = timelineEllipseRef.current;
    const ensStep = ensembleStepAt(timelineIdx);
    if (ellipse && ensStep) {
      const band = ensStep.ellipses.find((e) => e.confidence === 0.8) ?? ensStep.ellipses[0];
      ellipse.setLatLngs(band.polygon);
      const isHindcast = ensStep.hours_offset < 0;
      ellipse.setStyle({ color: isHindcast ? "#a78bfa" : "#38bdf8", fillColor: isHindcast ? "#a78bfa" : "#38bdf8" });
      ellipse.unbindTooltip().bindTooltip(
        `<b>80% POSITION BAND @ ${ensStep.hours_offset >= 0 ? "+" : ""}${ensStep.hours_offset}h</b><br>${band.semi_major_km} × ${band.semi_minor_km} km · spread ${ensStep.spread_km} km RMS`,
        { sticky: true }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timelineIdx, allTimelineSteps]);

  const topThreat = data.ecology?.impacts[0];
  const directRamsar = data.ecological_exposure?.threats.find(
    (t: RamsarThreatSite) => t.threat_level === "DIRECT_THREAT" || t.intersection
  );

  return (
    <div className="relative w-full h-full" id="slicktrace-map-capture">
      <div ref={mapRef} className="w-full h-full" />

      {/* ── Top Left: Layer Visibility Controls ──────────────────────────────── */}
      <div className="absolute top-3 left-3 z-[500] bg-slate-950/95 backdrop-blur-md border border-slate-700/80 rounded-xl p-2.5 shadow-2xl text-[11px] font-mono flex flex-wrap items-center gap-3">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pr-1 border-r border-slate-800">
          LAYERS
        </span>
        <label className="flex items-center gap-1.5 cursor-pointer hover:text-amber-300">
          <input
            type="checkbox"
            checked={layers.spill}
            onChange={(e) => setLayers((prev) => ({ ...prev, spill: e.target.checked }))}
            className="accent-amber-500 rounded"
          />
          <span>Spill</span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer hover:text-indigo-300">
          <input
            type="checkbox"
            checked={layers.hindcast}
            onChange={(e) => setLayers((prev) => ({ ...prev, hindcast: e.target.checked }))}
            className="accent-indigo-500 rounded"
          />
          <span>Hindcast</span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer hover:text-sky-300">
          <input
            type="checkbox"
            checked={layers.forecast}
            onChange={(e) => setLayers((prev) => ({ ...prev, forecast: e.target.checked }))}
            className="accent-sky-500 rounded"
          />
          <span>Forecast</span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer hover:text-amber-300">
          <input
            type="checkbox"
            checked={layers.vessels}
            onChange={(e) => setLayers((prev) => ({ ...prev, vessels: e.target.checked }))}
            className="accent-amber-500 rounded"
          />
          <span>Vessels</span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer hover:text-emerald-300 text-emerald-400 font-bold">
          <input
            type="checkbox"
            checked={layers.ramsar}
            onChange={(e) => setLayers((prev) => ({ ...prev, ramsar: e.target.checked }))}
            className="accent-emerald-500 rounded"
          />
          <span className="flex items-center gap-1"><Leaf size={11} strokeWidth={2} />Ramsar Sensitive Areas</span>
        </label>
        {data.drift.ensemble && (
          <label className="flex items-center gap-1.5 cursor-pointer hover:text-red-300 text-red-300 font-bold">
            <input
              type="checkbox"
              checked={layers.uncertainty}
              onChange={(e) => setLayers((prev) => ({ ...prev, uncertainty: e.target.checked }))}
              className="accent-red-500 rounded"
            />
            <span className="flex items-center gap-1"><Radar size={11} strokeWidth={2} />Uncertainty ({data.drift.ensemble.n_particles}-particle MC)</span>
          </label>
        )}
      </div>

      {/* ── Top Left Floating Causal Chain & Ecological Notice ───────────────── */}
      <div className="absolute top-14 left-3 z-[500] bg-slate-950/90 backdrop-blur-md border border-slate-700/80 rounded-xl p-3 shadow-2xl text-[10px] font-mono space-y-1.5 max-w-[310px]">
        <div className="flex items-center justify-between border-b border-slate-800 pb-1">
          <span className="font-bold text-amber-400">FORENSIC INVESTIGATION VIEW</span>
          <span className="text-[9px] text-slate-400">CHAIN OF CUSTODY</span>
        </div>

        <div className="text-slate-300 space-y-0.5">
          <div className="flex items-center gap-1.5 text-red-300 font-bold">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span>③ ESTIMATED SOURCE CORRIDOR</span>
          </div>
          <div className="text-[9px] text-slate-400">
            ~6h reconstructed position · ({origin.lat.toFixed(4)}°N, {origin.lon.toFixed(4)}°E)
          </div>
        </div>

        <div className="text-[9px] text-indigo-300 pt-1 border-t border-slate-800/80 flex items-center justify-between">
          <span>AIS SEARCH: ±6H · 30 KM RADIUS</span>
          <span className="text-emerald-400 font-bold">{data.ais_summary.unique_vessels} VESSELS</span>
        </div>

        {directRamsar ? (
          <div className="p-1.5 rounded bg-rose-950/80 border border-rose-700/80 text-[9px] text-rose-300 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping flex-none" />
            <span className="truncate">
              <strong>
                {directRamsar.exposure_basis === "CURRENT_OBSERVATION"
                  ? "CURRENT OVERLAP: "
                  : "FORECAST IMPACT: "}
              </strong>
              {directRamsar.site_name} (
              {directRamsar.exposure_basis === "CURRENT_OBSERVATION"
                ? "Observed Spill Overlap"
                : `+${directRamsar.estimated_time_to_impact_hours}h`}
              )
            </span>
          </div>
        ) : topThreat && topThreat.threat_level === "HIGH" ? (
          <div className="p-1.5 rounded bg-rose-950/80 border border-rose-700/80 text-[9px] text-rose-300 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping flex-none" />
            <span className="truncate">
              <strong>ECOLOGICAL ALERT:</strong> {topThreat.habitat_name} (+{topThreat.estimated_time_to_impact_hours}h)
            </span>
          </div>
        ) : null}
      </div>

      {/* ── Top Right: "WHY #1?" Map Callout ─────────────────────────────────── */}
      {showWhyCard && activeVessel && (
        <div className="absolute top-3 right-3 z-[500] bg-slate-900/95 backdrop-blur-md border-2 border-amber-500/80 rounded-xl p-3.5 shadow-2xl text-xs font-mono max-w-[320px] space-y-2 animate-in fade-in">
          <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
            <span className="font-black text-amber-400 tracking-wider text-[11px]">
              {isTopActive ? `WHY ${activeVessel.vessel_name} RANKS #1` : `SELECTED: ${activeVessel.vessel_name}`}
            </span>
            <button
              type="button"
              onClick={() => setShowWhyCard(false)}
              className="text-slate-500 hover:text-white text-[10px]"
            >
              <X size={12} strokeWidth={2.5} />
            </button>
          </div>

          <div className="space-y-1 text-[11px] text-slate-200">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Min Distance to Origin:</span>
              <strong className="text-emerald-400">{activeVessel.min_distance_km} km</strong>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Temporal Offset:</span>
              <strong className="text-indigo-300">{activeVessel.time_difference_hours}h</strong>
            </div>
            {activeVessel.went_dark && activeVessel.ais_gaps?.some((g) => g.spans_origin_time) && (() => {
              const g = activeVessel.ais_gaps!.find((x) => x.spans_origin_time)!;
              const hhmm = (iso: string) => new Date(iso).toISOString().slice(11, 16);
              return (
                <div className="p-1.5 rounded bg-red-950/70 border border-red-700 text-red-200">
                  <div className="font-black text-red-300 text-[10px] tracking-wider flex items-center gap-1"><TriangleAlert size={10} strokeWidth={2.5} />WENT DARK — AIS SILENT {hhmm(g.start_timestamp)}–{hhmm(g.end_timestamp)} UTC ({g.duration_hours.toFixed(1)} h)</div>
                  <div className="text-[10px] text-red-200/80">Silence spans the discharge time{g.inferred_distance_km != null ? ` · inferred path ${g.inferred_distance_km} km from origin` : ""}</div>
                </div>
              );
            })()}
            {!activeVessel.went_dark && (activeVessel.ais_gaps?.length ?? 0) > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-slate-400">AIS Gap:</span>
                <strong className="text-orange-300">{activeVessel.ais_gaps![0].duration_hours.toFixed(1)} h · outside window</strong>
              </div>
            )}
            {data.drift.ensemble && (
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Origin Probability Band:</span>
                <strong className={activeVessel.origin_band === "50%" ? "text-red-400" : activeVessel.origin_band ? "text-amber-300" : "text-slate-500"}>
                  {activeVessel.origin_band ? `inside ${activeVessel.origin_band}` : "outside 95%"}
                </strong>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Attribution Score:</span>
              <strong className="text-amber-400">{activeVessel.score.toFixed(1)} / 100 ({activeVessel.risk})</strong>
            </div>
          </div>

          {/* Mini Score Breakdown */}
          <div className="grid grid-cols-4 gap-1 text-[9px] text-center pt-1 border-t border-slate-800">
            <div className="p-1 rounded bg-slate-950 border border-slate-800">
              <span className="text-slate-500 block">PROX</span>
              <span className="font-bold text-emerald-400">{activeVessel.proximity_score}</span>
            </div>
            <div className="p-1 rounded bg-slate-950 border border-slate-800">
              <span className="text-slate-500 block">TEMP</span>
              <span className="font-bold text-indigo-400">{activeVessel.temporal_score}</span>
            </div>
            <div className="p-1 rounded bg-slate-950 border border-slate-800">
              <span className="text-slate-500 block">TRAJ</span>
              <span className="font-bold text-amber-400">{activeVessel.trajectory_score}</span>
            </div>
            <div className="p-1 rounded bg-slate-950 border border-slate-800">
              <span className="text-slate-500 block">BEH</span>
              <span className="font-bold text-orange-400">{activeVessel.behavioral_score}</span>
            </div>
          </div>

          <div className="pt-1 text-[9px] text-slate-400 leading-tight border-t border-slate-800/80">
            <strong>ANALYTICAL RANKING</strong> — NOT PROOF OF RESPONSIBILITY
          </div>
        </div>
      )}

      {/* ── Bottom Left: Investigation Map Legend & Step Sequence ─────────────── */}
      <div className="absolute bottom-3 left-3 z-[500] bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-xl p-3 shadow-2xl text-[11px] font-mono space-y-1.5 min-w-[250px]">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pb-1 border-b border-slate-800 flex items-center justify-between">
          <span>FORENSIC &amp; ECOLOGY MAP LEGEND</span>
        </div>
        <div className="flex items-center gap-2 text-slate-200">
          <span className="w-3 h-3 rounded-full bg-amber-400 border border-white flex-none" />
          <span>① Observed Slick (0h)</span>
        </div>
        <div className="flex items-center gap-2 text-indigo-300">
          <span className="w-4 h-0.5 border-t-2 border-dashed border-indigo-400 flex-none" />
          <span>② Backward Drift Path (-6h)</span>
        </div>
        <div className="flex items-center gap-2 text-red-300">
          <span className="w-3 h-3 rounded-full bg-red-500 border border-white flex-none shadow-sm shadow-red-500/80" />
          <span className="font-bold">③ Estimated Source Corridor</span>
        </div>
        <div className="flex items-center gap-2 text-amber-300 font-bold">
          <span className="w-3.5 h-3.5 rounded bg-amber-400 border border-white flex-none rotate-45" />
          <span>④ &amp; ⑤ Top Suspect Track (#1)</span>
        </div>
        <div className="flex items-center gap-2 text-emerald-300">
          <span className="w-3.5 h-3.5 rounded-full bg-emerald-700 border border-emerald-400 flex items-center justify-center text-[8px] flex-none">
            <Leaf size={11} strokeWidth={2} />
          </span>
          <span>⑥ Sensitive Habitats &amp; Radii ({data.ecology?.assessment.habitats_evaluated || 0})</span>
        </div>
        <div className="pt-1 text-[9px] text-slate-500 border-t border-slate-800/80">
          <i>Screening proximity model · Forecast-based</i>
        </div>
      </div>

      {/* ── Bottom Right: Replay Investigation Controller ───────────────────── */}
      <div className="absolute bottom-3 right-16 z-[500] bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-xl p-2 shadow-2xl flex items-center gap-2 font-mono text-xs">
        <button
          type="button"
          onClick={() => setIsReplaying(!isReplaying)}
          className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition-all shadow-md shadow-amber-500/20 flex items-center gap-1.5 cursor-pointer"
        >
          <span>{isReplaying ? "⏸ PAUSE" : "▶ REPLAY INVESTIGATION"}</span>
        </button>
        <span className="text-[10px] text-slate-400 hidden sm:inline">
          -6h → Now → +6h
        </span>
      </div>
    </div>
  );
}
