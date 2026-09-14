# v0.20 Control Influence Diagnostics Design

## Goal

Identify fit control points that exert disproportionate influence on independent holdout quality or the digitized boundary, while never auto-deleting a point or weakening human canonical review.

## Rules

- Require at least 2 independent check points.
- Require Affine >=4 fit points or Projective >=5 fit points.
- Diagnose each fit point by refitting the same model after omitting exactly that point.
- Classify suspect/supportive only from material independent Holdout RMSE change (>=25% and >=5m).
- Report boundary mean/max shift as leverage, not as proof of error.
- Preserve omitted-model LOO as secondary evidence.
- Highlight suspect/supportive points in both maps and the control table.
- Never add automatic deletion, automatic model switching, or automatic canonical rejection/approval.
- Persist influence summary into draft GeoJSON and canonical patch QA provenance.
