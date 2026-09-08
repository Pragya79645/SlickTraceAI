"""
Model Service — exposes the trained segmentation model's own training record.

Ultralytics checkpoints embed the training arguments, final validation metrics, and the
per-epoch results table. Surfacing them verbatim answers "how accurate is it?" with
numbers the model carries itself rather than numbers typed into a slide.
"""

from __future__ import annotations

import warnings
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.schemas.investigation import ModelEpochRow, ModelMetrics

_BASE = Path(__file__).resolve().parents[2]   # …/backend
MODEL_PATH = _BASE / "models" / "oilspill_yolov8_seg_best.pt"

_METRIC_KEYS = {
    "box_precision": "metrics/precision(B)",
    "box_recall": "metrics/recall(B)",
    "box_map50": "metrics/mAP50(B)",
    "box_map50_95": "metrics/mAP50-95(B)",
    "mask_precision": "metrics/precision(M)",
    "mask_recall": "metrics/recall(M)",
    "mask_map50": "metrics/mAP50(M)",
    "mask_map50_95": "metrics/mAP50-95(M)",
}


def _f(v: Any) -> Optional[float]:
    try:
        return round(float(v), 4)
    except (TypeError, ValueError):
        return None


@lru_cache(maxsize=1)
def get_model_metrics() -> ModelMetrics:
    if not MODEL_PATH.exists():
        raise FileNotFoundError(f"Trained model not found at {MODEL_PATH}")

    import torch  # heavy import kept local; ultralytics already needs it at inference

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        ck = torch.load(str(MODEL_PATH), map_location="cpu", weights_only=False)

    args: Dict[str, Any] = ck.get("train_args") or {}
    metrics: Dict[str, Any] = ck.get("train_metrics") or {}
    results: Dict[str, List[Any]] = ck.get("train_results") or {}

    epochs: List[ModelEpochRow] = []
    ep = results.get("epoch") or []
    for i in range(len(ep)):
        def col(key: str) -> Optional[float]:
            series = results.get(key)
            return _f(series[i]) if series and i < len(series) else None
        epochs.append(
            ModelEpochRow(
                epoch=int(ep[i]),
                mask_map50=col("metrics/mAP50(M)"),
                mask_precision=col("metrics/precision(M)"),
                mask_recall=col("metrics/recall(M)"),
                box_map50=col("metrics/mAP50(B)"),
                train_seg_loss=col("train/seg_loss"),
                val_seg_loss=col("val/seg_loss"),
            )
        )

    return ModelMetrics(
        model_file=MODEL_PATH.name,
        architecture=str(args.get("model") or "yolov8-seg").replace(".pt", ""),
        task=str(args.get("task") or "segment"),
        ultralytics_version=str(ck.get("version") or ""),
        trained_at=str(ck.get("date") or ""),
        epochs=int(args.get("epochs") or len(epochs) or 0),
        image_size=int(args.get("imgsz") or 0),
        batch_size=int(args.get("batch") or 0),
        optimizer=str(args.get("optimizer") or ""),
        dataset=str(args.get("data") or "").split("/")[-2] if args.get("data") else "",
        pretrained=bool(args.get("pretrained", False)),
        seed=int(args.get("seed") or 0),
        **{k: _f(metrics.get(v)) for k, v in _METRIC_KEYS.items()},
        fitness=_f(metrics.get("fitness")),
        history=epochs,
        caveats=[
            "Validation metrics are from the training run's held-out split, not an independent test set.",
            f"Trained at {args.get('imgsz', '?')} px crops; whole scenes are inferred as overlapping tiles.",
            "Recall below precision means the model favours missing a faint slick over raising a false alarm.",
        ],
    )
