import test from 'node:test'
import assert from 'node:assert/strict'
import { createSession } from './session.ts'
import { buildSessionGeoJson, fitSession } from './workbench.ts'
import { evaluateSessionQa } from './advancedQa.ts'
import { compareAreaHa, geodesicPolygonAreaHa } from './areaQa.ts'
import { transformPixelPolygon } from './geojson.ts'
import { analyzeCheckErrorField } from './errorField.ts'
import { compareGeoreferenceModels } from './modelComparison.ts'
import { analyzeFitPointInfluence } from './controlInfluence.ts'
import { analyzeRobustGeoreference } from './robustRansac.ts'
import { analyzeIrlsGeoreference } from './robustIrls.ts'

test('workbench fits a session and exports draft WGS84/GCJ-02 polygons', () => {
  const session = createSession({ id: 'wb', now: '2026-09-12T20:00:00.000Z' })
  session.controls = [
    { id: 'a', pixel: { x: 0, y: 0 }, ground: { lng: 116, lat: 39 } },
    { id: 'b', pixel: { x: 100, y: 0 }, ground: { lng: 116.1, lat: 39 } },
    { id: 'c', pixel: { x: 0, y: 100 }, ground: { lng: 116, lat: 39.1 } },
    { id: 'd', pixel: { x: 100, y: 100 }, ground: { lng: 116.1, lat: 39.1 } },
  ]
  session.boundaryPixels = [{ x: 10, y: 10 }, { x: 80, y: 10 }, { x: 80, y: 80 }, { x: 10, y: 80 }]

  const fit = fitSession(session)
  assert.equal(fit.verdict, 'pass')
  const output = buildSessionGeoJson(session, fit)
  assert.equal(output.wgs84.properties.coordinateSystem, 'WGS84')
  assert.equal(output.gcj02.properties.coordinateSystem, 'GCJ-02')
  assert.equal(output.wgs84.properties.reviewStatus, 'draft-unreviewed')
  assert.equal(output.wgs84.geometry.coordinates[0].length, 5)
})

test('GeoJSON export refuses a session without enough boundary points', () => {
  const session = createSession({ id: 'short', now: '2026-09-12T20:00:00.000Z' })
  session.controls = [
    { id: 'a', pixel: { x: 0, y: 0 }, ground: { lng: 116, lat: 39 } },
    { id: 'b', pixel: { x: 100, y: 0 }, ground: { lng: 116.1, lat: 39 } },
    { id: 'c', pixel: { x: 0, y: 100 }, ground: { lng: 116, lat: 39.1 } },
  ]
  const fit = fitSession(session)
  assert.throws(() => buildSessionGeoJson(session, fit), /at least 3/i)
})

test('fitSession excludes check-role controls from the fitted model', () => {
  const session = createSession({ id: 'roles-fit', now: '2026-09-13T06:00:00.000Z' })
  session.controls = [
    { id: 'a', role: 'fit', pixel: { x: 0, y: 0 }, ground: { lng: 100, lat: 30 } },
    { id: 'b', role: 'fit', pixel: { x: 100, y: 0 }, ground: { lng: 101, lat: 30 } },
    { id: 'c', role: 'fit', pixel: { x: 0, y: 100 }, ground: { lng: 100, lat: 31 } },
    { id: 'check', role: 'check', pixel: { x: 50, y: 50 }, ground: { lng: 999, lat: 999 } },
  ]
  const fit = fitSession(session)
  assert.ok(fit.rmseM < 1e-6)
})

