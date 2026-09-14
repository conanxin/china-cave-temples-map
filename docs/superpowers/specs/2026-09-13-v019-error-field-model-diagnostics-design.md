# v0.19 Error Field and Model Diagnostics Design

## Goal

Extend the v0.18 dual-map georeference workbench so independent check-point residuals become a directional error field and the same control set can be evaluated under Affine and Projective models side by side.

## Constraints

- Check points never participate in fitting.
- Error vectors run from model prediction to independent check truth.
- AMap-linked points reuse their original GCJ-02 provenance for display.
- Model comparison never changes `session.method` automatically.
- Projective with exactly four fit points may be displayed but cannot be recommended from low training error when LOO is unavailable.
- All diagnostic overlays and exported metrics remain `draft-unreviewed` research QA.
- No diagnostic can bypass v0.17 human-approved canonical promotion.

## Components

1. `errorField.ts`: meter-space east/north residual vectors, bearing, coherence, local RMS, quadrant hotspot.
2. `modelComparison.ts`: same-fit/same-check Affine vs Projective diagnostics, holdout/LOO and boundary divergence.
3. `diagnosticOverlay.ts`: display severity and WGS84→GCJ-02 comparison paths.
4. `AmapGeoreferenceQaMap.tsx`: toggleable error arrows and dual-model boundaries.
5. `GeoreferenceWorkbench.tsx`: diagnostic cards and export provenance.
6. Documentation describing the heuristic/non-survey nature of the diagnostics.
