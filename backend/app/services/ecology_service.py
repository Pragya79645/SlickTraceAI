"""
Ecology Service — Marine Biodiversity & Sensitive Habitat Screening (Phase 5E)

Consumes the hydrodynamic forecast trajectory produced by drift_service.py,
calculates geodesic distance to sensitive coastal/marine habitats in the region,
and evaluates potential exposure windows within the forecast horizon.

DISCLAIMER:
Ecological screening provides prototype proximity screening, NOT confirmed environmental damage.
Habitat screening uses prototype proximity radii and the current drift-model forecast.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import List, Optional

from app.schemas.investigation import (
    EcologicalAssessment,
    EcologicalAssessmentSummary,
    GeoTimestep,
    HabitatImpact,
    NationalRamsarSite,
    SensitiveHabitat,
)

_BASE = Path(__file__).resolve().parents[2]   # …/backend
DEFAULT_HABITATS_FILE = _BASE / "data" / "environment" / "sensitive_habitats.json"
DEFAULT_RAMSAR_FILE = _BASE / "data" / "environment" / "ramsar_sites_india.json"


# ─── Geodesic Haversine Calculation ───────────────────────────────────────────

def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculates the great-circle distance between two GPS coordinates in kilometers."""
    R = 6371.0  # Earth's radius in km
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)

    a = (
        math.sin(dphi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c


# ─── Dataset Loader ───────────────────────────────────────────────────────────

def load_sensitive_habitats(file_path: Optional[Path] = None) -> List[SensitiveHabitat]:
    """
    Loads and validates sensitive habitat definitions from JSON.
    Raises ValueError for missing files or invalid coordinate/radius ranges.
    """
    path = file_path or DEFAULT_HABITATS_FILE
    if not path.is_file():
        raise FileNotFoundError(f"Sensitive habitats dataset not found at: {path}")

    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    habitats: List[SensitiveHabitat] = []
    for item in data:
        lat = float(item["latitude"])
        lon = float(item["longitude"])
        radius = float(item["impact_radius_km"])

        if not (-90.0 <= lat <= 90.0):
            raise ValueError(f"Habitat '{item.get('name')}' latitude out of bounds: {lat}")
        if not (-180.0 <= lon <= 180.0):
            raise ValueError(f"Habitat '{item.get('name')}' longitude out of bounds: {lon}")
        if radius <= 0.0:
            raise ValueError(f"Habitat '{item.get('name')}' impact radius must be positive: {radius}")

        habitats.append(
            SensitiveHabitat(
                id=item["id"],
                name=item["name"],
                type=item["type"],
                latitude=lat,
                longitude=lon,
                protection_status=item["protection_status"],
                impact_radius_km=radius,
                source=item["source"],
            )
        )

    return habitats


def load_national_ramsar_registry(file_path: Optional[Path] = None) -> List[NationalRamsarSite]:
    """
    Loads and validates the national Ramsar sites registry from JSON.
    Guarantees strict schema adherence and explicitly verifies that no false geometry is claimed.
    """
    path = file_path or DEFAULT_RAMSAR_FILE
    if not path.is_file():
        raise FileNotFoundError(f"National Ramsar registry not found at: {path}")

    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    sites: List[NationalRamsarSite] = []
    for item in data:
        if not item.get("name") or not isinstance(item["name"], str):
            raise ValueError(f"Malformed Ramsar record: missing valid name in {item}")
        if not item.get("state") or not isinstance(item["state"], str):
            raise ValueError(f"Malformed Ramsar record: missing valid state in {item}")

        area = item.get("area_hectares")
        if area is not None and not isinstance(area, (int, float)):
            raise ValueError(f"Malformed Ramsar record: invalid area in {item}")

        sites.append(
            NationalRamsarSite(
                name=item["name"],
                state=item["state"],
                designation_date=item.get("designation_date", ""),
                area_hectares=float(area) if area is not None else None,
                status=item.get("status", "Protected Area"),
                wetland_type=item.get("wetland_type", "Unclassified"),
                source_url=item.get("source_url", ""),
                source=item.get("source", "Government of India / MoEFCC Ramsar Sites dataset"),
                has_geometry=False,
            )
        )

    return sites


# ─── Threat Assessment Engine ─────────────────────────────────────────────────

def assess_ecological_threat(
    forecast_trajectory: List[GeoTimestep],
    habitats: Optional[List[SensitiveHabitat]] = None,
    habitats_file: Optional[Path] = None,
) -> EcologicalAssessment:
    """
    Evaluates potential exposure of sensitive marine habitats to the forecast drift trajectory.
    Calculates minimum geodesic distance, first entry time, and response priority.
    """
    if habitats is None:
        habitats = load_sensitive_habitats(habitats_file)

    if not forecast_trajectory:
        return EcologicalAssessment(
            assessment=EcologicalAssessmentSummary(
                status="NO_FORECAST",
                response_priority="LOW",
                habitats_evaluated=len(habitats),
                threatened_habitats=0,
            ),
            impacts=[],
        )

    impacts: List[HabitatImpact] = []

    for habitat in habitats:
        min_dist = float("inf")
        first_impact_time: Optional[float] = None
        entered_radius = False

        for step in forecast_trajectory:
            dist = haversine_distance_km(step.lat, step.lon, habitat.latitude, habitat.longitude)
            if dist < min_dist:
                min_dist = dist

            # Check if trajectory enters the prototype screening radius
            if dist <= habitat.impact_radius_km and not entered_radius:
                entered_radius = True
                first_impact_time = (
                    step.hours_after_observation
                    if step.hours_after_observation is not None
                    else 0.0
                )

        min_dist_rounded = round(min_dist, 2)

        # Classification rules:
        # HIGH: Enters screening radius within forecast window
        # MEDIUM: Comes within 3.0 km of the screening radius
        # LOW: Stays outside screening radius + 3.0 km buffer
        if entered_radius and first_impact_time is not None:
            threat_level = "HIGH"
            reason = (
                f"Forecast trajectory enters {habitat.name} prototype screening radius "
                f"({habitat.impact_radius_km} km) at approximately +{first_impact_time:.1f} hours."
            )
        elif min_dist <= habitat.impact_radius_km + 3.0:
            threat_level = "MEDIUM"
            first_impact_time = None
            reason = (
                f"Forecast trajectory approaches within {min_dist_rounded} km of {habitat.name} "
                f"(prototype screening radius {habitat.impact_radius_km} km)."
            )
        else:
            threat_level = "LOW"
            first_impact_time = None
            reason = (
                f"Forecast trajectory remains outside prototype screening radius "
                f"(minimum distance {min_dist_rounded} km)."
            )

        impacts.append(
            HabitatImpact(
                habitat_id=habitat.id,
                habitat_name=habitat.name,
                type=habitat.type,
                latitude=habitat.latitude,
                longitude=habitat.longitude,
                impact_radius_km=habitat.impact_radius_km,
                minimum_distance_km=min_dist_rounded,
                estimated_time_to_impact_hours=(
                    round(first_impact_time, 1) if first_impact_time is not None else None
                ),
                threat_level=threat_level,
                reason=reason,
                is_confirmed_impact=False,
            )
        )

    # Sort impacts by threat level: HIGH -> MEDIUM -> LOW, then ascending distance
    threat_order = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
    impacts.sort(key=lambda imp: (threat_order.get(imp.threat_level, 99), imp.minimum_distance_km))

    # Overall response priority
    has_high = any(imp.threat_level == "HIGH" for imp in impacts)
    has_medium = any(imp.threat_level == "MEDIUM" for imp in impacts)
    response_priority = "HIGH" if has_high else "MEDIUM" if has_medium else "LOW"

    threatened_count = sum(1 for imp in impacts if imp.threat_level in ("HIGH", "MEDIUM"))

    return EcologicalAssessment(
        assessment=EcologicalAssessmentSummary(
            status="SCREENED",
            response_priority=response_priority,
            habitats_evaluated=len(habitats),
            threatened_habitats=threatened_count,
        ),
        impacts=impacts,
    )