test('GeoJSON export can carry independent QA and official-area comparison without changing draft status', () => {
  const session = createSession({ id: 'qa-export', now: '2026-09-13T06:00:00.000Z' })
  session.imageWidth = 100
  session.imageHeight = 100
  session.boundaryExtentId = '05-wh-property'
  session.controls = [
    { id: 'a', role: 'fit', pixel: { x: 0, y: 0 }, ground: { lng: 116, lat: 39 } },
    { id: 'b', role: 'fit', pixel: { x: 100, y: 0 }, ground: { lng: 116.01, lat: 39 } },
    { id: 'c', role: 'fit', pixel: { x: 0, y: 100 }, ground: { lng: 116, lat: 39.01 } },
    { id: 'd', role: 'fit', pixel: { x: 100, y: 100 }, ground: { lng: 116.01, lat: 39.01 } },
    { id: 'check-1', role: 'check', pixel: { x: 50, y: 50 }, ground: { lng: 116.005, lat: 39.005 }, groundSource: 'amap-click', groundSourceCrs: 'GCJ-02', groundSourceOriginal: { lng: 116.011, lat: 38.999 } },
    { id: 'check-2', role: 'check', pixel: { x: 25, y: 75 }, ground: { lng: 116.0025, lat: 39.0075 } },
  ]
  session.boundaryPixels = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]
  const qa = evaluateSessionQa(session)
  const area = compareAreaHa(geodesicPolygonAreaHa(transformPixelPolygon(qa.fit.model, session.boundaryPixels)), 95.9)
  const errorField = analyzeCheckErrorField(session, qa.fit.model)
  const modelComparison = compareGeoreferenceModels(session)
  const controlInfluence = analyzeFitPointInfluence(session)
  const robust = analyzeRobustGeoreference(session)
  const output = buildSessionGeoJson(session, qa.fit, { advancedQa: qa, areaComparison: area, errorField, modelComparison, controlInfluence, robust })
  assert.equal(output.wgs84.properties.reviewStatus, 'draft-unreviewed')
  assert.equal(output.wgs84.properties.checkPointCount, 2)
  assert.equal(output.wgs84.properties.amapLinkedControlCount, 1)
  assert.equal(output.wgs84.properties.holdoutVerdict, 'pass')
  assert.equal(output.wgs84.properties.looAvailable, true)
  assert.equal(output.wgs84.properties.spatialDistributionVerdict, 'good')
  assert.equal(output.wgs84.properties.officialAreaHa, 95.9)
  assert.equal(output.wgs84.properties.areaVerdict, 'pass')
  assert.equal(output.wgs84.properties.errorPattern, 'stable')
  assert.equal(typeof output.wgs84.properties.systematicBiasM, 'number')
  assert.equal(output.wgs84.properties.modelRecommendation, 'affine')
  assert.equal(typeof output.wgs84.properties.affineHoldoutRmseM, 'number')
  assert.equal(typeof output.wgs84.properties.projectiveHoldoutRmseM, 'number')
  assert.equal(output.wgs84.properties.controlInfluenceAvailable, true)
  assert.equal(typeof output.wgs84.properties.controlInfluenceSuspectCount, 'number')
  assert.equal(typeof output.wgs84.properties.controlInfluenceSupportiveCount, 'number')
  assert.ok('controlInfluenceTopSuspectId' in output.wgs84.properties)
  assert.equal(typeof output.wgs84.properties.controlInfluenceMaxBoundaryShiftM, 'number')
})


test('GeoJSON provenance preserves robust consensus diagnostics while remaining draft-unreviewed', () => {
  const session = createSession({ id: 'robust-export', now: '2026-09-13T09:20:00.000Z' })
  session.controls = [
    { id: 'fit-1', role: 'fit', pixel: { x: 0, y: 0 }, ground: { lng: 100, lat: 30 } },
    { id: 'fit-2', role: 'fit', pixel: { x: 1000, y: 0 }, ground: { lng: 101, lat: 30 } },
    { id: 'fit-3', role: 'fit', pixel: { x: 0, y: 1000 }, ground: { lng: 100, lat: 31 } },
    { id: 'fit-bad', role: 'fit', pixel: { x: 1000, y: 1000 }, ground: { lng: 101.0012, lat: 30.9989 } },
    { id: 'fit-5', role: 'fit', pixel: { x: 500, y: 250 }, ground: { lng: 100.5, lat: 30.25 } },
    { id: 'fit-6', role: 'fit', pixel: { x: 250, y: 700 }, ground: { lng: 100.25, lat: 30.7 } },
    { id: 'check-1', role: 'check', pixel: { x: 200, y: 800 }, ground: { lng: 100.2, lat: 30.8 } },
    { id: 'check-2', role: 'check', pixel: { x: 800, y: 200 }, ground: { lng: 100.8, lat: 30.2 } },
  ]
  session.boundaryPixels = [{ x: 50, y: 50 }, { x: 950, y: 50 }, { x: 950, y: 950 }, { x: 50, y: 950 }]
  const fit = fitSession(session)
  const robust = analyzeRobustGeoreference(session)
  assert.equal(robust.available, true)
  const output = buildSessionGeoJson(session, fit, { robust })
  assert.equal(output.wgs84.properties.reviewStatus, 'draft-unreviewed')
  assert.equal(output.wgs84.properties.robustAvailable, true)
  assert.equal(output.wgs84.properties.robustMethod, 'affine')
  assert.equal(typeof output.wgs84.properties.robustThresholdM, 'number')
  assert.equal(typeof output.wgs84.properties.robustTrialCount, 'number')
  assert.equal(output.wgs84.properties.robustOutlierCount, 1)
  assert.equal(output.wgs84.properties.robustTopOutlierId, 'fit-bad')
  assert.equal(typeof output.wgs84.properties.robustHoldoutRmseM, 'number')
  assert.equal(typeof output.wgs84.properties.robustBoundaryMaxDivergenceM, 'number')
  assert.equal(output.wgs84.properties.robustRecommendation, 'review-outliers')
})


