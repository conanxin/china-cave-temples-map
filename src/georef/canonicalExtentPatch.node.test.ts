import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCanonicalExtentPatch, approvalTokenForPatch, approveCanonicalExtentPatch } from './canonicalExtentPatch.ts'
import type { CaveTempleSite } from '../data/types.ts'
import type { GeoreferenceAdvancedQaResult, GeoreferenceAreaComparison, GeoreferenceSession } from './types.ts'
import type { FitPointInfluenceResult } from './controlInfluence.ts'
import type { RobustGeoreferenceResult } from './robustRansac.ts'
import type { IrlsGeoreferenceResult } from './robustIrls.ts'

const site: CaveTempleSite = {
  id: 5, code: '05', name: '测试石窟', aliases: [], regionGroup: 'north', province: '测试省', prefecture: '测试市', county: '测试县',
  heritageBatch: 1, religion: 'buddhist', siteType: 'cave-temple', mainPeriods: [], siteExtent: 'group', coordinateConfidence: 'unresolved', amapQuery: '测试',
  spatialExtents: [{
    id: '05-property', label: '世界遗产区', kind: 'world-heritage-property', geometryStatus: 'text-only', description: '官方图待配准', source: 'UNESCO', areaHa: 100,
  }],
}

const session: GeoreferenceSession = {
  schemaVersion: 1, id: 'session-1', siteId: 5, targetId: 'map-1', boundaryExtentId: '05-property', method: 'affine',
  controls: [], boundaryPixels: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
  qaThresholds: { passRmseM: 25, passMaxM: 50, reviewRmseM: 75, reviewMaxM: 150 }, createdAt: '2026-09-13T00:00:00Z', updatedAt: '2026-09-13T00:00:00Z',
}

const qa: GeoreferenceAdvancedQaResult = {
  fit: { model: { kind: 'affine', params: [0.01, 0, 100, 0, 0.01, 30] }, residuals: [], rmseM: 1, maxResidualM: 2, verdict: 'pass', thresholds: session.qaThresholds, fitControlCount: 6, checkControlCount: 2 },
  holdout: { count: 2, residuals: [], rmseM: 3, maxResidualM: 4, verdict: 'pass' },
  leaveOneOut: { available: true, residuals: [], rmseM: 4, maxResidualM: 5, verdict: 'pass' },
  spatialDistribution: { available: true, score: 80, xSpanRatio: .9, ySpanRatio: .9, hullAreaRatio: .6, verdict: 'good' },
}
const area: GeoreferenceAreaComparison = { computedAreaHa: 99, officialAreaHa: 100, differenceHa: 1, differencePercent: 1, verdict: 'pass' }

test('builds a draft canonical patch only from a strong review-ready session', () => {
  const patch = buildCanonicalExtentPatch({ site, session, advancedQa: qa, readiness: { verdict: 'strong', reasons: [] }, areaComparison: area, now: '2026-09-13T01:00:00Z' })
  assert.equal(patch.reviewStatus, 'draft-unreviewed')
  assert.equal(patch.siteId, 5)
  assert.equal(patch.siteCode, '05')
  assert.equal(patch.extentId, '05-property')
  assert.equal(patch.sourceSessionId, 'session-1')
  assert.equal(patch.geometryWgs84.type, 'Polygon')
  assert.equal(patch.geometryGcj02.type, 'Polygon')
  assert.equal(patch.qa.readiness, 'strong')
  assert.equal(patch.qa.holdoutVerdict, 'pass')
  assert.equal(patch.qa.fitControlCount, 6)
  assert.equal(patch.qa.checkControlCount, 2)
  assert.equal(patch.qa.amapLinkedControlCount, 0)
})

test('rejects patch generation when readiness is not strong or extent is already verified', () => {
  assert.throws(() => buildCanonicalExtentPatch({ site, session, advancedQa: qa, readiness: { verdict: 'review', reasons: ['check'] }, areaComparison: area }), /strong/)
  const verifiedSite = structuredClone(site)
  verifiedSite.spatialExtents![0].geometryStatus = 'verified'
  verifiedSite.spatialExtents![0].geometry = { type: 'Polygon', coordinates: [[[1,1],[2,1],[2,2],[1,1]]] }
  assert.throws(() => buildCanonicalExtentPatch({ site: verifiedSite, session, advancedQa: qa, readiness: { verdict: 'strong', reasons: [] }, areaComparison: area }), /already verified/)
})

