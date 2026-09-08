"""
Georeference Service — extracts scene geolocation from satellite GeoTIFFs.

A Sentinel-1 GRD or any georeferenced GeoTIFF carries a CRS and an affine transform
(or ground control points). This module:

1. Opens the upload in memory with rasterio and reads CRS / transform / bounds.
2. Produces an inference-ready uint8 RGB array — SAR intensity is single-band and
   heavy-tailed, so it is percentile-stretched and replicated across three channels
   (the segmentation model was trained on 3-channel imagery).
3. Decimates very large scenes to a working resolution so the whole scene fits one
   inference pass, remembering the scale so mask pixels map back to full-resolution
   pixels and then through the transform to lon/lat.
4. Derives the ground sample distance in metres from the transform.
5. Recovers the acquisition timestamp from TIFF tags or the Sentinel product filename.

Plain PNG/JPEG uploads have no georeference; the caller falls back to manual anchors.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import List, Optional, Sequence, Tuple

import numpy as np

try:
    import rasterio
    import rasterio.warp
    from rasterio.io import MemoryFile
    from rasterio.transform import Affine
    HAVE_RASTERIO = True
except ImportError:  # keep the API importable without rasterio; GeoTIFF uploads then fail cleanly
    HAVE_RASTERIO = False

MAX_INFERENCE_SIDE = 2048      # longest side of the array handed to the model
STRETCH_PERCENTILES = (2.0, 98.0)
METERS_PER_DEG_LAT = 111195.0
LEE_WINDOW = 7                 # speckle-filter window (SNAP-style Lee filter) for single-band SAR

# Dark-spot enhancement for the MODEL input (never for display or physics):
# after inversion, everything up to the 75th percentile (open-water clutter) is pushed to
# black and the top 0.5 % (the darkest, most damped water — i.e. oil) to white. The model
# was trained on bright oil over a flat dark background; this renders SAR into that domain.
MODEL_REMAP_PERCENTILES = (75.0, 99.5)

# Sentinel-1/2 product naming embeds the sensing start time, e.g.
#   S1A_IW_GRDH_1SDV_20260828T210213_20260828T210238_...
_SENTINEL_TS = re.compile(r"(?<!\d)(\d{8})T(\d{6})(?!\d)")


@dataclass
class SceneGeoreference:
    crs: str                        # e.g. "EPSG:32643"
    transform: Tuple[float, ...]    # affine (a, b, c, d, e, f) at FULL resolution
    width: int
    height: int
    bounds_wgs84: Tuple[float, float, float, float]   # west, south, east, north
    gsd_m: float                    # ground sample distance at full resolution
    inference_scale: float          # full-res pixels per inference pixel (≥ 1)
    timestamp: Optional[str]
    timestamp_source: str           # "tiff_tag" | "filename" | "none"
    source: str = "geotiff_embedded"


@dataclass
class DecodedScene:
    image_rgb: np.ndarray           # uint8 (H, W, 3) at inference resolution — what the MODEL sees
    physical_gray: np.ndarray       # uint8 (H, W) true radiometry (low backscatter = dark) for physics checks & display
    georef: Optional[SceneGeoreference]
    polarity: str                   # "bright_oil" (inverted for the model) | "as_is"


# ─── Helpers ──────────────────────────────────────────────────────────────────

def lee_filter(band: np.ndarray, window: int = LEE_WINDOW) -> np.ndarray:
    """
    Lee (1980) adaptive speckle filter — the standard SNAP preprocessing step before
    oil-spill segmentation. Smooths homogeneous water while preserving slick edges:
        out = mean + k · (x − mean),  k = var_local / (var_local + var_noise)
    """
    import cv2  # local import keeps this module importable without OpenCV for pure georef use

    x = band.astype(np.float32)
    mean = cv2.blur(x, (window, window))
    sq_mean = cv2.blur(x * x, (window, window))
    var = np.maximum(sq_mean - mean * mean, 0.0)
    noise_var = float(np.mean(var)) if var.size else 0.0
    k = var / (var + noise_var + 1e-6)
    return mean + k * (x - mean)


def dark_spot_enhance(physical_u8: np.ndarray) -> np.ndarray:
    """
    Renders true-radiometry SAR (oil = dark) into the model's domain (oil = bright, sea ≈ black).
    Percentiles are taken over the whole frame, which for an ocean scene is clutter-dominated.
    """
    inv = (255 - physical_u8).astype(np.float32)
    lo, hi = np.percentile(inv, MODEL_REMAP_PERCENTILES)
    out = np.clip((inv - lo) / max(hi - lo, 1.0), 0.0, 1.0) * 255.0
    return out.astype(np.uint8)


def _stretch_to_uint8(band: np.ndarray, nodata: Optional[float]) -> np.ndarray:
    """Percentile-stretches a float/int band to uint8, ignoring nodata."""
    arr = band.astype(np.float32)
    valid = np.isfinite(arr)
    if nodata is not None:
        valid &= arr != nodata
    if not valid.any():
        return np.zeros(arr.shape, np.uint8)

    lo, hi = np.percentile(arr[valid], STRETCH_PERCENTILES)
    if hi <= lo:
        hi = lo + 1.0
    out = np.clip((arr - lo) / (hi - lo), 0.0, 1.0) * 255.0
    out[~valid] = 0
    return out.astype(np.uint8)


def _timestamp_from_tags(tags: dict) -> Optional[str]:
    raw = tags.get("TIFFTAG_DATETIME") or tags.get("DATETIME") or tags.get("ACQUISITION_DATETIME")
    if not raw:
        return None
    for fmt in ("%Y:%m:%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(raw.strip(), fmt).replace(tzinfo=timezone.utc).isoformat()
        except ValueError:
            continue
    return None


def timestamp_from_filename(filename: str) -> Optional[str]:
    m = _SENTINEL_TS.search(filename or "")
    if not m:
        return None
    try:
        dt = datetime.strptime(m.group(1) + m.group(2), "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc)
        return dt.isoformat()
    except ValueError:
        return None


def _gsd_metres(transform: "Affine", crs: "rasterio.crs.CRS", center_lat: float) -> float:
    """Pixel size in metres; geographic CRSs are converted at the scene's centre latitude."""
    px_w, px_h = abs(transform.a), abs(transform.e)
    if crs.is_geographic:
        m_lat = px_h * METERS_PER_DEG_LAT
        m_lon = px_w * METERS_PER_DEG_LAT * max(abs(math.cos(math.radians(center_lat))), 1e-6)
        return float((m_lat + m_lon) / 2.0)
    # projected CRS: assume metre units (true for UTM / most SAR products)
    return float((px_w + px_h) / 2.0)