test('GeoJSON provenance preserves Huber/Tukey IRLS diagnostics while remaining draft-unreviewed', () => {
  const session = createSession({ id: 'irls-export', now: '2026-09-13T10:10:00.000Z' })
  session.method = 'affine'
  const ground = (x: number, y: number) => ({ lng: 100 + x * 0.001, lat: 30 + y * 0.001 })
  session.controls = [
    { id: 'fit-1', role: 'fit', pixel: { x: 0, y: 0 }, ground: ground(0, 0) },
    { id: 'fit-2', role: 'fit', pixel: { x: 1000, y: 0 }, ground: ground(1000, 0) },
    { id: 'fit-3', role: 'fit', pixel: { x: 0, y: 1000 }, ground: ground(0, 1000) },
    { id: 'fit-bad', role: 'fit', pixel: { x: 1000, y: 1000 }, ground: { lng: 101.003, lat: 30.997 } },
    { id: 'fit-5', role: 'fit', pixel: { x: 500, y: 250 }, ground: ground(500, 250) },
    { id: 'fit-6', role: 'fit', pixel: { x: 250, y: 700 }, ground: ground(250, 700) },
    { id: 'fit-7', role: 'fit', pixel: { x: 800, y: 550 }, ground: ground(800, 550) },
    { id: 'check-1', role: 'check', pixel: { x: 200, y: 800 }, ground: ground(200, 800) },
    { id: 'check-2', role: 'check', pixel: { x: 800, y: 200 }, ground: ground(800, 200) },
  ]
  session.boundaryPixels = [{ x: 100, y: 100 }, { x: 900, y: 100 }, { x: 900, y: 900 }, { x: 100, y: 900 }]
  const fit = fitSession(session)
  const irls = analyzeIrlsGeoreference(session)
  assert.equal(irls.available, true)
  const output = buildSessionGeoJson(session, fit, { irls })
  assert.equal(output.wgs84.properties.reviewStatus, 'draft-unreviewed')
  assert.equal(output.wgs84.properties.irlsAvailable, true)
  assert.equal(output.wgs84.properties.irlsRecommendation, 'review-downweighted')
  assert.equal(output.wgs84.properties.irlsTopDownweightedId, 'fit-bad')
  assert.equal(typeof output.wgs84.properties.huberHoldoutRmseM, 'number')
  assert.equal(typeof output.wgs84.properties.tukeyHoldoutRmseM, 'number')
  assert.equal(typeof output.wgs84.properties.huberMinWeight, 'number')
  assert.equal(typeof output.wgs84.properties.tukeyMinWeight, 'number')
  assert.equal(typeof output.wgs84.properties.irlsBoundaryMaxDivergenceM, 'number')
})

import type { LocalDistortionModelComparison, LocalDistortionResult } from './localDistortion.ts'

test('draft GeoJSON preserves local-distortion field and cross-model recommendation provenance', () => {
  const localDistortion: LocalDistortionResult = {
    available: true,
    checkCount: 6,
    pattern: 'localized-hotspot',
    meanResidualM: 48,
    maxResidualM: 92,
    systematicMagnitudeM: 8,
    localRmsM: 46,
    gradientExplainedFraction: 0.42,
    postFieldRmsM: 31,
    fieldVariationM: 68,
    gradient: { eastDxM: 35, eastDyM: 12, northDxM: -6, northDyM: 22, divergenceM: 57, rotationM: -18, shearM: 20 },
    gridCells: [],
    hotspotContrast: 2.6,
    hotspotRegion: 'NE',
    hotspotCell: { row: 0, col: 3, centerPixel: { x: 875, y: 125 }, eastM: 52, northM: 12, magnitudeM: 53.4, supportScore: 0.9, severity: 'review', region: 'NE' },
  }
  const localDistortionComparison: LocalDistortionModelComparison = {
    recommendation: 'consider-piecewise',
    bestModelId: 'tukey',
    bestMeanResidualM: 31,
    nonStableModelCount: 5,
    persistentHotspotRegion: 'NE',
    reasons: ['persistent hotspot'],
  }
  const session = createSession({ id: 'local-distortion-export', now: '2026-09-13T08:20:00.000Z' })
  session.controls = [
    { id: 'a', role: 'fit', pixel: { x: 0, y: 0 }, ground: { lng: 100, lat: 30 } },
    { id: 'b', role: 'fit', pixel: { x: 100, y: 0 }, ground: { lng: 100.1, lat: 30 } },
    { id: 'c', role: 'fit', pixel: { x: 0, y: 100 }, ground: { lng: 100, lat: 30.1 } },
  ]
  session.boundaryPixels = [{ x: 10, y: 10 }, { x: 90, y: 10 }, { x: 90, y: 90 }, { x: 10, y: 90 }]
  const fit = fitSession(session)
  const output = buildSessionGeoJson(session, fit, { localDistortion, localDistortionComparison })
  const props = output.wgs84.properties as Record<string, unknown>
  assert.equal(props.localDistortionAvailable, true)
  assert.equal(props.localDistortionPattern, 'localized-hotspot')
  assert.equal(props.localDistortionGradientExplainedFraction, 0.42)
  assert.equal(props.localDistortionFieldVariationM, 68)
  assert.equal(props.localDistortionHotspotRegion, 'NE')
  assert.equal(props.localDistortionRecommendation, 'consider-piecewise')
  assert.equal(props.localDistortionBestModelId, 'tukey')
  assert.equal(props.localDistortionPersistentHotspotRegion, 'NE')
  assert.equal(props.localDistortionPiecewiseSuggested, true)
  assert.equal(props.reviewStatus, 'draft-unreviewed')
})

