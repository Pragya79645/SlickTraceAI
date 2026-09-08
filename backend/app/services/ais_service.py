"""
AIS Service — Live AIS vessel tracking, spatio-temporal correlation, and explainable attribution.

Loads and parses AIS telemetry dataset (MMSI, vessel_name, timestamp, lat, lon, SOG, COG, heading),
calculates geodesic distance to reconstructed origin, temporal delta, trajectory corridor overlap,
and behavioural anomalies (speed drops, transmission gaps, course anomalies).
"""

from __future__ import annotations

import csv
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import shapely.geometry

from app.schemas.investigation import (
    AISGap,
    AISTrackPoint,
    AttributionWeights,
    CandidateVessel,
    EnsembleEllipse,
    ReconstructedOrigin,
    VesselAttribution,
)

_BASE = Path(__file__).resolve().parents[2]   # …/backend
AIS_CSV_PATH = _BASE / "data" / "demo" / "ais_demo_dataset.csv"

# ─── "Went dark" detection ────────────────────────────────────────────────────
# A gap is only anomalous relative to how often the vessel normally reports:
# a ship pinging every 2 h is sparse, not silent. Threshold = max(absolute floor,
# CADENCE_MULTIPLIER × the vessel's median reporting interval).
MIN_GAP_HOURS = 2.0
CADENCE_MULTIPLIER = 3.0
# Evidence reconstructed by interpolating across a silence is weaker than a measured
# fix, so proximity/temporal/trajectory scores derived from it are discounted.
INFERRED_EVIDENCE_FACTOR = 0.85

# ─── MMSI Maritime Identification Digits → flag state ─────────────────────────
# The first three digits of an MMSI identify the flag administration (ITU-R M.585).
# Only the MIDs that appear in regional traffic are listed; unknown MIDs return None.

MID_FLAGS: Dict[str, str] = {
    "419": "India",
    "351": "Panama", "352": "Panama", "353": "Panama", "354": "Panama",
    "355": "Panama", "356": "Panama", "357": "Panama",
    "370": "Panama", "371": "Panama", "372": "Panama", "373": "Panama",
    "563": "Singapore", "564": "Singapore", "565": "Singapore", "566": "Singapore",
    "636": "Liberia", "637": "Liberia",
    "538": "Marshall Islands",
    "477": "Hong Kong",
    "412": "China", "413": "China", "414": "China",
    "431": "Japan", "432": "Japan",
    "440": "South Korea", "441": "South Korea",
    "533": "Malaysia",
    "525": "Indonesia",
    "405": "Bangladesh",
    "417": "Sri Lanka",
    "463": "Pakistan",
    "470": "United Arab Emirates", "471": "United Arab Emirates",
    "403": "Saudi Arabia",
    "422": "Iran",
    "620": "Comoros",
    "215": "Malta", "229": "Malta", "248": "Malta", "249": "Malta", "256": "Malta",
    "236": "Gibraltar",
    "232": "United Kingdom", "233": "United Kingdom", "234": "United Kingdom", "235": "United Kingdom",
    "241": "Greece", "239": "Greece", "240": "Greece",
    "255": "Portugal (Madeira)",
    "305": "Antigua and Barbuda",
    "311": "Bahamas",
}


def flag_from_mmsi(mmsi: str) -> Optional[str]:
    """Resolves the flag state from an MMSI's Maritime Identification Digits."""
    return MID_FLAGS.get(mmsi[:3]) if len(mmsi) == 9 and mmsi.isdigit() else None

# ─── Haversine Geodesic Distance ──────────────────────────────────────────────