# ─── Public API ───────────────────────────────────────────────────────────────

def is_geotiff_name(filename: str) -> bool:
    return (filename or "").lower().endswith((".tif", ".tiff"))


def decode_geotiff(image_bytes: bytes, filename: str, invert_for_model: bool = True) -> DecodedScene:
    """
    Decodes a (Geo)TIFF into an inference-ready RGB array and its georeference.
    A TIFF without a CRS/transform decodes fine but returns georef=None.

    Radiometric polarity: in SAR, oil damps capillary waves and appears DARK. The
    segmentation model, however, was trained on imagery in which oil is rendered BRIGHT
    over a flat dark background (verified empirically: it segments a bright ellipse exactly,
    ignores a dark one, and masks any whole tile that carries sea texture). Single-band SAR
    is therefore inverted and dark-spot-enhanced for the model, while *physical_gray* keeps
    the true radiometry for the dark-spot gate and for display.
    """
    if not HAVE_RASTERIO:
        raise RuntimeError("rasterio is not installed; GeoTIFF uploads are unsupported")

    with MemoryFile(image_bytes) as mem:
        with mem.open() as src:
            full_w, full_h = src.width, src.height
            scale = max(1.0, max(full_w, full_h) / MAX_INFERENCE_SIDE)
            out_w, out_h = max(1, int(round(full_w / scale))), max(1, int(round(full_h / scale)))

            # Decimated read of up to three bands (single-band SAR gets replicated)
            band_idx = list(range(1, min(src.count, 3) + 1))
            data = src.read(band_idx, out_shape=(len(band_idx), out_h, out_w))
            nodata = src.nodata

            # Single-band SAR intensity: despeckle first (Lee), then stretch
            if data.shape[0] == 1:
                data = data.astype(np.float32)
                data[0] = lee_filter(data[0])

            stretched = [_stretch_to_uint8(data[i], nodata) for i in range(data.shape[0])]
            polarity = "as_is"
            if len(stretched) == 1:
                physical = stretched[0]
                model_band = dark_spot_enhance(physical) if invert_for_model else physical
                polarity = "bright_oil_darkspot_enhanced" if invert_for_model else "as_is"
                rgb = np.stack([model_band] * 3, axis=-1)
            elif len(stretched) == 2:
                physical = stretched[0]
                rgb = np.stack([stretched[0], stretched[1], stretched[0]], axis=-1)
            else:
                rgb = np.stack(stretched[:3], axis=-1)
                physical = cv2_gray(rgb)

            georef: Optional[SceneGeoreference] = None
            has_geo = src.crs is not None and src.transform is not None and not src.transform.is_identity
            if has_geo:
                west, south, east, north = rasterio.warp.transform_bounds(src.crs, "EPSG:4326", *src.bounds)
                center_lat = (south + north) / 2.0
                ts = _timestamp_from_tags(src.tags())
                ts_source = "tiff_tag" if ts else "none"
                if not ts:
                    ts = timestamp_from_filename(filename)
                    ts_source = "filename" if ts else "none"

                georef = SceneGeoreference(
                    crs=src.crs.to_string(),
                    transform=tuple(float(v) for v in src.transform.to_gdal()),
                    width=full_w,
                    height=full_h,
                    bounds_wgs84=(float(west), float(south), float(east), float(north)),
                    gsd_m=round(_gsd_metres(src.transform, src.crs, center_lat), 3),
                    inference_scale=round(scale, 4),
                    timestamp=ts,
                    timestamp_source=ts_source,
                )

    return DecodedScene(
        image_rgb=np.ascontiguousarray(rgb),
        physical_gray=np.ascontiguousarray(physical),
        georef=georef,
        polarity=polarity,
    )


def cv2_gray(rgb: np.ndarray) -> np.ndarray:
    import cv2
    return cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)


def pixels_to_lonlat(
    georef: SceneGeoreference, xs: Sequence[float], ys: Sequence[float]
) -> List[Tuple[float, float]]:
    """
    Maps INFERENCE-resolution pixel coordinates to (lon, lat) in WGS84.
    Scales back to full-resolution pixels, applies the affine transform, then reprojects.
    """
    if not HAVE_RASTERIO:
        raise RuntimeError("rasterio is not installed")

    a, b, c, d, e, f = georef.transform            # GDAL order: c=x0, a=px_w, b=rot, f=y0, d=rot, e=px_h
    affine = Affine.from_gdal(a, b, c, d, e, f)
    s = georef.inference_scale
    # pixel centres at full resolution
    full_x = [x * s + 0.5 for x in xs]
    full_y = [y * s + 0.5 for y in ys]
    proj_x, proj_y = zip(*[affine * (px, py) for px, py in zip(full_x, full_y)]) if full_x else ((), ())
    lons, lats = rasterio.warp.transform(georef.crs, "EPSG:4326", list(proj_x), list(proj_y))
    return list(zip([float(v) for v in lons], [float(v) for v in lats]))