import type { PiecewiseSimulationResult } from './piecewiseRegistration.ts'

test('draft GeoJSON preserves piecewise candidate simulation without changing review status', () => {
  const session = createSession({ id: 'piecewise-export', now: '2026-09-13T10:00:00.000Z' })
  session.controls = [
    { id: 'a', role: 'fit', pixel: { x: 0, y: 0 }, ground: { lng: 100, lat: 30 } },
    { id: 'b', role: 'fit', pixel: { x: 100, y: 0 }, ground: { lng: 100.1, lat: 30 } },
    { id: 'c', role: 'fit', pixel: { x: 0, y: 100 }, ground: { lng: 100, lat: 30.1 } },
  ]
  session.boundaryPixels = [{ x: 10, y: 10 }, { x: 90, y: 10 }, { x: 90, y: 90 }, { x: 10, y: 90 }]
  const fit = fitSession(session)
  const piecewise: PiecewiseSimulationResult = {
    available: true,
    baselineHoldoutRmseM: 61,
    bestLayout: 'vertical-2',
    recommendation: 'consider-piecewise',
    reasons: ['persistent vertical scale difference'],
    candidates: [
      { layout: 'vertical-2', available: true, regions: [], baselineHoldoutRmseM: 61, holdoutRmseM: 12, holdoutMaxResidualM: 18, holdoutVerdict: 'pass', improvementPercent: 80, seamMeanM: 7, seamMaxM: 15, seamSampleCount: 5, foldOverRisk: false, unvalidatedRegionCount: 0, recommendation: 'promising', reasons: ['good'] },
    ],
  }
  const output = buildSessionGeoJson(session, fit, { piecewise })
  const props = output.wgs84.properties as Record<string, unknown>
  assert.equal(props.piecewiseAvailable, true)
  assert.equal(props.piecewiseRecommendation, 'consider-piecewise')
  assert.equal(props.piecewiseBestLayout, 'vertical-2')
  assert.equal(props.piecewiseBestHoldoutRmseM, 12)
  assert.equal(props.piecewiseBestSeamMaxM, 15)
  assert.equal(props.piecewiseBestFoldOverRisk, false)
  assert.equal(props.reviewStatus, 'draft-unreviewed')
})

import type { SpatialCrossValidationResult } from './spatialCrossValidation.ts'

function spatialCvFixture(): SpatialCrossValidationResult {
  return {
    available: true,
    gridColumns: 3,
    gridRows: 2,
    bestGlobalModelId: 'affine',
    bestPiecewiseModelId: 'piecewise-vertical-2',
    rawImprovementPercent: 42,
    adjustedImprovementPercent: 37,
    recommendation: 'piecewise-supported',
    reasons: ['spatial CV supports piecewise'],
    models: [
      {
        id: 'affine', label: 'Global Affine', parameterCount: 6, totalFitPointCount: 18, evaluatedPointCount: 18, coverageRatio: 1,
        folds: [{ id: 'r0c0', row: 0, column: 0, available: true, heldOutControlIds: ['a'], trainingControlCount: 17, rmseM: 40, maxResidualM: 40 }],
        complexitySurchargePercent: 0, available: true, cvRmseM: 40, cvMaxResidualM: 70, adjustedCvRmseM: 40,
        foldRmseMeanM: 40, foldRmseStdM: 4, foldStabilityRatio: 0.1, independentCheckCount: 4, independentCheckRmseM: 38,
        independentCheckMaxResidualM: 52, minTrainingSupportRatio: 5.6, worstFoldId: 'r0c0',
      },
      {
        id: 'piecewise-vertical-2', label: 'Piecewise 2×1', parameterCount: 12, totalFitPointCount: 18, evaluatedPointCount: 18, coverageRatio: 1,
        folds: [{ id: 'r1c2', row: 1, column: 2, available: true, heldOutControlIds: ['b'], trainingControlCount: 17, rmseM: 21, maxResidualM: 21 }],
        complexitySurchargePercent: 5, available: true, cvRmseM: 22, cvMaxResidualM: 35, adjustedCvRmseM: 23.1,
        foldRmseMeanM: 22, foldRmseStdM: 3, foldStabilityRatio: 0.14, independentCheckCount: 4, independentCheckRmseM: 18,
        independentCheckMaxResidualM: 28, minTrainingSupportRatio: 1.67, worstFoldId: 'r1c2',
      },
    ],
  }
}

