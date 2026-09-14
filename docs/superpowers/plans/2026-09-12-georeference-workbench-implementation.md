# Georeference Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser-local georeferencing workbench that fits affine/projective transforms from control points, reports residual QA, digitizes image-space polygons, and exports WGS84/GCJ-02 GeoJSON without automatically publishing draft geometry.

**Architecture:** Add a self-contained `src/georef/` pure-math subsystem plus a React `GeoreferenceWorkbench` overlay. The canonical site dataset remains immutable; workbench sessions persist only to localStorage/export files until explicitly reviewed in a future phase.

**Tech Stack:** React, TypeScript, browser File/ObjectURL APIs, existing WGS84→GCJ-02 utility, Node built-in test runner for pure logic.

**Spec:** `docs/superpowers/specs/2026-09-12-georeference-workbench-design.md`

## Global Constraints

- No backend and no remote image upload.
- Ground control points use WGS84.
- Workbench output is draft research geometry, never auto-promoted into canonical site extents.
- Affine requires ≥3 controls; projective requires ≥4.
- Every production change follows RED → GREEN tests.

---

### Task 1: Linear algebra and transform fitting

**Files:**
- Create: `src/georef/types.ts`
- Create: `src/georef/linearAlgebra.ts`
- Create: `src/georef/fitTransform.ts`
- Test: `src/georef/fitTransform.node.test.ts`

**Interfaces:**
- `fitAffine(controlPoints): AffineModel`
- `fitProjective(controlPoints): ProjectiveModel`
- `applyTransform(model, pixel): GroundPoint`

- [x] Write failing synthetic affine/projective tests including overdetermined controls and singular input.
- [x] Verify RED.
- [x] Implement Gaussian-elimination normal-equation solver and transform fits.
- [x] Verify GREEN.

### Task 2: Residual QA and geometry export

**Files:**
- Create: `src/georef/qa.ts`
- Create: `src/georef/geojson.ts`
- Test: `src/georef/qa.node.test.ts`
- Test: `src/georef/geojson.node.test.ts`

**Interfaces:**
- `evaluateFit(model, controls, thresholds): GeoreferenceFitResult`
- `transformPixelPolygon(model, pixels): GroundPoint[]`
- `buildPolygonFeature(points, crs, properties): GeoJSONFeature`

- [x] Write failing residual/RMSE and closed-polygon tests.
- [x] Verify RED.
- [x] Implement Haversine residual QA and WGS84/GCJ-02 polygon conversion/export.
- [x] Verify GREEN.

### Task 3: Session persistence

**Files:**
- Create: `src/georef/session.ts`
- Test: `src/georef/session.node.test.ts`

**Interfaces:**
- `createSession(targetId?)`
- `serializeSession(session)` / `parseSession(json)`
- `sessionStorageKey(sessionId)`

- [x] Write failing validation/roundtrip tests.
- [x] Verify RED.
- [x] Implement versioned session schema and validation.
- [x] Verify GREEN.

### Task 4: React georeference workbench

**Files:**
- Create: `src/components/GeoreferenceWorkbench.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- `GeoreferenceWorkbench({ site, onClose })`
- Consumes map targets for the selected site and pure `src/georef/` APIs.

- [x] Add local image loading, pixel click capture, control-point table, method selection, fit action and QA display.
- [x] Add polygon digitization mode and WGS84/GCJ-02 GeoJSON previews/downloads.
- [x] Add localStorage save/load and JSON session export/import.
- [x] Add header entry and mobile-safe overlay styling.

### Task 5: Documentation and release verification

**Files:**
- Create: `docs/georeference-workbench.md`
- Modify: `README.md`
- Modify: `package.json`

- [x] Document control point strategy, QA interpretation, output semantics and future official-boundary promotion workflow.
- [x] Run all Node tests, Python pipeline tests and TS/TSX syntax transpile checks.
- [x] Attempt npm install/build; report environment block if still unavailable.
- [x] Commit `feature/v0.15-georef-workbench` and package `china-cave-temples-map-v0.15.zip`.