test('requires exact human approval token before changing review status', () => {
  const draft = buildCanonicalExtentPatch({ site, session, advancedQa: qa, readiness: { verdict: 'strong', reasons: [] }, areaComparison: area })
  assert.equal(approvalTokenForPatch(draft), 'APPROVE 05 05-property')
  assert.throws(() => approveCanonicalExtentPatch(draft, 'approve 05 05-property'), /confirmation token/)
  const approved = approveCanonicalExtentPatch(draft, 'APPROVE 05 05-property', '2026-09-13T02:00:00Z')
  assert.equal(approved.reviewStatus, 'human-approved')
  assert.equal(approved.confirmation?.confirmedAt, '2026-09-13T02:00:00Z')
})


test('canonical patch preserves fit-point influence warnings without auto-rejecting a human review', () => {
  const influence: FitPointInfluenceResult = {
    available: true,
    method: 'affine',
    baselineCheckCount: 2,
    baselineHoldoutRmseM: 20,
    baselineHoldoutMaxResidualM: 30,
    suspectCount: 1,
    supportiveCount: 0,
    topSuspectControlId: 'cp-7',
    points: [{
      controlId: 'cp-7',
      status: 'suspect',
      baselineHoldoutRmseM: 20,
      omittedHoldoutRmseM: 8,
      holdoutImprovementM: 12,
      holdoutImprovementPercent: 60,
      boundaryMeanShiftM: 18,
      boundaryMaxShiftM: 37,
      omittedLeaveOneOut: { available: false, reason: 'test' },
      reasons: ['review'],
    }],
  }
  const patch = buildCanonicalExtentPatch({
    site,
    session,
    advancedQa: qa,
    readiness: { verdict: 'strong', reasons: [] },
    areaComparison: area,
    controlInfluence: influence,
  })
  assert.equal(patch.reviewStatus, 'draft-unreviewed')
  assert.equal(patch.qa.controlInfluenceSuspectCount, 1)
  assert.equal(patch.qa.controlInfluenceTopSuspectId, 'cp-7')
  assert.equal(patch.qa.controlInfluenceMaxHoldoutImprovementM, 12)
  assert.equal(patch.qa.controlInfluenceMaxBoundaryShiftM, 37)
})


test('canonical patch preserves robust/RANSAC warning evidence without changing human approval semantics', () => {
  const robust: RobustGeoreferenceResult = {
    available: true,
    method: 'affine',
    thresholdM: 50,
    trialCount: 20,
    validTrialCount: 20,
    bestInlierCount: 5,
    robustModel: qa.fit.model,
    robustInlierControlIds: ['fit-1','fit-2','fit-3','fit-4','fit-5'],
    outlierControlIds: ['fit-bad'],
    outlierCount: 1,
    points: [
      { controlId: 'fit-bad', status: 'outlier', outlierVoteRate: 1, robustResidualM: 120 },
      { controlId: 'fit-1', status: 'inlier', outlierVoteRate: 0, robustResidualM: 0 },
    ],
    baselineHoldout: { model: qa.fit.model, residuals: [], rmseM: 42, maxResidualM: 55, verdict: 'review', thresholds: session.qaThresholds },
    robustHoldout: { model: qa.fit.model, residuals: [], rmseM: 8, maxResidualM: 11, verdict: 'pass', thresholds: session.qaThresholds },
    boundaryDivergence: { meanM: 12, maxM: 25 },
    recommendation: 'review-outliers',
    reasons: ['review fit-bad'],
  }
  const patch = buildCanonicalExtentPatch({ site, session, advancedQa: qa, readiness: { verdict: 'strong', reasons: [] }, areaComparison: area, robust })
  assert.equal(patch.reviewStatus, 'draft-unreviewed')
  assert.equal(patch.qa.robustOutlierCount, 1)
  assert.equal(patch.qa.robustTopOutlierId, 'fit-bad')
  assert.equal(patch.qa.robustHoldoutRmseM, 8)
  assert.equal(patch.qa.robustBaselineHoldoutRmseM, 42)
  assert.equal(patch.qa.robustBoundaryMaxDivergenceM, 25)
  assert.equal(patch.qa.robustRecommendation, 'review-outliers')
  const approved = approveCanonicalExtentPatch(patch, approvalTokenForPatch(patch))
  assert.equal(approved.reviewStatus, 'human-approved')
  assert.equal(approved.qa.robustOutlierCount, 1)
})