test('draft GeoJSON preserves spatial CV and complexity evidence without changing review status', () => {
  const session = createSession({ id: 'spatial-cv-export', now: '2026-09-13T11:30:00.000Z' })
  session.controls = [
    { id: 'a', role: 'fit', pixel: { x: 0, y: 0 }, ground: { lng: 100, lat: 30 } },
    { id: 'b', role: 'fit', pixel: { x: 100, y: 0 }, ground: { lng: 100.1, lat: 30 } },
    { id: 'c', role: 'fit', pixel: { x: 0, y: 100 }, ground: { lng: 100, lat: 30.1 } },
  ]
  session.boundaryPixels = [{ x: 10, y: 10 }, { x: 90, y: 10 }, { x: 90, y: 90 }, { x: 10, y: 90 }]
  const fit = fitSession(session)
  const output = buildSessionGeoJson(session, fit, { spatialCv: spatialCvFixture() })
  const props = output.wgs84.properties as Record<string, unknown>
  assert.equal(props.spatialCvAvailable, true)
  assert.equal(props.spatialCvRecommendation, 'piecewise-supported')
  assert.equal(props.spatialCvBestGlobalModelId, 'affine')
  assert.equal(props.spatialCvBestPiecewiseModelId, 'piecewise-vertical-2')
  assert.equal(props.spatialCvAdjustedImprovementPercent, 37)
  assert.equal(props.spatialCvBestPiecewiseWorstFoldId, 'r1c2')
  assert.equal(props.reviewStatus, 'draft-unreviewed')
})

import type { MonteCarloUncertaintyResult } from './monteCarloUncertainty.ts'

function monteCarloFixture(): MonteCarloUncertaintyResult {
  return {
    available: true,
    trials: 200,
    successfulTrials: 198,
    seed: 27027,
    pixelSigmaPx: 1.5,
    groundSigmaM: 10,
    uncertaintyMode: 'evidence-profiled',
    controlProfiles: [
      { controlId: 'a', pixelEvidence: 'exact-corner', groundEvidence: 'official-survey-gis', pixelSigmaPx: 0.7, groundSigmaM: 2, calibrationSource: 'explicit-evidence', rationale: [] },
      { controlId: 'b', pixelEvidence: 'unknown', groundEvidence: 'unknown', pixelSigmaPx: 1.5, groundSigmaM: 10, calibrationSource: 'fallback', rationale: [] },
    ],
    uncertaintySummary: { fitControlCount: 2, profiledControlCount: 1, fallbackControlCount: 1, pixelSigmaRangePx: [0.7, 1.5], groundSigmaRangeM: [2, 10], meanPixelSigmaPx: 1.1, meanGroundSigmaM: 6 },
    winnerModelId: 'piecewise-vertical-2',
    winnerRate: 0.71,
    runnerUpModelId: 'affine',
    runnerUpRate: 0.21,
    recommendation: 'piecewise-stable',
    reasons: ['stable under perturbation'],
    models: [
      { id: 'piecewise-vertical-2', label: 'Piecewise 2×1', parameterCount: 12, complexitySurchargePercent: 5, validTrials: 200, wins: 142, winRate: 0.71, meanHoldoutRmseM: 15, meanAdjustedScoreM: 15.75 },
      { id: 'affine', label: 'Global Affine', parameterCount: 6, complexitySurchargePercent: 0, validTrials: 200, wins: 42, winRate: 0.21, meanHoldoutRmseM: 26, meanAdjustedScoreM: 26 },
    ],
    boundary: {
      vertices: [
        { vertexIndex: 0, baseline: { lng: 100, lat: 30 }, p50M: 6, p95M: 18, maxM: 27 },
        { vertexIndex: 1, baseline: { lng: 101, lat: 30 }, p50M: 8, p95M: 24, maxM: 38 },
        { vertexIndex: 2, baseline: { lng: 101, lat: 31 }, p50M: 5, p95M: 16, maxM: 25 },
      ],
      segments: [
        { startVertexIndex: 0, endVertexIndex: 1, p95M: 21, maxM: 38 },
        { startVertexIndex: 1, endVertexIndex: 2, p95M: 20, maxM: 38 },
        { startVertexIndex: 2, endVertexIndex: 0, p95M: 17, maxM: 27 },
      ],
      meanP95M: 19.33,
      maxP95M: 24,
      maxObservedM: 38,
      mostUnstableSegment: { startVertexIndex: 0, endVertexIndex: 1, p95M: 21, maxM: 38 },
    },
  }
}

