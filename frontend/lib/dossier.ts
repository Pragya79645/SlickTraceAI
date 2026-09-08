/**
 * Forensic dossier export — a one-click PDF an enforcement officer can attach to a
 * MARPOL Annex I notice. Built client-side so the map the investigator is looking at
 * (tiles, tracks, uncertainty bands) is captured exactly as rendered.
 *
 * Libraries are imported lazily: jsPDF and html2canvas are browser-only.
 */

import type { InvestigationResponse, CandidateVessel } from "@/lib/api";

const MAP_CAPTURE_ID = "slicktrace-map-capture";

const A4 = { w: 210, h: 297 };
const MARGIN = 14;
const CONTENT_W = A4.w - MARGIN * 2;

const hhmm = (iso: string) => {
  try {
    return new Date(iso).toISOString().slice(11, 16);
  } catch {
    return iso;
  }
};
const utc = (iso: string) => {
  try {
    return new Date(iso).toUTCString().replace("GMT", "UTC");
  } catch {
    return iso;
  }
};

async function captureMap(): Promise<string | null> {
  const el = document.getElementById(MAP_CAPTURE_ID);
  if (!el) return null;
  try {
    const { default: html2canvas } = await import("html2canvas");
    const canvas = await html2canvas(el, {
      useCORS: true,
      allowTaint: false,
      backgroundColor: "#0f172a",
      scale: 2,
      logging: false,
      // Leaflet's floating overlays sit above the tiles; keep them — they are the evidence
    });
    return canvas.toDataURL("image/jpeg", 0.9);
  } catch {
    return null;
  }
}