test('canonical patch preserves IRLS continuous-weight diagnostics after human approval', () => {
  const irls: IrlsGeoreferenceResult = {
    available: true,
    method: 'affine',
    fitControlCount: 7,
    checkControlCount: 2,
    baselineHoldout: { model: qa.fit.model, residuals: [], rmseM: 40, maxResidualM: 55, verdict: 'review', thresholds: session.qaThresholds },
    huber: {
      estimator: 'huber', tuningConstant: 1.345, iterations: 6, converged: true, scaleM: 8, model: qa.fit.model,
      points: [{ controlId: 'fit-bad', weight: 0.28, status: 'severe', residualM: 80 }],
      holdout: { model: qa.fit.model, residuals: [], rmseM: 14, maxResidualM: 20, verdict: 'pass', thresholds: session.qaThresholds },
      boundaryDivergence: { meanM: 9, maxM: 18 }, downweightedCount: 1, severeCount: 1,
    },
    tukey: {
      estimator: 'tukey', tuningConstant: 4.685, iterations: 7, converged: true, scaleM: 7, model: qa.fit.model,
      points: [{ controlId: 'fit-bad', weight: 0.04, status: 'severe', residualM: 82 }],
      holdout: { model: qa.fit.model, residuals: [], rmseM: 10, maxResidualM: 15, verdict: 'pass', thresholds: session.qaThresholds },
      boundaryDivergence: { meanM: 12, maxM: 24 }, downweightedCount: 1, severeCount: 1,
    },
    recommendation: 'review-downweighted',
    reasons: ['review fit-bad'],
  }
  const patch = buildCanonicalExtentPatch({ site, session, advancedQa: qa, readiness: { verdict: 'strong', reasons: [] }, areaComparison: area, irls })
  assert.equal(patch.reviewStatus, 'draft-unreviewed')
  assert.equal(patch.qa.irlsRecommendation, 'review-downweighted')
  assert.equal(patch.qa.irlsTopDownweightedId, 'fit-bad')
  assert.equal(patch.qa.huberHoldoutRmseM, 14)
  assert.equal(patch.qa.tukeyHoldoutRmseM, 10)
  assert.equal(patch.qa.huberMinWeight, 0.28)
  assert.equal(patch.qa.tukeyMinWeight, 0.04)
  assert.equal(patch.qa.irlsBoundaryMaxDivergenceM, 24)
  const approved = approveCanonicalExtentPatch(patch, approvalTokenForPatch(patch))
  assert.equal(approved.reviewStatus, 'human-approved')
  assert.equal(approved.qa.irlsTopDownweightedId, 'fit-bad')
})

import type { LocalDistortionModelComparison, LocalDistortionResult } from './localDistortion.ts'