test('draft GeoJSON preserves Monte Carlo model stability and boundary uncertainty evidence', () => {
  const session = createSession({ id: 'mc-export', now: '2026-09-13T12:30:00.000Z' })
  session.controls = [
    { id: 'a', role: 'fit', pixel: { x: 0, y: 0 }, ground: { lng: 100, lat: 30 } },
    { id: 'b', role: 'fit', pixel: { x: 100, y: 0 }, ground: { lng: 100.1, lat: 30 } },
    { id: 'c', role: 'fit', pixel: { x: 0, y: 100 }, ground: { lng: 100, lat: 30.1 } },
  ]
  session.boundaryPixels = [{ x: 10, y: 10 }, { x: 90, y: 10 }, { x: 90, y: 90 }, { x: 10, y: 90 }]
  const fit = fitSession(session)
  const output = buildSessionGeoJson(session, fit, { monteCarlo: monteCarloFixture() })
  const props = output.wgs84.properties as Record<string, unknown>
  assert.equal(props.monteCarloAvailable, true)
  assert.equal(props.monteCarloTrials, 200)
  assert.equal(props.monteCarloWinnerModelId, 'piecewise-vertical-2')
  assert.equal(props.monteCarloWinnerRate, 0.71)
  assert.equal(props.monteCarloRecommendation, 'piecewise-stable')
  assert.equal(props.monteCarloUncertaintyMode, 'evidence-profiled')
  assert.equal(props.monteCarloProfiledControlCount, 1)
  assert.equal(props.monteCarloFallbackControlCount, 1)
  assert.equal(props.monteCarloGroundSigmaMinM, 2)
  assert.equal(props.monteCarloGroundSigmaMaxM, 10)
  assert.equal(props.monteCarloBoundaryMaxP95M, 24)
  assert.equal(props.monteCarloMostUnstableSegment, '0-1')
  assert.equal(props.reviewStatus, 'draft-unreviewed')
})

import type { SystematicStressResult } from './systematicStress.ts'

function systematicStressFixture(): SystematicStressResult {
  return {
    available: true,
    baselineWinnerModelId: 'affine',
    baselineActiveHoldoutRmseM: 12,
    dominantScenarioId: 'regional-ground-bias',
    maxHoldoutIncreaseM: 31,
    maxBoundaryShiftM: 58,
    modelFlipCount: 3,
    recommendation: 'boundary-sensitive',
    reasons: ['regional bias moves the boundary'],
    options: {
      rotationDeg: 0.25,
      anisotropicScaleFraction: 0.0035,
      commonGroundShiftM: 10,
      regionalGroundBiasM: 15,
      singleControlGrossErrorM: 40,
      pixelWaveAmplitudePx: 2,
    },
    scenarios: [
      {
        id: 'regional-ground-bias',
        label: '区域相关地面偏移',
        maxHoldoutRmseM: 43,
        maxHoldoutIncreaseM: 31,
        maxBoundaryShiftM: 58,
        modelFlipCount: 3,
        variants: [
          {
            id: 'west-half-east',
            label: '西半幅向东 15m',
            modelWinnerId: 'projective',
            modelWinnerChanged: true,
            activeHoldoutRmseM: 43,
            holdoutIncreaseM: 31,
            boundary: {
              baseline: [{ lng: 100, lat: 30 }, { lng: 101, lat: 30 }, { lng: 101, lat: 31 }],
              stressed: [{ lng: 100.0001, lat: 30 }, { lng: 101.0004, lat: 30 }, { lng: 101.0002, lat: 31 }],
              vertexShiftsM: [10, 39, 19],
              meanShiftM: 22.7,
              maxShiftM: 39,
              mostUnstableSegment: { startVertexIndex: 0, endVertexIndex: 1, scoreM: 24.5 },
            },
          },
        ],
        worstVariant: {
          id: 'west-half-east',
          label: '西半幅向东 15m',
          modelWinnerId: 'projective',
          modelWinnerChanged: true,
          activeHoldoutRmseM: 43,
          holdoutIncreaseM: 31,
          boundary: {
            baseline: [{ lng: 100, lat: 30 }, { lng: 101, lat: 30 }, { lng: 101, lat: 31 }],
            stressed: [{ lng: 100.0001, lat: 30 }, { lng: 101.0004, lat: 30 }, { lng: 101.0002, lat: 31 }],
            vertexShiftsM: [10, 39, 19],
            meanShiftM: 22.7,
            maxShiftM: 39,
            mostUnstableSegment: { startVertexIndex: 0, endVertexIndex: 1, scoreM: 24.5 },
          },
        },
      },
    ],
  }
}

