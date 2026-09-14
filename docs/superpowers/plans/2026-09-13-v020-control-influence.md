# v0.20 Control Influence Diagnostics Implementation Plan

> **For agentic workers:** Execute inline with TDD; no subagents are used for this personal project workflow.

**Goal:** Add leave-one-fit-point-out influence/leverage diagnostics to the existing georeference workbench without changing canonical promotion gates.

**Spec:** `docs/superpowers/specs/2026-09-13-v020-control-influence-design.md`

- [x] Write RED tests for corrupted fit point detection, minimum control counts and influence classification.
- [x] Implement current-model leave-one-fit-point-out Holdout, LOO and boundary-shift metrics.
- [x] Write RED tests for diagnostic sorting/labels and implement UI adapter.
- [x] Add suspect/supportive highlighting to historical map, AMap markers and control table.
- [x] Add Influence / Leverage QA card and per-point detail table with map selection linkage.
- [x] Persist influence summary into draft GeoJSON provenance.
- [x] Preserve influence warnings in canonical patch QA without changing STRONG readiness semantics.
- [x] Document interpretation limits and explicitly prohibit automatic point deletion.
- [x] Run final full Node/Python/syntax/data/security verification.
- [x] Attempt npm registry/build verification and record environment result (`npm ping` timeout; build not claimed).
- [x] Commit and package v0.20.