test('canonical patch preserves local-distortion and piecewise-registration warnings after human approval', () => {
  const localDistortion: LocalDistortionResult = {
    available: true,
    checkCount: 6,
    pattern: 'structured-gradient',
    meanResidualM: 44,
    maxResidualM: 71,
    systematicMagnitudeM: 6,
    localRmsM: 43,
    gradientExplainedFraction: 0.82,
    postFieldRmsM: 16,
    fieldVariationM: 86,
    gradient: { eastDxM: 42, eastDyM: 8, northDxM: -4, northDyM: 31, divergenceM: 73, rotationM: -12, shearM: 18 },
    gridCells: [],
    hotspotContrast: 2.1,
    hotspotRegion: 'SE',
  }
  const localDistortionComparison: LocalDistortionModelComparison = {
    recommendation: 'consider-piecewise',
    bestModelId: 'huber',
    bestMeanResidualM: 31,
    nonStableModelCount: 5,
    persistentHotspotRegion: 'SE',
    reasons: ['persistent SE distortion'],
  }
  const patch = buildCanonicalExtentPatch({
    site,
    session,
    advancedQa: qa,
    readiness: { verdict: 'strong', reasons: [] },
    areaComparison: area,
    localDistortion,
    localDistortionComparison,
  })
  assert.equal(patch.reviewStatus, 'draft-unreviewed')
  assert.equal(patch.qa.localDistortionPattern, 'structured-gradient')
  assert.equal(patch.qa.localDistortionFieldVariationM, 86)
  assert.equal(patch.qa.localDistortionHotspotRegion, 'SE')
  assert.equal(patch.qa.localDistortionRecommendation, 'consider-piecewise')
  assert.equal(patch.qa.localDistortionPersistentHotspotRegion, 'SE')
  assert.equal(patch.qa.localDistortionPiecewiseSuggested, true)
  const approved = approveCanonicalExtentPatch(patch, approvalTokenForPatch(patch))
  assert.equal(approved.reviewStatus, 'human-approved')
  assert.equal(approved.qa.localDistortionPiecewiseSuggested, true)
})

import type { PiecewiseSimulationResult } from './piecewiseRegistration.ts'

test('canonical patch preserves piecewise simulation warnings after human approval', () => {
  const piecewise: PiecewiseSimulationResult = {
    available: true,
    baselineHoldoutRmseM: 62,
    bestLayout: 'vertical-2',
    recommendation: 'consider-piecewise',
    reasons: ['segmented candidate improves independent checks'],
    candidates: [
      { layout: 'vertical-2', available: true, regions: [], baselineHoldoutRmseM: 62, holdoutRmseM: 14, holdoutMaxResidualM: 21, holdoutVerdict: 'pass', improvementPercent: 77, seamMeanM: 8, seamMaxM: 17, seamSampleCount: 5, foldOverRisk: false, unvalidatedRegionCount: 0, recommendation: 'promising', reasons: ['good'] },
    ],
  }
  const patch = buildCanonicalExtentPatch({ site, session, advancedQa: qa, readiness: { verdict: 'strong', reasons: [] }, areaComparison: area, piecewise })
  assert.equal(patch.reviewStatus, 'draft-unreviewed')
  assert.equal(patch.qa.piecewiseRecommendation, 'consider-piecewise')
  assert.equal(patch.qa.piecewiseBestLayout, 'vertical-2')
  assert.equal(patch.qa.piecewiseBestHoldoutRmseM, 14)
  assert.equal(patch.qa.piecewiseBestSeamMaxM, 17)
  assert.equal(patch.qa.piecewiseBestFoldOverRisk, false)
  const approved = approveCanonicalExtentPatch(patch, approvalTokenForPatch(patch))
  assert.equal(approved.qa.piecewiseBestLayout, 'vertical-2')
})

import type { SpatialCrossValidationResult } from './spatialCrossValidation.ts'

