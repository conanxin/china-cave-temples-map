# v0.18 Dual-map Visual Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add a persistent AMap QA panel beside the historical image so controls and transformed boundaries can be visually cross-checked before canonical promotion.

**Architecture:** Keep all coordinate/projection logic in pure `src/georef` helpers. `GeoreferenceWorkbench` owns selection and opacity state; a focused `AmapGeoreferenceQaMap` renders AMap markers/polygon and emits control selection or ground picks. Existing v0.17 promotion logic remains unchanged.

**Tech Stack:** React, TypeScript, AMap JS API 2.0, existing georeference math and QA modules, Node native tests.

**Spec:** `docs/superpowers/specs/2026-09-13-v018-dual-map-review-design.md`

## Global Constraints

- Do not write real AMap credentials into source.
- Dual-map overlay is visual QA only and must never mutate canonical extents.
- Preserve original GCJ-02 provenance for `amap-click` controls.
- Manual WGS84 controls may be converted to GCJ-02 for display only.
- Existing v0.17 human approval token and reviewed patch registry remain the only canonical promotion path.

---

### Task 1: Pure dual-map projection helpers

**Files:**
- Create: `src/georef/dualMap.ts`
- Create: `src/georef/dualMap.node.test.ts`

**Interfaces:**
- `getDualMapControlMarkers(session)`
- `getProjectedBoundaryGcj02(session, fit)`
- `getControlDisplayStyle(role, selected)`

- [x] Write failing tests covering provenance reuse, manual conversion, closed projected boundary, and role/selection styles.
- [x] Run the test and confirm RED.
- [x] Implement minimal helpers.
- [x] Run test and confirm GREEN.

### Task 2: Persistent AMap QA component

**Files:**
- Create: `src/components/AmapGeoreferenceQaMap.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Inputs: site, session, fit, selectedControlId, overlayOpacity.
- Outputs: onSelectControl, onGroundPick.

- [x] Add pure helper tests needed for component marker/polygon inputs.
- [x] Implement persistent map, fit/check markers, selected marker emphasis, projected polygon, and click-to-pick callback.
- [x] Show missing-key/error/loading states without breaking the rest of the workbench.

### Task 3: Workbench two-way selection and split layout

**Files:**
- Modify: `src/components/GeoreferenceWorkbench.tsx`
- Modify: `src/styles.css`

- [x] Add selected-control state and opacity state.
- [x] Historical-image markers and table rows select the same control ID.
- [x] Replace modal-only ground picker as the primary workflow with the persistent QA map while keeping the old picker as a fallback if useful.
- [x] Add visual QA draft disclaimer and opacity slider.

### Task 4: Regression safety

**Files:**
- Modify: `README.md`
- Create: `docs/dual-map-visual-review.md`
- Modify: `package.json`

- [x] Document visual QA semantics and non-promotion boundary.
- [x] Run all Node georef/data tests.
- [x] Run all Python tests.
- [x] Transpile all TS/TSX for syntax diagnostics.
- [x] Attempt npm build; record environment blocker if registry remains unreachable.
- [x] Package v0.18 with clean root folder.
