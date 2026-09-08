# SlickTrace AI — SIH 2026 upgrade notes (9 Sep 2026)

Everything below is implemented and verified end-to-end. Read the **"What a judge will ask"**
section before the demo.

## Running it

```powershell
# backend (from backend/)
slicktrace-env\Scripts\uvicorn app.main:app --port 8000 --reload
# frontend (from frontend/)
pnpm dev
```

`backend/requirements.txt` now lists every real dependency (`ultralytics`, `opencv-python`,
`numpy`, `shapely`, `rasterio`, `python-multipart`, …); a fresh `pip install -r` works.

Set `SLICKTRACE_OFFLINE=1` before starting the backend if the venue network is unreliable —
Open-Meteo lookups are skipped and cached / regional fallback values are used, with the
provenance shown on screen.

## Phase 1 — credibility

| Item | Where | Notes |
|---|---|---|
| Realistic Indian MMSIs, vessel types, flag state | `data/demo/ais_*.csv`, `ais_service.flag_from_mmsi` | MIDs 419 (India) plus a few Panama / Singapore / Liberia / Marshall Is. / Hong Kong flags, as real Mumbai traffic has. Score-neutral (verified). |
| Real currents & wind | `environment_service.py` | Open-Meteo **Marine** (surface current) + **Forecast / ERA5 archive** (10 m wind), chosen by date. Every response cached in `data/environment/cache/`. Direction conventions handled (currents *toward*, wind *from*). Chain: operator override file → Open-Meteo → regional grid → generic. |
| Auto-georeferencing | `georef_service.py`, `/analyze` | GeoTIFF CRS + affine read with rasterio, masks mapped to WGS84, acquisition time from `TIFFTAG_DATETIME` or the Sentinel product name, slick centroid becomes the scene anchor and the whole chain runs in one request. Upload cap raised to 500 MB. |

## Phase 2 — wow

| Item | Where | Notes |
|---|---|---|
| Monte Carlo uncertainty | `drift_service.compute_ensemble` | 500 particles, perturbed current/wind/wind-factor + eddy diffusion (K = 10 m²/s). Output: 50/80/95 % ellipses per timestep, origin particle cloud, corridor hull. Map layer "Uncertainty"; the 80 % band follows the replay slider. Candidates are tagged with the tightest band containing their closest approach (`origin_band`). |
| "Went dark" detection | `ais_service.detect_ais_gaps` | Gap threshold is **relative to the vessel's own cadence** (max(2 h, 3 × median interval)) so sparse reporters aren't flagged. A gap spanning the discharge time → `went_dark`, +8 behavioural pts, position interpolated across the silence and scored at a **15 % discount** vs measured fixes (only used if it scores higher). Map: dashed red segment, "AIS SILENT hh:mm–hh:mm" badge, "?" inferred-position marker. |
| New scenario **SPILL-TEST-003** | `data/demo/ais_test_scenario_003.csv` | MT JALDHARA never reports near the origin; only its 3 h silence + interpolated path identifies it (80.0 HIGH) over MV GODAVARI STAR, a continuous-AIS decoy 3.5 km away (68.8 MEDIUM). MT NARMADA SPIRIT has a gap that does **not** span the discharge — flagged but not dark. |

## Phase 3 — polish

| Item | Where |
|---|---|
| Model card (real checkpoint metrics, per-epoch curve) | `GET /api/investigations/model/metrics`, `ModelMetricsPanel.tsx` — shown in the upload flow and Story Mode stage 1 |
| Mask overlay on the scene | `AnalysisResponse.overlay_image` / `preview_image` (JPEG data URLs, never persisted) |
| Bonn Agreement volume bracket | `volume_service.py` — code 3 "Metallic" (5–50 µm) assumed by default; pass `appearance_code` (1–5) to `/analyze` |
| Forensic dossier PDF | `lib/dossier.ts` — captures the live Leaflet map, 4-page A4 dossier with findings, ranked candidates, evidence, method, limitations, disclaimer |

## Things fixed along the way

* Timeline slider/replay iterated the hindcast in the wrong order (labelled "observation" while parked on the −6 h origin). Fixed in `Dashboard.tsx` and `SpillMap.tsx`.
* Map georeferencing of the slick polygon assumed a 256-px scene and one degree-scale for both axes; it now anchors the detection centroid with the real GSD and a cos(lat) correction.
* Stale `phase3_vessel_attribution_SPILL-001.json` regenerated from the live scorer.
* Live-investigation store capped at 25 records.

## The model — read this before the demo

`oilspill_yolov8_seg_best.pt` is YOLOv8**n**-seg, 30 epochs at 256 px, mask mAP50 **0.66**,
precision **0.78**, recall **0.56**. Those are the checkpoint's own numbers; the UI shows them.

Empirically the model segments **bright** objects on a **flat dark** background. Raw SAR has
oil **dark** on textured sea, so for GeoTIFF input the backend now: Lee-filters (7×7) →
stretches → **inverts** → pushes sea clutter to black (`dark_spot_enhance`, p75→0, p99.5→255),
infers on **256-px tiles** (the training scale) with a ≥ 0.30 confidence floor, rejects
whole-tile masks, and applies a physical **≥ 2 dB backscatter-damping gate** measured on the
true radiometry. Previews show the true radiometry; the model never sees it.

On the bundled synthetic Sentinel-1-style scene
(`data/demo/S1A_IW_GRDH_1SDV_20260828T210213_MUMBAI_SYNTHETIC.tif`) this recovers the
planted 6 km × 1.2 km slick at 0.87 confidence with the centroid within ~250 m, and zero
false positives. **It has not yet been run on a real Sentinel-1 scene** — that is the single
most valuable remaining step. Get one from the Copernicus Browser over Indian waters (the
MSC ELSA 3 sinking off Kochi, May 2025, is a candidate — verify), drop it on the upload page,
and tune `TILE_CONF_FLOOR` / `MIN_DAMPING_DB` in `inference_service.py` if needed.

Plain PNG/JPEG uploads are still fed to the model **as-is** (single pass). If your own SAR
crops are true-radiometry (dark oil) and detection looks wrong, that is why.

## What a judge will ask

* *"Where do the coordinates come from?"* — From the GeoTIFF's embedded CRS/transform; the
  slick centroid anchors the drift model. Manual entry remains for plain images.
* *"Which current model?"* — Open-Meteo Marine + ERA5 (shown with valid time on screen);
  regional fallback is labelled as such.
* *"How accurate is the detector?"* — Model card on screen; recall 0.56 means it favours
  missing faint slicks over false alarms; the dark-spot gate removes texture false positives.
* *"Why is the origin a line?"* — It isn't: 500-particle ensemble, 80 % band ~25 km² at −6 h.
* *"What if the ship switched AIS off?"* — Scenario 3. Cadence-relative silence detection and
  interpolated position, explicitly discounted as inferred evidence.
* *"Is this proof?"* — No; every screen and the dossier say "analytical ranking, not proof".