function canonicalSpatialCvFixture(): SpatialCrossValidationResult {
  return {
    available: true,
    gridColumns: 3,
    gridRows: 2,
    bestGlobalModelId: 'affine',
    bestPiecewiseModelId: 'piecewise-vertical-2',
    rawImprovementPercent: 44,
    adjustedImprovementPercent: 39,
    recommendation: 'piecewise-supported',
    reasons: ['blocked CV supports piecewise'],
    models: [
      {
        id: 'affine', label: 'Global Affine', parameterCount: 6, totalFitPointCount: 18, evaluatedPointCount: 18, coverageRatio: 1,
        folds: [{ id: 'r0c1', row: 0, column: 1, available: true, heldOutControlIds: ['a'], trainingControlCount: 17, rmseM: 41, maxResidualM: 41 }],
        complexitySurchargePercent: 0, available: true, cvRmseM: 41, cvMaxResidualM: 71, adjustedCvRmseM: 41,
        foldRmseMeanM: 41, foldRmseStdM: 5, foldStabilityRatio: 0.12, independentCheckCount: 4, independentCheckRmseM: 36,
        independentCheckMaxResidualM: 50, minTrainingSupportRatio: 5.6, worstFoldId: 'r0c1',
      },
      {
        id: 'piecewise-vertical-2', label: 'Piecewise 2×1', parameterCount: 12, totalFitPointCount: 18, evaluatedPointCount: 18, coverageRatio: 1,
        folds: [{ id: 'r1c2', row: 1, column: 2, available: true, heldOutControlIds: ['b'], trainingControlCount: 17, rmseM: 20, maxResidualM: 20 }],
        complexitySurchargePercent: 5, available: true, cvRmseM: 21, cvMaxResidualM: 34, adjustedCvRmseM: 22.05,
        foldRmseMeanM: 21, foldRmseStdM: 2, foldStabilityRatio: 0.1, independentCheckCount: 4, independentCheckRmseM: 17,
        independentCheckMaxResidualM: 27, minTrainingSupportRatio: 1.67, worstFoldId: 'r1c2',
      },
    ],
  }
}

test('canonical patch preserves spatial CV and complexity evidence after human approval', () => {
  const spatialCv = canonicalSpatialCvFixture()
  const patch = buildCanonicalExtentPatch({ site, session, advancedQa: qa, readiness: { verdict: 'strong', reasons: [] }, areaComparison: area, spatialCv })
  assert.equal(patch.reviewStatus, 'draft-unreviewed')
  assert.equal(patch.qa.spatialCvRecommendation, 'piecewise-supported')
  assert.equal(patch.qa.spatialCvBestGlobalModelId, 'affine')
  assert.equal(patch.qa.spatialCvBestPiecewiseModelId, 'piecewise-vertical-2')
  assert.equal(patch.qa.spatialCvAdjustedImprovementPercent, 39)
  assert.equal(patch.qa.spatialCvBestPiecewiseWorstFoldId, 'r1c2')
  const approved = approveCanonicalExtentPatch(patch, approvalTokenForPatch(patch))
  assert.equal(approved.qa.spatialCvRecommendation, 'piecewise-supported')
  assert.equal(approved.qa.spatialCvBestPiecewiseWorstFoldId, 'r1c2')
})

import type { MonteCarloUncertaintyResult } from './monteCarloUncertainty.ts'

function canonicalMonteCarloFixture(): MonteCarloUncertaintyResult {
  return {
    available: true,
    trials: 200,
    successfulTrials: 197,
    seed: 27027,
    pixelSigmaPx: 1.5,
    groundSigmaM: 10,
    uncertaintyMode: 'evidence-profiled',
    controlProfiles: [
      { controlId: 'fit-1', pixelEvidence: 'clear-feature', groundEvidence: 'field-gps', pixelSigmaPx: 1.2, groundSigmaM: 5, calibrationSource: 'explicit-evidence', rationale: [] },
      { controlId: 'fit-2', pixelEvidence: 'unknown', groundEvidence: 'unknown', pixelSigmaPx: 1.5, groundSigmaM: 10, calibrationSource: 'fallback', rationale: [] },
    ],
    uncertaintySummary: { fitControlCount: 2, profiledControlCount: 1, fallbackControlCount: 1, pixelSigmaRangePx: [1.2, 1.5], groundSigmaRangeM: [5, 10], meanPixelSigmaPx: 1.35, meanGroundSigmaM: 7.5 },
    winnerModelId: 'affine',
    winnerRate: 0.74,
    runnerUpModelId: 'projective',
    runnerUpRate: 0.18,
    recommendation: 'global-stable',
    reasons: ['stable global model'],
    models: [{ id: 'affine', label: 'Global Affine', parameterCount: 6, complexitySurchargePercent: 0, validTrials: 200, wins: 148, winRate: 0.74, meanHoldoutRmseM: 18, meanAdjustedScoreM: 18 }],
    boundary: {
      vertices: [
        { vertexIndex: 0, baseline: { lng: 100, lat: 30 }, p50M: 5, p95M: 14, maxM: 25 },
        { vertexIndex: 1, baseline: { lng: 101, lat: 30 }, p50M: 7, p95M: 22, maxM: 34 },
        { vertexIndex: 2, baseline: { lng: 101, lat: 31 }, p50M: 6, p95M: 17, maxM: 29 },
        { vertexIndex: 3, baseline: { lng: 100, lat: 31 }, p50M: 4, p95M: 12, maxM: 20 },
      ],
      segments: [
        { startVertexIndex: 0, endVertexIndex: 1, p95M: 18, maxM: 34 },
        { startVertexIndex: 1, endVertexIndex: 2, p95M: 19.5, maxM: 34 },
        { startVertexIndex: 2, endVertexIndex: 3, p95M: 14.5, maxM: 29 },
        { startVertexIndex: 3, endVertexIndex: 0, p95M: 13, maxM: 25 },
      ],
      meanP95M: 16.25,
      maxP95M: 22,
      maxObservedM: 34,
      mostUnstableSegment: { startVertexIndex: 1, endVertexIndex: 2, p95M: 19.5, maxM: 34 },
    },
  }
}