export async function exportForensicDossier(data: InvestigationResponse): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const mapImage = await captureMap();

  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const generated = new Date().toUTCString().replace("GMT", "UTC");
  const { detection, drift, attribution } = data;
  const top = attribution.candidate_vessels[0];
  const origin = drift.hindcast.estimated_origin;
  const band80 = drift.ensemble?.hindcast_steps.at(-1)?.ellipses.find((e) => e.confidence === 0.8);

  let y = MARGIN;
  let page = 1;

  const footer = () => {
    doc.setFontSize(7.5);
    doc.setTextColor(120);
    doc.text(
      `SlickTrace AI · Investigation ${data.spill_id} · generated ${generated} · analytical ranking, not proof of responsibility`,
      MARGIN,
      A4.h - 8
    );
    doc.text(`Page ${page}`, A4.w - MARGIN, A4.h - 8, { align: "right" });
    doc.setTextColor(0);
  };
  const newPage = () => {
    footer();
    doc.addPage();
    page += 1;
    y = MARGIN;
  };
  const ensure = (needed: number) => {
    if (y + needed > A4.h - 16) newPage();
  };
  const h1 = (t: string) => {
    ensure(12);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text(t, MARGIN, y);
    y += 7;
    doc.setDrawColor(200);
    doc.line(MARGIN, y, A4.w - MARGIN, y);
    y += 5;
  };
  const h2 = (t: string) => {
    ensure(10);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.text(t.toUpperCase(), MARGIN, y);
    y += 5.5;
  };
  const para = (t: string, size = 9) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(t, CONTENT_W) as string[];
    ensure(lines.length * (size * 0.42) + 2);
    doc.text(lines, MARGIN, y);
    y += lines.length * (size * 0.42) + 2;
  };
  const kv = (rows: [string, string][]) => {
    doc.setFontSize(9);
    rows.forEach(([k, v]) => {
      ensure(5.5);
      doc.setFont("helvetica", "bold");
      doc.text(k, MARGIN, y);
      doc.setFont("helvetica", "normal");
      const lines = doc.splitTextToSize(v, CONTENT_W - 58) as string[];
      doc.text(lines, MARGIN + 58, y);
      y += Math.max(1, lines.length) * 4.3 + 1;
    });
    y += 2;
  };
  const bullet = (items: string[], size = 8.5) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(size);
    items.forEach((it) => {
      const lines = doc.splitTextToSize(it, CONTENT_W - 6) as string[];
      ensure(lines.length * (size * 0.42) + 1);
      doc.text("•", MARGIN + 1, y);
      doc.text(lines, MARGIN + 5, y);
      y += lines.length * (size * 0.42) + 1;
    });
    y += 2;
  };

  // ── Page 1: cover + executive summary ─────────────────────────────────────
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, A4.w, 34, "F");
  doc.setTextColor(255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("MARINE OIL SPILL — FORENSIC ATTRIBUTION DOSSIER", MARGIN, 15);
  doc.setFontSize(9.5);
  doc.setFont("helvetica", "normal");
  doc.text(`Case ${data.spill_id} · SlickTrace AI · SAR detection → drift hindcast → AIS attribution → ecological exposure`, MARGIN, 22);
  doc.text(`Generated ${generated}`, MARGIN, 28);
  doc.setTextColor(0);
  y = 44;

  h2("Executive summary");
  para(
    `A ${detection.area.km2.toFixed(2)} km² oil slick was detected in satellite imagery at ${utc(detection.timestamp)} ` +
      `(segmentation confidence ${(detection.confidence * 100).toFixed(1)}%). Lagrangian hindcast using ` +
      `${drift.environment.source === "open_meteo" ? drift.environment.provider_detail ?? "Open-Meteo reanalysis" : "regional prototype"} current and wind fields ` +
      `places the discharge origin at ${origin.lat.toFixed(4)}°N, ${origin.lon.toFixed(4)}°E approximately ` +
      `${origin.hours_before_observation} h before observation (${utc(origin.timestamp)})` +
      (band80 ? `, within an 80% probability band of ${band80.area_km2} km² (${band80.semi_major_km} × ${band80.semi_minor_km} km).` : ".") +
      (top
        ? ` AIS correlation of ${attribution.candidate_vessels.length} vessel track(s) ranks ${top.vessel_name} (MMSI ${top.vessel_id}` +
          `${top.flag ? `, ${top.flag} flag` : ""}${top.vessel_type ? `, ${top.vessel_type}` : ""}) as the primary lead with an attribution score of ` +
          `${top.score.toFixed(1)}/100 (${top.risk} risk)${top.went_dark ? " — the vessel's AIS transponder was SILENT across the estimated discharge time" : ""}.`
        : " No vessel track fell within the origin search radius.")
  );

  h2("Key findings");
  kv([
    ["Detected slick area", `${detection.area.km2.toFixed(4)} km² · perimeter ${detection.perimeter.km.toFixed(2)} km · elongation ${detection.elongation_ratio}`],
    ["Observation", `${utc(detection.timestamp)} at ${drift.observation.latitude.toFixed(5)}°N, ${drift.observation.longitude.toFixed(5)}°E (${drift.observation.coordinate_source})`],
    ["Reconstructed origin", `${origin.lat.toFixed(5)}°N, ${origin.lon.toFixed(5)}°E · ${utc(origin.timestamp)} (−${origin.hours_before_observation} h)`],
    ...(band80 ? [["Origin uncertainty", `80% band ${band80.area_km2} km² (${band80.semi_major_km} × ${band80.semi_minor_km} km, axis ${band80.orientation_deg}°) · ${drift.ensemble?.n_particles}-particle Monte Carlo`] as [string, string]] : []),
    ...(detection.bonn_volume
      ? [["Estimated volume", `${detection.bonn_volume.volume_tonnes_min}–${detection.bonn_volume.volume_tonnes_max} t (${detection.bonn_volume.volume_m3_min}–${detection.bonn_volume.volume_m3_max} m³), Bonn code ${detection.bonn_volume.appearance_code} "${detection.bonn_volume.appearance_label}" assumed`] as [string, string]]
      : []),
    ["Primary lead", top ? `${top.vessel_name} · MMSI ${top.vessel_id}${top.flag ? ` · ${top.flag}` : ""}${top.vessel_type ? ` · ${top.vessel_type}` : ""} · score ${top.score.toFixed(1)}/100 · ${top.risk} risk` : "none"],
    ["Ecological priority", data.ecology ? `${data.ecology.assessment.response_priority} — ${data.ecology.assessment.threatened_habitats} of ${data.ecology.assessment.habitats_evaluated} habitats threatened` : "not screened"],
    ...(data.ecological_exposure
      ? [["Ramsar exposure", `${data.ecological_exposure.response_priority} · ${data.ecological_exposure.direct_threats_count} direct / ${data.ecological_exposure.near_threats_count} near threats across ${data.ecological_exposure.sites_analyzed} sites${data.ecological_exposure.nearest_site ? ` · nearest ${data.ecological_exposure.nearest_site.site_name} (${data.ecological_exposure.nearest_site.minimum_distance_km} km)` : ""}`] as [string, string]]
      : []),
  ]);

  // ── Page 2: map ────────────────────────────────────────────────────────────
  newPage();
  h1("Forensic reconstruction map");
  if (mapImage) {
    const props = doc.getImageProperties(mapImage);
    const w = CONTENT_W;
    const h = Math.min((props.height / props.width) * w, A4.h - y - 40);
    doc.addImage(mapImage, "JPEG", MARGIN, y, w, h);
    y += h + 4;
    para(
      "Observed slick (amber), backward drift trajectory (dashed indigo), reconstructed origin (red) with 50/80/95% Monte Carlo " +
        "probability bands, hindcast corridor hull (orange), forecast trajectory (cyan), AIS candidate tracks with closest-approach and " +
        "AIS-silence markers, and Ramsar sensitive-site layer as rendered at export time.",
      8
    );
  } else {
    para("Map capture unavailable in this session (the map must be visible on screen when exporting).");
  }

  // ── Page 3: attribution ────────────────────────────────────────────────────
  newPage();
  h1("Vessel attribution — ranked candidates");
  para(
    `Scoring matrix (100 pts): proximity to origin ${attribution.method.proximity_weight} · temporal overlap ${attribution.method.temporal_weight} · ` +
      `trajectory corridor ${attribution.method.trajectory_weight} · behavioural anomalies ${attribution.method.behavioral_weight} ` +
      `(speed reduction, anomalous AIS silence). Evidence interpolated across an AIS silence is discounted relative to measured fixes.`,
    8.5
  );

  const cols = [8, 46, 24, 20, 14, 14, 14, 14, 16, 16];
  const heads = ["#", "Vessel", "MMSI", "Min dist", "Δt (h)", "Prox", "Temp", "Traj", "Behav", "Score"];
  const drawRow = (cells: string[], bold = false, fill?: [number, number, number]) => {
    ensure(6.5);
    if (fill) {
      doc.setFillColor(...fill);
      doc.rect(MARGIN, y - 3.8, CONTENT_W, 5.6, "F");
    }
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(8);
    let x = MARGIN + 1;
    cells.forEach((c, i) => {
      doc.text(c, x, y);
      x += cols[i];
    });
    y += 5.6;
  };
  drawRow(heads, true, [226, 232, 240]);
  attribution.candidate_vessels.forEach((v: CandidateVessel, i: number) => {
    drawRow(
      [
        String(i + 1),
        `${v.vessel_name}${v.went_dark ? " ⚠DARK" : ""}`,
        v.vessel_id,
        `${v.min_distance_km} km`,
        String(v.time_difference_hours),
        String(v.proximity_score),
        String(v.temporal_score),
        String(v.trajectory_score),
        String(v.behavioral_score),
        `${v.score.toFixed(1)} ${v.risk}`,
      ],
      i === 0,
      i === 0 ? [254, 243, 199] : undefined
    );
  });
  y += 4;

  attribution.candidate_vessels.slice(0, 3).forEach((v, i) => {
    h2(`#${i + 1} ${v.vessel_name} — evidence`);
    const items = [...v.reasons];
    if (v.origin_band) items.push(`Closest approach lies inside the ${v.origin_band} Monte Carlo origin band`);
    (v.ais_gaps ?? []).forEach((g) =>
      items.push(
        `AIS ${g.spans_origin_time ? "SILENT" : "gap"} ${hhmm(g.start_timestamp)}–${hhmm(g.end_timestamp)} UTC (${g.duration_hours} h)` +
          (g.spans_origin_time ? ` spanning the discharge time; interpolated position ${g.inferred_distance_km} km from origin` : " outside the discharge window")
      )
    );
    bullet(items);
  });

  // ── Page 4: method, environment, limitations ───────────────────────────────
  newPage();
  h1("Method, data provenance & limitations");
  h2("Detection");
  kv([
    ["Model", "YOLOv8-seg instance segmentation (oilspill_yolov8_seg_best.pt); whole scenes inferred as overlapping 256-px tiles with a dark-spot (backscatter damping) gate"],
    ["Age estimate", `${detection.age_estimate.category} — ${detection.age_estimate.method} (${detection.age_estimate.scientific_status})`],
  ]);
  h2("Drift reconstruction");
  kv([
    ["Model", `${drift.method.type}: ${drift.method.formula}`],
    ["Forcing", `${drift.environment.source}${drift.environment.provider_detail ? ` — ${drift.environment.provider_detail}` : ""}${drift.environment.valid_time ? ` valid ${drift.environment.valid_time}` : ""}`],
    ["Current / wind", `u=${drift.environment.current.u_ms} v=${drift.environment.current.v_ms} m/s · wind u=${drift.environment.wind.u_ms} v=${drift.environment.wind.v_ms} m/s · wind factor ${drift.environment.wind_factor}`],
    ["Horizon", `${drift.hindcast.duration_hours} h hindcast / ${drift.forecast.duration_hours} h forecast at ${drift.hindcast.step_minutes}-min steps`],
    ...(drift.ensemble ? [["Ensemble", `${drift.ensemble.n_particles} particles (seed ${drift.ensemble.seed}); ${drift.ensemble.method}`] as [string, string]] : []),
  ]);
  if (drift.ensemble) {
    h2("Ensemble perturbations");
    bullet(Object.entries(drift.ensemble.perturbations).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`));
  }
  h2("Limitations");
  bullet([...drift.prototype_limitations, ...(drift.ensemble?.limitations ?? []), ...(data.ecology?.prototype_limitations ?? [])]);
  h2("Disclaimer");
  para(
    "This dossier is an analytical reconstruction to prioritise investigative effort. Attribution scores rank the consistency of " +
      "vessel movements with the reconstructed discharge; they are not proof of responsibility. Confirmation requires oil " +
      "fingerprinting, vessel inspection, and corroborating records under MARPOL Annex I procedures. " +
      (data.ecological_exposure?.disclaimer ?? ""),
    8
  );
  footer();

  doc.save(`SlickTrace_Dossier_${data.spill_id}_${new Date().toISOString().slice(0, 10)}.pdf`);
}
