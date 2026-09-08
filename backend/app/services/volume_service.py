"""
Volume Service — order-of-magnitude spill volume from slick area.

Bonn Agreement Oil Appearance Code (BAOAC) film-thickness brackets:

  Code 1  Sheen (silvery/grey)               0.04 –   0.30 µm
  Code 2  Rainbow                            0.30 –   5.0  µm
  Code 3  Metallic                           5.0  –  50    µm
  Code 4  Discontinuous true oil colour     50    – 200    µm
  Code 5  Continuous true oil colour       200    – (open) µm   — capped at 1 000 µm here

SAR sees the capillary-wave damping of a film, not its thickness, so the appearance
code cannot be observed from the image. The caller chooses (or defaults) a code and the
result is reported as a min–max bracket, never a point value.
"""

from __future__ import annotations

from typing import Dict, Tuple

from app.schemas.investigation import BonnVolumeEstimate

BAOAC: Dict[str, Tuple[str, float, float]] = {
    "1": ("Sheen (silvery / grey)", 0.04, 0.30),
    "2": ("Rainbow", 0.30, 5.0),
    "3": ("Metallic", 5.0, 50.0),
    "4": ("Discontinuous true oil colour", 50.0, 200.0),
    "5": ("Continuous true oil colour", 200.0, 1000.0),
}

DEFAULT_CODE = "3"
DEFAULT_OIL_DENSITY_KG_M3 = 900.0   # typical crude / heavy fuel oil range 850–990


def estimate_bonn_volume(
    area_km2: float,
    appearance_code: str = DEFAULT_CODE,
    oil_density_kg_m3: float = DEFAULT_OIL_DENSITY_KG_M3,
) -> BonnVolumeEstimate:
    """Volume bracket = area × thickness bracket; mass bracket = volume × density."""
    code = str(appearance_code).strip()
    if code not in BAOAC:
        raise ValueError(f"Unknown Bonn appearance code {appearance_code!r}; expected one of {sorted(BAOAC)}")

    label, t_min_um, t_max_um = BAOAC[code]
    area_m2 = max(area_km2, 0.0) * 1e6
    v_min = area_m2 * t_min_um * 1e-6
    v_max = area_m2 * t_max_um * 1e-6

    return BonnVolumeEstimate(
        appearance_code=code,
        appearance_label=label,
        thickness_um_min=t_min_um,
        thickness_um_max=t_max_um,
        volume_m3_min=round(v_min, 2),
        volume_m3_max=round(v_max, 2),
        volume_tonnes_min=round(v_min * oil_density_kg_m3 / 1000.0, 2),
        volume_tonnes_max=round(v_max * oil_density_kg_m3 / 1000.0, 2),
        oil_density_kg_m3=oil_density_kg_m3,
        basis=(
            f"Bonn Agreement Oil Appearance Code {code} ({label}) assumed — SAR cannot observe film "
            f"thickness. Bracket = {area_km2:.4f} km² × {t_min_um}–{t_max_um} µm at {oil_density_kg_m3:.0f} kg/m³."
        ),
    )