test('canonical patch preserves Monte Carlo uncertainty evidence after human approval', () => {
  const monteCarlo = canonicalMonteCarloFixture()
  const patch = buildCanonicalExtentPatch({ site, session, advancedQa: qa, readiness: { verdict: 'strong', reasons: [] }, areaComparison: area, monteCarlo })
  assert.equal(patch.reviewStatus, 'draft-unreviewed')
  assert.equal(patch.qa.monteCarloTrials, 200)
  assert.equal(patch.qa.monteCarloWinnerModelId, 'affine')
  assert.equal(patch.qa.monteCarloWinnerRate, 0.74)
  assert.equal(patch.qa.monteCarloBoundaryMaxP95M, 22)
  assert.equal(patch.qa.monteCarloUncertaintyMode, 'evidence-profiled')
  assert.equal(patch.qa.monteCarloProfiledControlCount, 1)
  assert.equal(patch.qa.monteCarloFallbackControlCount, 1)
  assert.equal(patch.qa.monteCarloGroundSigmaMinM, 5)
  assert.equal(patch.qa.monteCarloGroundSigmaMaxM, 10)
  assert.equal(patch.qa.monteCarloMostUnstableSegment, '1-2')
  const approved = approveCanonicalExtentPatch(patch, approvalTokenForPatch(patch))
  assert.equal(approved.reviewStatus, 'human-approved')
  assert.equal(approved.qa.monteCarloRecommendation, 'global-stable')
  assert.equal(approved.qa.monteCarloBoundaryMaxObservedM, 34)
})

import type { SystematicStressResult } from './systematicStress.ts'

function canonicalSystematicStressFixture(): SystematicStressResult {
  return {
    available: true,
    baselineWinnerModelId: 'affine',
    baselineActiveHoldoutRmseM: 11,
    dominantScenarioId: 'pixel-wave',
    maxHoldoutIncreaseM: 28,
    maxBoundaryShiftM: 66,
    modelFlipCount: 2,
    recommendation: 'boundary-sensitive',
    reasons: ['wave distortion shifts boundary'],
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
        id: 'pixel-wave', label: '图像局部波浪形变', maxHoldoutRmseM: 39, maxHoldoutIncreaseM: 28, maxBoundaryShiftM: 66, modelFlipCount: 2,
        variants: [{ id: 'wave-y-positive', label: 'Y波浪 +2px', modelWinnerId: 'projective', modelWinnerChanged: true, activeHoldoutRmseM: 39, holdoutIncreaseM: 28 }],
        worstVariant: { id: 'wave-y-positive', label: 'Y波浪 +2px', modelWinnerId: 'projective', modelWinnerChanged: true, activeHoldoutRmseM: 39, holdoutIncreaseM: 28 },
      },
    ],
  }
}