def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculates the great-circle distance between two points in kilometers."""
    R = 6371.0  # Earth's mean radius in km
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c


# ─── AIS Record Data Structure ────────────────────────────────────────────────

class AISRecord:
    def __init__(
        self,
        mmsi: str,
        vessel_name: str,
        timestamp: datetime,
        lat: float,
        lon: float,
        sog: float,
        cog: float,
        heading: float,
        vessel_type: Optional[str] = None,
    ):
        self.mmsi = mmsi
        self.vessel_name = vessel_name
        self.vessel_type = vessel_type
        self.timestamp = timestamp
        self.lat = lat
        self.lon = lon
        self.sog = sog
        self.cog = cog
        self.heading = heading


def load_ais_records(csv_path: Optional[Path] = None) -> List[AISRecord]:
    """Loads and validates AIS records from CSV. The vessel_type column is optional."""
    target_path = csv_path or AIS_CSV_PATH
    if not target_path.exists():
        raise FileNotFoundError(f"AIS dataset not found at: {target_path}")

    records: List[AISRecord] = []
    with open(target_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        required_cols = {"MMSI", "vessel_name", "timestamp", "latitude", "longitude", "SOG_knots", "COG_degrees", "heading_degrees"}
        if not required_cols.issubset(set(reader.fieldnames or [])):
            raise ValueError(f"AIS CSV is missing required columns. Expected {required_cols}, found {reader.fieldnames}")

        for row in reader:
            try:
                mmsi = str(row["MMSI"]).strip()
                vessel_name = str(row["vessel_name"]).strip()
                vessel_type = (row.get("vessel_type") or "").strip() or None
                ts_str = row["timestamp"].strip().replace("Z", "+00:00")
                ts = datetime.fromisoformat(ts_str)
                if ts.tzinfo is None:
                    ts = ts.replace(tzinfo=timezone.utc)
                lat = float(row["latitude"])
                lon = float(row["longitude"])
                sog = float(row["SOG_knots"])
                cog = float(row["COG_degrees"])
                heading = float(row["heading_degrees"])

                records.append(
                    AISRecord(
                        mmsi=mmsi,
                        vessel_name=vessel_name,
                        vessel_type=vessel_type,
                        timestamp=ts,
                        lat=lat,
                        lon=lon,
                        sog=sog,
                        cog=cog,
                        heading=heading,
                    )
                )
            except (ValueError, KeyError):
                continue

    return records


# ─── Origin probability bands ─────────────────────────────────────────────────

def _build_origin_bands(ellipses: Optional[List[EnsembleEllipse]]) -> List[Tuple[str, Any]]:
    """Shapely polygons for the ensemble bands, tightest first, as (label, polygon)."""
    if not ellipses:
        return []
    bands = []
    for e in sorted(ellipses, key=lambda e: e.confidence):
        ring = [(lon, lat) for lat, lon in e.polygon]
        if len(ring) >= 4:
            bands.append((f"{int(round(e.confidence * 100))}%", shapely.geometry.Polygon(ring)))
    return bands


def _tightest_band(lat: float, lon: float, bands: List[Tuple[str, Any]]) -> Optional[str]:
    pt = shapely.geometry.Point(lon, lat)
    for label, poly in bands:
        if poly.contains(pt):
            return label
    return None


# ─── AIS gap analysis ─────────────────────────────────────────────────────────

def _median(values: List[float]) -> float:
    s = sorted(values)
    n = len(s)
    if n == 0:
        return 0.0
    return s[n // 2] if n % 2 else 0.5 * (s[n // 2 - 1] + s[n // 2])


def detect_ais_gaps(
    track: List[AISRecord], origin_dt: datetime, origin_lat: float, origin_lon: float
) -> List[AISGap]:
    """
    Finds anomalous transmission gaps in a chronologically sorted track and, for any
    gap that spans the estimated discharge time, interpolates where the vessel would
    have been at that moment.
    """
    if len(track) < 2:
        return []

    intervals_h = [
        (track[i + 1].timestamp - track[i].timestamp).total_seconds() / 3600.0
        for i in range(len(track) - 1)
    ]
    threshold_h = max(MIN_GAP_HOURS, CADENCE_MULTIPLIER * _median(intervals_h))

    gaps: List[AISGap] = []
    for i, gap_h in enumerate(intervals_h):
        if gap_h < threshold_h:
            continue
        a, b = track[i], track[i + 1]
        spans = a.timestamp <= origin_dt <= b.timestamp

        inferred_lat = inferred_lon = inferred_dist = None
        if spans:
            frac = (origin_dt - a.timestamp).total_seconds() / max((b.timestamp - a.timestamp).total_seconds(), 1.0)
            inferred_lat = a.lat + frac * (b.lat - a.lat)
            inferred_lon = a.lon + frac * (b.lon - a.lon)
            inferred_dist = haversine_distance_km(origin_lat, origin_lon, inferred_lat, inferred_lon)

        gaps.append(
            AISGap(
                start_timestamp=a.timestamp.isoformat(),
                end_timestamp=b.timestamp.isoformat(),
                duration_hours=round(gap_h, 2),
                start_lat=round(a.lat, 6),
                start_lon=round(a.lon, 6),
                end_lat=round(b.lat, 6),
                end_lon=round(b.lon, 6),
                spans_origin_time=spans,
                inferred_lat=round(inferred_lat, 6) if inferred_lat is not None else None,
                inferred_lon=round(inferred_lon, 6) if inferred_lon is not None else None,
                inferred_distance_km=round(inferred_dist, 2) if inferred_dist is not None else None,
            )
        )
    return gaps


def _hhmm(iso: str) -> str:
    return datetime.fromisoformat(iso).strftime("%H:%M")


def _trajectory_points(min_dist_km: float) -> int:
    """Trajectory-corridor score buckets (weight 30) by closest-approach distance."""
    if min_dist_km <= 1.0:
        return 30
    if min_dist_km <= 3.0:
        return 25
    if min_dist_km <= 8.0:
        return 18
    if min_dist_km <= 15.0:
        return 10
    return 5


# ─── Correlation & Attribution Scoring Engine ─────────────────────────────────

def correlate_vessels(
    spill_id: str,
    origin_lat: float,
    origin_lon: float,
    origin_timestamp: str,
    max_distance_km: float = 30.0,
    max_time_window_hours: float = 6.0,
    csv_path: Optional[Path] = None,
    origin_ellipses: Optional[List[EnsembleEllipse]] = None,
) -> VesselAttribution:
    """
    Correlates AIS tracks with the reconstructed spill origin.
    Calculates proximity, temporal overlap, trajectory corridor match, and behavioural anomalies.
    Returns ranked candidate vessels with explainable evidence.

    When *origin_ellipses* (the Monte Carlo bands at the hindcast horizon) are supplied,
    each candidate is additionally tagged with the tightest band containing its closest
    approach. This is evidence, not score — the 4-factor weights are unchanged.
    """
    origin_bands = _build_origin_bands(origin_ellipses)
    # 1. Parse and validate origin timestamp and coordinates
    if not (-90.0 <= origin_lat <= 90.0):
        raise ValueError(f"Origin latitude out of bounds [-90, 90]: {origin_lat}")
    if not (-180.0 <= origin_lon <= 180.0):
        raise ValueError(f"Origin longitude out of bounds [-180, 180]: {origin_lon}")

    ts_clean = origin_timestamp.replace("Z", "+00:00")
    try:
        origin_dt = datetime.fromisoformat(ts_clean)
    except Exception as exc:
        raise ValueError(f"Invalid origin timestamp '{origin_timestamp}': {exc}") from exc
    if origin_dt.tzinfo is None:
        origin_dt = origin_dt.replace(tzinfo=timezone.utc)

    # 2. Load AIS records
    all_records = load_ais_records(csv_path)

    # 3. Group records by vessel (MMSI)
    vessel_tracks: Dict[str, List[AISRecord]] = {}
    for rec in all_records:
        if rec.mmsi not in vessel_tracks:
            vessel_tracks[rec.mmsi] = []
        vessel_tracks[rec.mmsi].append(rec)

    # Sort each track chronologically
    for mmsi in vessel_tracks:
        vessel_tracks[mmsi].sort(key=lambda r: r.timestamp)

    candidates: List[CandidateVessel] = []

    # 4. Evaluate each vessel track
    for mmsi, track in vessel_tracks.items():
        if not track:
            continue

        vessel_name = track[0].vessel_name

        # A. Find minimum distance point & closest time point
        min_dist = float("inf")
        closest_point = track[0]
        min_time_diff_hours = float("inf")
        time_diff_at_closest_dist = float("inf")

        for pt in track:
            d = haversine_distance_km(origin_lat, origin_lon, pt.lat, pt.lon)
            t_diff = abs((pt.timestamp - origin_dt).total_seconds()) / 3600.0

            if d < min_dist:
                min_dist = d
                closest_point = pt
                time_diff_at_closest_dist = t_diff

            if t_diff < min_time_diff_hours:
                min_time_diff_hours = t_diff

        # A2. "Went dark" analysis — anomalous gaps, and where the vessel would have
        #     been if a gap spans the discharge time. That inferred fix can stand in
        #     for the measured closest approach, at a discount.
        gaps = detect_ais_gaps(track, origin_dt, origin_lat, origin_lon)
        dark_gap = next((g for g in gaps if g.spans_origin_time), None)
        went_dark = dark_gap is not None
        evidence_basis = "measured"

        # Use whichever evidence basis scores higher: the measured closest approach, or the
        # (discounted) interpolated fix during silence. Inferred evidence must earn its place.
        observed_min_dist = min_dist
        if dark_gap is not None and dark_gap.inferred_distance_km is not None:
            def _geom(d: float, t: float, f: float) -> float:
                return f * (
                    max(0.0, 35.0 * (1.0 - d / max_distance_km))
                    + max(0.0, 20.0 * (1.0 - t / max_time_window_hours))
                    + _trajectory_points(d)
                )
            measured = _geom(min_dist, time_diff_at_closest_dist, 1.0)
            inferred = _geom(dark_gap.inferred_distance_km, 0.0, INFERRED_EVIDENCE_FACTOR)
            if inferred > measured:
                min_dist = dark_gap.inferred_distance_km
                time_diff_at_closest_dist = 0.0      # the silence covers the discharge time exactly
                evidence_basis = "inferred_during_silence"

        # If completely outside regional search radius (> 50 km), skip
        if min_dist > 50.0:
            continue

        # Effective time difference for temporal evaluation
        eval_time_diff = time_diff_at_closest_dist
        evidence_factor = INFERRED_EVIDENCE_FACTOR if evidence_basis == "inferred_during_silence" else 1.0

        # B. Proximity Score (Weight: 35)
        # Score = max(0, 35 * (1 - min_dist / max_distance_km))
        prox_score = max(0.0, 35.0 * (1.0 - (min_dist / max_distance_km))) * evidence_factor
        prox_score = round(prox_score, 1)

        # C. Temporal Score (Weight: 20)
        # Score = max(0, 20 * (1 - eval_time_diff / max_time_window_hours))
        temp_score = max(0.0, 20.0 * (1.0 - (eval_time_diff / max_time_window_hours))) * evidence_factor
        temp_score = round(temp_score, 1)

        # D. Trajectory Score (Weight: 30)
        # Analyzes track geometry relative to origin corridor
        reasons: List[str] = []

        if evidence_basis == "inferred_during_silence" and dark_gap is not None:
            reasons.append(
                f"AIS SILENT {_hhmm(dark_gap.start_timestamp)}–{_hhmm(dark_gap.end_timestamp)} UTC "
                f"({dark_gap.duration_hours:.1f} h) — transponder gap spans the estimated discharge time"
            )
            reasons.append(
                f"interpolated position during silence passes {min_dist:.2f} km from origin "
                f"(last fix {observed_min_dist:.1f} km away; inferred evidence discounted {int((1 - INFERRED_EVIDENCE_FACTOR) * 100)}%)"
            )

        if min_dist <= 1.0:
            traj_score = 30
            reasons.append(f"passed within {min_dist:.2f} km of reconstructed origin")
            if evidence_basis == "inferred_during_silence":
                reasons[-1] = f"inferred track passes within {min_dist:.2f} km of reconstructed origin"
            if eval_time_diff <= 0.5:
                reasons.append("AIS position closely overlaps estimated spill-origin time")
            else:
                reasons.append(f"passed origin corridor {eval_time_diff:.1f} hours from spill time")
            reasons.append("vessel track passes through the origin corridor")
            reasons.append("track shows approach toward and departure from origin")
        elif min_dist <= 3.0:
            traj_score = 25
            reasons.append(f"came within {min_dist:.1f} km of reconstructed origin")
            reasons.append("AIS track overlaps the estimated spill time window")
            reasons.append("vessel trajectory passes near the origin corridor")
            reasons.append("track shows approach toward and departure from origin")
        elif min_dist <= 8.0:
            traj_score = 18
            reasons.append(f"minimum distance {min_dist:.2f} km from reconstructed origin")
            reasons.append("moderate temporal overlap with spill window")
            reasons.append("vessel trajectory within the regional maritime corridor")
        elif min_dist <= 15.0:
            traj_score = 10
            reasons.append(f"passed {min_dist:.2f} km from reconstructed origin")
            reasons.append("peripheral trajectory along maritime transit lane")
        else:
            traj_score = 5
            reasons.append(f"passed {min_dist:.2f} km from origin")
            reasons.append("distant trajectory with low origin overlap")
        traj_score = round(traj_score * evidence_factor, 1)

        # E. Behavioural Anomaly Score (Weight: 15)
        # 1. Speed reduction anomaly near origin (>= 50% drop from transit average): +7
        # 2. Anomalous AIS gap anywhere in the track: +5; if it spans the discharge time: +8
        behav_score = 0
        sogs = [p.sog for p in track]
        avg_sog = sum(sogs) / len(sogs) if sogs else 0.0

        # Check speed drop near closest point
        if closest_point.sog < avg_sog * 0.5 and avg_sog > 4.0:
            reduction_pct = int(round((1.0 - (closest_point.sog / avg_sog)) * 100))
            behav_score += 7
            reasons.append(f"speed reduced by approximately {reduction_pct}% near spill window")

        # Anomalous AIS transmission gaps
        if dark_gap is not None:
            behav_score += 8
            if evidence_basis != "inferred_during_silence":
                reasons.append(
                    f"AIS SILENT {_hhmm(dark_gap.start_timestamp)}–{_hhmm(dark_gap.end_timestamp)} UTC "
                    f"({dark_gap.duration_hours:.1f} h) — transponder gap spans the estimated discharge time"
                )
        elif gaps:
            g = max(gaps, key=lambda g: g.duration_hours)
            behav_score += 5
            reasons.append(
                f"AIS gap {_hhmm(g.start_timestamp)}–{_hhmm(g.end_timestamp)} UTC ({g.duration_hours:.1f} h) "
                "detected — outside the estimated discharge window"
            )

        # F. Monte Carlo origin band membership (evidence only)
        origin_band = _tightest_band(closest_point.lat, closest_point.lon, origin_bands) if origin_bands else None
        if origin_band:
            reasons.append(f"closest approach lies inside the {origin_band} origin probability band")

        # Total Score
        total_score = round(prox_score + temp_score + traj_score + behav_score, 1)

        # Risk Classification Thresholds
        # HIGH: >= 75.0 | MEDIUM: 40.0 - 74.9 | LOW: < 40.0
        if total_score >= 75.0:
            risk = "HIGH"
        elif total_score >= 40.0:
            risk = "MEDIUM"
        else:
            risk = "LOW"

        # Build chronological track points with measured evidence markers
        track_points: List[AISTrackPoint] = []
        for pt in track:
            dist_to_orig = haversine_distance_km(origin_lat, origin_lon, pt.lat, pt.lon)
            is_closest = (pt.timestamp == closest_point.timestamp and abs(pt.lat - closest_point.lat) < 1e-5)
            is_spd_drop = (is_closest and closest_point.sog < avg_sog * 0.5 and avg_sog > 4.0)
            is_corridor = (dist_to_orig <= 3.0)

            track_points.append(
                AISTrackPoint(
                    timestamp=pt.timestamp.isoformat(),
                    lat=round(pt.lat, 6),
                    lon=round(pt.lon, 6),
                    sog_knots=round(pt.sog, 2),
                    cog_degrees=round(pt.cog, 1),
                    heading_degrees=round(pt.heading, 1),
                    is_closest_approach=is_closest,
                    is_speed_reduction=is_spd_drop,
                    is_corridor_crossing=is_corridor,
                )
            )

        candidates.append(
            CandidateVessel(
                vessel_id=mmsi,
                vessel_name=vessel_name,
                vessel_type=track[0].vessel_type,
                flag=flag_from_mmsi(mmsi),
                origin_band=origin_band,
                ais_gaps=gaps,
                went_dark=went_dark,
                evidence_basis=evidence_basis,
                score=total_score,
                risk=risk,
                min_distance_km=round(min_dist, 2),
                time_difference_hours=round(eval_time_diff, 1),
                proximity_score=prox_score,
                temporal_score=temp_score,
                trajectory_score=traj_score,
                behavioral_score=behav_score,
                reasons=reasons,
                track=track_points,
            )
        )

    # Sort descending by attribution score
    candidates.sort(key=lambda c: c.score, reverse=True)

    return VesselAttribution(
        spill_id=spill_id,
        reconstructed_origin=ReconstructedOrigin(
            latitude=round(origin_lat, 6),
            longitude=round(origin_lon, 6),
            timestamp=origin_dt.isoformat(),
        ),
        method=AttributionWeights(
            proximity_weight=35,
            temporal_weight=20,
            trajectory_weight=30,
            behavioral_weight=15,
        ),
        candidate_vessels=candidates,
    )
