# v0.19 Error Field and Model Diagnostics Implementation Plan

> **For agentic workers:** Execute inline with TDD; no subagents are used for this personal project workflow.

**Goal:** Diagnose why a georeference is inaccurate by visualizing independent check residual vectors and comparing Affine vs Projective models without weakening canonical promotion safeguards.

**Spec:** `docs/superpowers/specs/2026-09-13-v019-error-field-model-diagnostics-design.md`

- [x] Add failing tests for systematic/global versus local error fields.
- [x] Implement meter-space error vectors, direction, coherence, local RMS, quadrant hotspot.
- [x] Add failing tests for Affine vs Projective holdout comparison and safe recommendation.
- [x] Implement dual-model fit/holdout/LOO/boundary divergence.
- [x] Prevent minimally determined 4-point Projective fits from being recommended without LOO evidence.
- [x] Add failing tests for comparison display overlays and residual severity.
- [x] Implement AMap error arrows and dual-model boundary overlays.
- [x] Add diagnostic cards to the workbench.
- [x] Persist diagnostic metrics into draft GeoJSON provenance.
- [x] Document interpretation limits and preserve canonical promotion boundary.
- [x] Run final full Node/Python/syntax/data/security verification.
- [x] Attempt npm registry/build verification and record environment result (`npm ping` timeout; build not claimed).
- [x] Commit and package v0.19.