test('canonical patch preserves systematic stress evidence after human approval', () => {
  const systematicStress = canonicalSystematicStressFixture()
  const patch = buildCanonicalExtentPatch({ site, session, advancedQa: qa, readiness: { verdict: 'strong', reasons: [] }, areaComparison: area, systematicStress })
  assert.equal(patch.reviewStatus, 'draft-unreviewed')
  assert.equal(patch.qa.systematicStressRecommendation, 'boundary-sensitive')
  assert.equal(patch.qa.systematicStressDominantScenarioId, 'pixel-wave')
  assert.equal(patch.qa.systematicStressMaxBoundaryShiftM, 66)
  assert.equal(patch.qa.systematicStressModelFlipCount, 2)
  assert.equal(patch.qa.systematicStressPixelWaveAmplitudePx, 2)
  const approved = approveCanonicalExtentPatch(patch, approvalTokenForPatch(patch))
  assert.equal(approved.reviewStatus, 'human-approved')
  assert.equal(approved.qa.systematicStressBaselineWinnerModelId, 'affine')
  assert.equal(approved.qa.systematicStressRegionalGroundBiasM, 15)
  assert.equal(approved.qa.systematicStressSingleControlGrossErrorM, 40)
})

import type { UncertainCheckHoldoutResult } from './checkUncertainty.ts'

function canonicalUncertainCheckFixture(): UncertainCheckHoldoutResult {
  return {
    available: true,
    checkCount: 2,
    rawRmseM: 18,
    rawMaxResidualM: 24,
    normalizedRms: 2.2,
    maxStandardizedResidual: 3.7,
    compatibleCount: 1,
    tensionCount: 0,
    inconsistentCount: 1,
    overallInterpretation: 'inconsistent',
    profiledCheckCount: 2,
    fallbackCheckCount: 0,
    effectiveSigmaRangeM: [3, 14],
    checks: [
      { controlId: 'check-a', residualM: 11, pixelSigmaPx: 0.7, groundSigmaM: 2, localMetersPerPixel: 1, effectiveSigmaM: 3, standardizedResidual: 3.7, interpretation: 'inconsistent', calibrationSource: 'explicit-evidence' },
      { controlId: 'check-b', residualM: 24, pixelSigmaPx: 1.2, groundSigmaM: 12, localMetersPerPixel: 1, effectiveSigmaM: 14, standardizedResidual: 1.7, interpretation: 'compatible', calibrationSource: 'explicit-evidence' },
    ],
  }
}

test('canonical patch preserves uncertain-check evidence after human approval without changing readiness', () => {
  const uncertainCheck = canonicalUncertainCheckFixture()
  const patch = buildCanonicalExtentPatch({ site, session, advancedQa: qa, readiness: { verdict: 'strong', reasons: [] }, areaComparison: area, uncertainCheck })
  assert.equal(patch.reviewStatus, 'draft-unreviewed')
  assert.equal(patch.qa.checkUncertaintyInterpretation, 'inconsistent')
  assert.equal(patch.qa.checkUncertaintyNormalizedRms, 2.2)
  assert.equal(patch.qa.checkUncertaintyMaxStandardizedResidual, 3.7)
  assert.equal(patch.qa.checkUncertaintyProfiledCount, 2)
  assert.equal(patch.qa.checkUncertaintyFallbackCount, 0)
  assert.equal(patch.qa.checkUncertaintySigmaMinM, 3)
  assert.equal(patch.qa.checkUncertaintySigmaMaxM, 14)
  const approved = approveCanonicalExtentPatch(patch, approvalTokenForPatch(patch))
  assert.equal(approved.reviewStatus, 'human-approved')
  assert.equal(approved.qa.checkUncertaintyInconsistentCount, 1)
})