test('draft GeoJSON preserves systematic stress evidence without changing review status', () => {
  const session = createSession({ id: 'stress-export', now: '2026-09-13T13:30:00.000Z' })
  session.controls = [
    { id: 'a', role: 'fit', pixel: { x: 0, y: 0 }, ground: { lng: 100, lat: 30 } },
    { id: 'b', role: 'fit', pixel: { x: 100, y: 0 }, ground: { lng: 100.1, lat: 30 } },
    { id: 'c', role: 'fit', pixel: { x: 0, y: 100 }, ground: { lng: 100, lat: 30.1 } },
  ]
  session.boundaryPixels = [{ x: 10, y: 10 }, { x: 90, y: 10 }, { x: 90, y: 90 }, { x: 10, y: 90 }]
  const fit = fitSession(session)
  const output = buildSessionGeoJson(session, fit, { systematicStress: systematicStressFixture() })
  const props = output.wgs84.properties as Record<string, unknown>
  assert.equal(props.systematicStressAvailable, true)
  assert.equal(props.systematicStressRecommendation, 'boundary-sensitive')
  assert.equal(props.systematicStressDominantScenarioId, 'regional-ground-bias')
  assert.equal(props.systematicStressBaselineWinnerModelId, 'affine')
  assert.equal(props.systematicStressModelFlipCount, 3)
  assert.equal(props.systematicStressMaxHoldoutIncreaseM, 31)
  assert.equal(props.systematicStressMaxBoundaryShiftM, 58)
  assert.equal(props.systematicStressRotationDeg, 0.25)
  assert.equal(props.systematicStressRegionalGroundBiasM, 15)
  assert.equal(props.systematicStressSingleControlGrossErrorM, 40)
  assert.equal(props.reviewStatus, 'draft-unreviewed')
})

import type { UncertainCheckHoldoutResult } from './checkUncertainty.ts'

function uncertainCheckFixture(): UncertainCheckHoldoutResult {
  return {
    available: true,
    checkCount: 3,
    rawRmseM: 21,
    rawMaxResidualM: 31,
    normalizedRms: 2.4,
    maxStandardizedResidual: 4.2,
    compatibleCount: 1,
    tensionCount: 1,
    inconsistentCount: 1,
    overallInterpretation: 'inconsistent',
    profiledCheckCount: 2,
    fallbackCheckCount: 1,
    effectiveSigmaRangeM: [2.3, 16.2],
    checks: [
      { controlId: 'c1', residualM: 9, pixelSigmaPx: 0.7, groundSigmaM: 2, localMetersPerPixel: 1, effectiveSigmaM: 2.1, standardizedResidual: 4.2, interpretation: 'inconsistent', calibrationSource: 'explicit-evidence' },
      { controlId: 'c2', residualM: 25, pixelSigmaPx: 1.2, groundSigmaM: 12, localMetersPerPixel: 1, effectiveSigmaM: 12.1, standardizedResidual: 2.1, interpretation: 'tension', calibrationSource: 'explicit-evidence' },
      { controlId: 'c3', residualM: 31, pixelSigmaPx: 1.5, groundSigmaM: 10, localMetersPerPixel: 1, effectiveSigmaM: 10.1, standardizedResidual: 1.8, interpretation: 'compatible', calibrationSource: 'fallback' },
    ],
  }
}

test('draft GeoJSON preserves uncertain-check evidence without replacing raw holdout fields', () => {
  const session = createSession({ id: 'check-uncertainty-export', now: '2026-09-14T04:45:00.000Z' })
  session.controls = [
    { id: 'a', role: 'fit', pixel: { x: 0, y: 0 }, ground: { lng: 100, lat: 30 } },
    { id: 'b', role: 'fit', pixel: { x: 100, y: 0 }, ground: { lng: 100.1, lat: 30 } },
    { id: 'c', role: 'fit', pixel: { x: 0, y: 100 }, ground: { lng: 100, lat: 30.1 } },
  ]
  session.boundaryPixels = [{ x: 10, y: 10 }, { x: 90, y: 10 }, { x: 90, y: 90 }, { x: 10, y: 90 }]
  const fit = fitSession(session)
  const output = buildSessionGeoJson(session, fit, { uncertainCheck: uncertainCheckFixture() })
  const props = output.wgs84.properties as Record<string, unknown>
  assert.equal(props.checkUncertaintyAvailable, true)
  assert.equal(props.checkUncertaintyInterpretation, 'inconsistent')
  assert.equal(props.checkUncertaintyNormalizedRms, 2.4)
  assert.equal(props.checkUncertaintyMaxStandardizedResidual, 4.2)
  assert.equal(props.checkUncertaintyProfiledCount, 2)
  assert.equal(props.checkUncertaintyFallbackCount, 1)
  assert.equal(props.checkUncertaintySigmaMinM, 2.3)
  assert.equal(props.checkUncertaintySigmaMaxM, 16.2)
  assert.equal(props.checkUncertaintyInconsistentCount, 1)
  assert.equal(props.reviewStatus, 'draft-unreviewed')
})

