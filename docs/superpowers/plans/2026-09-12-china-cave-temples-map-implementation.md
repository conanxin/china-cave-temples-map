# 中国代表性石窟寺互动地图 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a static React/Vite research map that digitizes all 112 numbered sites from the National Museum exhibition wall and renders verified sites on AMap with search, filters, index navigation, and a research-ready details panel.

**Architecture:** The app separates the canonical site dataset, pure filter/query logic, AMap integration, and presentation components. Site records always retain provenance and coordinate confidence; the map renders only verified coordinates by default while the full textual index remains browsable without an AMap key.

**Tech Stack:** Vite, React, TypeScript, Vitest, React Testing Library, AMap JavaScript API 2.0, CSS.

**Spec:** `docs/superpowers/specs/2026-09-12-china-cave-temples-map-design.md`

## Global Constraints

- No real AMap key or security code is committed; runtime variables are `VITE_AMAP_KEY` and `VITE_AMAP_SECURITY_CODE`.
- Canonical site IDs are exactly `01` through `112`, with no omissions or duplicates.
- GCJ-02 coordinates are stored only when sufficiently verified; unresolved records remain explicit and are not rendered as precise markers.
- The app remains usable as a searchable/filterable textual research index when AMap is not configured.
- No backend, accounts, cloud editing, routing, or sync in v1.

---

### Task 1: Scaffold the typed React application and test harness

**Files:**
- Create: `package.json`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `index.html`
- Create: `.env.example`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/styles.css`
- Create: `src/test/setup.ts`

**Interfaces:**
- Produces a Vite entry point and Vitest environment used by all later tasks.

- [x] Create package/config files with React, TypeScript, Vite, Vitest and Testing Library dependencies.
- [x] Add `.env.example` with AMap placeholders only.
- [x] Add a minimal application shell and test setup.
- [ ] Run `npm install` and `npm test` to prove the harness boots.

### Task 2: Encode the 112-site canonical exhibition dataset

**Files:**
- Create: `src/data/types.ts`
- Create: `src/data/sites.ts`
- Create: `src/data/sites.test.ts`

**Interfaces:**
- Produces: `CaveTempleSite`, `sites: CaveTempleSite[]`, region/batch/type/religion enums.
- Consumers: filtering logic, map layer, index, details panel.

- [x] Define the data model from the approved spec, with optional coordinates so unresolved points cannot masquerade as exact.
- [x] Transcribe all 112 exhibition numbers/names and attach region, province, heritage batch, religion/type metadata where confidently established.
- [x] Add invariants tests: length 112, IDs 1..112 continuous, codes unique, names non-empty.
- [ ] Run the data tests.

### Task 3: Implement pure search/filter/query logic

**Files:**
- Create: `src/features/sites/filterSites.ts`
- Create: `src/features/sites/filterSites.test.ts`

**Interfaces:**
- Consumes: `CaveTempleSite[]`, `SiteFilters`.
- Produces: `filterSites(sites, filters): CaveTempleSite[]` and `matchesSearch(site, query): boolean`.

- [x] Write tests for number/name/location search and combinable filters.
- [x] Implement normalized text matching and filter predicates.
- [ ] Run tests.

### Task 4: Build the research workspace UI without map dependency

**Files:**
- Create: `src/components/Toolbar.tsx`
- Create: `src/components/FilterPanel.tsx`
- Create: `src/components/SiteIndex.tsx`
- Create: `src/components/SiteDetail.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Create: `src/App.test.tsx`

**Interfaces:**
- `FilterPanel` receives filter state and update/reset callbacks.
- `SiteIndex` receives filtered sites and selected ID.
- `SiteDetail` receives selected site.

- [x] Write UI test verifying the 112 record total and search selection behavior.
- [x] Implement desktop and mobile-friendly archive layout.
- [x] Implement index → detail selection and selected-row highlighting.
- [ ] Run tests.

### Task 5: Add AMap loader and map adapter

**Files:**
- Create: `src/map/amapLoader.ts`
- Create: `src/map/AmapMap.tsx`
- Create: `src/map/amap.d.ts`
- Create: `src/map/amapLoader.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- `loadAmap(key, securityCode): Promise<typeof AMap>`.
- `AmapMap` receives filtered sites with verified coordinates, selected ID, and selection callback.

- [x] Test missing-key behavior without loading a remote script.
- [x] Implement one-time AMap JS API 2.0 loader and security config.
- [x] Render custom numbered markers for verified records only.
- [x] Implement marker click → details, selected marker emphasis, and fit-view action.
- [x] Show configuration instructions when key is absent.
- [ ] Run tests.

### Task 6: Research and attach coordinate provenance

**Files:**
- Modify: `src/data/sites.ts`
- Create: `docs/coordinate-audit.md`

**Interfaces:**
- Each resolved site receives `lng`, `lat`, `coordinateConfidence`, `coordinateSource`, `verificationNote`, and `siteExtent`.

- [ ] For each exhibition site, confirm formal name and administrative location from authoritative cultural heritage sources.
- [ ] Resolve the actual grotto/temple/official entrance or group core point; reject city/county centroids.
- [ ] Record GCJ-02 coordinates and the evidence trail.
- [ ] Keep unresolved sites explicit instead of inventing coordinates.
- [ ] Update audit counts and verify the map renders only `verified` points by default.

### Task 7: Polish responsive behavior and research affordances

**Files:**
- Modify: `src/styles.css`
- Modify: `src/components/SiteDetail.tsx`
- Modify: `src/components/SiteIndex.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- No new public API; improves layout and future-field placeholders.

- [x] Add compact mobile drawer/bottom-sheet behavior using CSS and local state.
- [x] Add visible coordinate-verification badges and data-source notes.
- [x] Add empty states and counts for current filters.
- [x] Add reserved sections for geology, statue scale, damage, missing-head evidence, bibliography, historical photos and field notes.

### Task 8: Verify build and package the deliverable

**Files:**
- Create: `README.md`
- Modify: documentation as needed.

**Interfaces:**
- Project starts with `npm install && npm run dev`; tests run with `npm test`; production build runs with `npm run build`.

- [x] Document AMap key setup and project structure.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Inspect the generated project tree and ensure `.env` secrets are absent.
- [ ] Report exact coordinate-audit coverage rather than claiming unverified points are accurate.