test('canonical patch preserves raw and evidence-normalized Monte Carlo winners separately', () => {
  const monteCarlo = canonicalMonteCarloFixture()
  if (!monteCarlo.available) throw new Error('fixture unavailable')
  monteCarlo.evidenceWinnerModelId = 'projective'
  monteCarlo.evidenceWinnerRate = 0.61
  monteCarlo.evidenceRunnerUpModelId = 'affine'
  monteCarlo.evidenceRunnerUpRate = 0.29
  const patch = buildCanonicalExtentPatch({ site, session, advancedQa: qa, readiness: { verdict: 'strong', reasons: [] }, areaComparison: area, monteCarlo })
  assert.equal(patch.qa.monteCarloWinnerModelId, 'affine')
  assert.equal(patch.qa.monteCarloEvidenceWinnerModelId, 'projective')
  assert.equal(patch.qa.monteCarloEvidenceWinnerRate, 0.61)
  assert.equal(patch.qa.monteCarloEvidenceRunnerUpModelId, 'affine')
  assert.equal(patch.qa.monteCarloEvidenceRunnerUpRate, 0.29)
})

test('canonical patch preserves uncertainty evidence audit after human approval', () => {
  const auditedSession = structuredClone(session)
  auditedSession.controls = [
    { id: 'fit-reviewed', role: 'fit', pixel: { x: 0, y: 0 }, ground: { lng: 100, lat: 30 }, uncertainty: { groundEvidence: 'official-survey-gis', evidenceRef: 'doc://gis', calibrationBasis: 'metadata', reviewStatus: 'reviewed' } },
    { id: 'fit-heuristic', role: 'fit', pixel: { x: 1, y: 0 }, ground: { lng: 100.01, lat: 30 }, uncertainty: { groundSigmaM: 10 } },
    { id: 'check-heuristic', role: 'check', pixel: { x: 0, y: 1 }, ground: { lng: 100, lat: 30.01 }, uncertainty: { groundSigmaM: 10 } },
  ]
  const patch = buildCanonicalExtentPatch({ site, session: auditedSession, advancedQa: qa, readiness: { verdict: 'strong', reasons: [] }, areaComparison: area })
  assert.equal(patch.qa.uncertaintyAuditEvidenceBackedCount, 1)
  assert.equal(patch.qa.uncertaintyAuditReviewedCount, 1)
  assert.equal(patch.qa.uncertaintyAuditHeuristicCount, 2)
  assert.equal(patch.qa.uncertaintyAuditFallbackCount, 0)
  assert.equal(patch.qa.uncertaintyAuditWeakestControlIds?.length, 2)
  const approved = approveCanonicalExtentPatch(patch, approvalTokenForPatch(patch))
  assert.equal(approved.reviewStatus, 'human-approved')
  assert.equal(approved.qa.uncertaintyAuditEvidenceBackedCount, 1)
})

test('canonical patch preserves evidence research backlog summary after human approval', () => {
  const backlogSession = structuredClone(session)
  backlogSession.controls = [
    { id: 'fit-fallback', role: 'fit', pixel: { x: 0, y: 0 }, ground: { lng: 100, lat: 30 } },
    { id: 'fit-heuristic', role: 'fit', pixel: { x: 1, y: 0 }, ground: { lng: 100.01, lat: 30 }, uncertainty: { groundSigmaM: 10 } },
    { id: 'check-reviewed', role: 'check', pixel: { x: 0, y: 1 }, ground: { lng: 100, lat: 30.01 }, uncertainty: { evidenceRef: 'doc://check', calibrationBasis: 'metadata', reviewStatus: 'reviewed' } },
  ]
  const patch = buildCanonicalExtentPatch({ site, session: backlogSession, advancedQa: qa, readiness: { verdict: 'strong', reasons: [] }, areaComparison: area })
  assert.equal(patch.qa.evidenceBacklogTaskCount, 2)
  assert.equal(patch.qa.evidenceBacklogMediumCount, 2)
  assert.equal(patch.qa.evidenceBacklogFitTaskCount, 2)
  assert.equal(patch.qa.evidenceBacklogCheckTaskCount, 0)
  assert.deepEqual(patch.qa.evidenceBacklogTopControlIds, ['fit-fallback', 'fit-heuristic'])
  const approved = approveCanonicalExtentPatch(patch, approvalTokenForPatch(patch))
  assert.equal(approved.qa.evidenceBacklogTaskCount, 2)
})