test('draft GeoJSON preserves evidence-normalized Monte Carlo winner separately from raw winner', () => {
  const session = createSession({ id: 'mc-check-evidence-export', now: '2026-09-14T05:10:00.000Z' })
  session.controls = [
    { id: 'a', role: 'fit', pixel: { x: 0, y: 0 }, ground: { lng: 100, lat: 30 } },
    { id: 'b', role: 'fit', pixel: { x: 100, y: 0 }, ground: { lng: 100.1, lat: 30 } },
    { id: 'c', role: 'fit', pixel: { x: 0, y: 100 }, ground: { lng: 100, lat: 30.1 } },
  ]
  session.boundaryPixels = [{ x: 10, y: 10 }, { x: 90, y: 10 }, { x: 90, y: 90 }, { x: 10, y: 90 }]
  const fit = fitSession(session)
  const mc = monteCarloFixture()
  if (!mc.available) throw new Error('fixture unavailable')
  mc.evidenceWinnerModelId = 'projective'
  mc.evidenceWinnerRate = 0.58
  mc.evidenceRunnerUpModelId = 'piecewise-vertical-2'
  mc.evidenceRunnerUpRate = 0.31
  const output = buildSessionGeoJson(session, fit, { monteCarlo: mc })
  const props = output.wgs84.properties as Record<string, unknown>
  assert.equal(props.monteCarloWinnerModelId, 'piecewise-vertical-2')
  assert.equal(props.monteCarloEvidenceWinnerModelId, 'projective')
  assert.equal(props.monteCarloEvidenceWinnerRate, 0.58)
  assert.equal(props.monteCarloEvidenceRunnerUpModelId, 'piecewise-vertical-2')
  assert.equal(props.monteCarloEvidenceRunnerUpRate, 0.31)
})

test('draft GeoJSON preserves uncertainty evidence audit coverage and weakest controls', () => {
  const session = createSession({ id: 'audit-export', now: '2026-09-14T05:20:00.000Z' })
  session.controls = [
    { id: 'fit-fallback', role: 'fit', pixel: { x: 0, y: 0 }, ground: { lng: 100, lat: 30 } },
    { id: 'fit-backed', role: 'fit', pixel: { x: 100, y: 0 }, ground: { lng: 100.1, lat: 30 }, uncertainty: { groundEvidence: 'official-survey-gis', evidenceRef: 'doc://gis', calibrationBasis: 'metadata' } },
    { id: 'fit-reviewed', role: 'fit', pixel: { x: 0, y: 100 }, ground: { lng: 100, lat: 30.1 }, uncertainty: { groundEvidence: 'field-gps', evidenceRef: 'doc://gps', calibrationBasis: 'measured', reviewStatus: 'reviewed' } },
    { id: 'check-heuristic', role: 'check', pixel: { x: 80, y: 80 }, ground: { lng: 100.08, lat: 30.08 }, uncertainty: { groundSigmaM: 12 } },
  ]
  session.boundaryPixels = [{ x: 10, y: 10 }, { x: 90, y: 10 }, { x: 90, y: 90 }, { x: 10, y: 90 }]
  const fit = fitSession(session)
  const props = buildSessionGeoJson(session, fit).wgs84.properties as Record<string, unknown>
  assert.equal(props.uncertaintyAuditEvidenceBackedCount, 2)
  assert.equal(props.uncertaintyAuditReviewedCount, 1)
  assert.equal(props.uncertaintyAuditFallbackCount, 1)
  assert.equal(props.uncertaintyAuditHeuristicCount, 1)
  assert.equal(props.uncertaintyAuditFitEvidenceBackedCount, 2)
  assert.equal(props.uncertaintyAuditCheckEvidenceBackedCount, 0)
  assert.deepEqual(props.uncertaintyAuditWeakestControlIds, ['fit-fallback'])
  assert.equal(props.reviewStatus, 'draft-unreviewed')
})

test('draft GeoJSON preserves evidence research backlog summary without changing review status', () => {
  const session = createSession({ id: 'backlog-export', now: '2026-09-14T06:10:00.000Z' })
  session.controls = [
    { id: 'fit-fallback', role: 'fit', pixel: { x: 0, y: 0 }, ground: { lng: 100, lat: 30 } },
    { id: 'fit-heuristic', role: 'fit', pixel: { x: 100, y: 0 }, ground: { lng: 100.1, lat: 30 }, uncertainty: { groundSigmaM: 10 } },
    { id: 'fit-reviewed', role: 'fit', pixel: { x: 0, y: 100 }, ground: { lng: 100, lat: 30.1 }, uncertainty: { evidenceRef: 'doc://gps', calibrationBasis: 'measured', reviewStatus: 'reviewed' } },
  ]
  session.boundaryPixels = [{ x: 10, y: 10 }, { x: 90, y: 10 }, { x: 90, y: 90 }, { x: 10, y: 90 }]
  const fit = fitSession(session)
  const props = buildSessionGeoJson(session, fit).wgs84.properties as Record<string, unknown>
  assert.equal(props.evidenceBacklogTaskCount, 2)
  assert.equal(props.evidenceBacklogHighCount, 0)
  assert.equal(props.evidenceBacklogMediumCount, 2)
  assert.equal(props.evidenceBacklogLowCount, 0)
  assert.equal(props.evidenceBacklogFitTaskCount, 2)
  assert.equal(props.evidenceBacklogCheckTaskCount, 0)
  assert.deepEqual(props.evidenceBacklogTopControlIds, ['fit-fallback', 'fit-heuristic'])
  assert.equal(props.reviewStatus, 'draft-unreviewed')
})
