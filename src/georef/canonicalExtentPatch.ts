import type { CaveTempleSite, PolygonGeometry } from '../data/types.ts'
import type { GeoreferenceReviewReadiness } from './reviewReadiness.ts'
import type { GeoreferenceAdvancedQaResult, GeoreferenceAreaComparison, GeoreferenceQaVerdict, GeoreferenceSession } from './types.ts'
import { buildSessionGeoJson } from './workbench.ts'
import type { FitPointInfluenceResult } from './controlInfluence.ts'
import type { RobustGeoreferenceResult, RobustRecommendation } from './robustRansac.ts'
import type { IrlsGeoreferenceResult, IrlsRecommendation } from './robustIrls.ts'
import type { LocalDistortionModelComparison, LocalDistortionPattern, LocalDistortionRecommendation, LocalDistortionResult, LocalDistortionRegion } from './localDistortion.ts'
import type { PiecewiseLayout, PiecewiseSimulationResult } from './piecewiseRegistration.ts'
import type { SpatialCrossValidationResult, SpatialCvModelId, SpatialCvRecommendation } from './spatialCrossValidation.ts'
import type { MonteCarloRecommendation, MonteCarloUncertaintyResult } from './monteCarloUncertainty.ts'
import type { SystematicStressRecommendation, SystematicStressResult, SystematicStressScenarioId } from './systematicStress.ts'
import type { CheckResidualInterpretation, UncertainCheckHoldoutResult } from './checkUncertainty.ts'
import { summarizeUncertaintyEvidenceAudit } from './uncertaintyEvidenceAudit.ts'
import { buildEvidenceResearchBacklog } from './evidenceResearchBacklog.ts'

export type CanonicalExtentPatchReviewStatus = 'draft-unreviewed' | 'human-approved'

export interface CanonicalExtentPatchQa {
  readiness: 'strong'
  fitRmseM: number
  fitMaxResidualM: number
  fitControlCount: number
  checkControlCount: number
  amapLinkedControlCount: number
  holdoutVerdict?: GeoreferenceQaVerdict
  holdoutRmseM?: number
  checkUncertaintyInterpretation?: CheckResidualInterpretation
  checkUncertaintyNormalizedRms?: number
  checkUncertaintyMaxStandardizedResidual?: number
  checkUncertaintyProfiledCount?: number
  checkUncertaintyFallbackCount?: number
  checkUncertaintySigmaMinM?: number
  checkUncertaintySigmaMaxM?: number
  checkUncertaintyCompatibleCount?: number
  checkUncertaintyTensionCount?: number
  checkUncertaintyInconsistentCount?: number
  uncertaintyAuditEvidenceBackedCount?: number
  uncertaintyAuditReviewedCount?: number
  uncertaintyAuditFallbackCount?: number
  uncertaintyAuditHeuristicCount?: number
  uncertaintyAuditEvidenceBackedRatio?: number
  uncertaintyAuditReviewedRatio?: number
  uncertaintyAuditFitEvidenceBackedCount?: number
  uncertaintyAuditCheckEvidenceBackedCount?: number
  uncertaintyAuditWeakestControlIds?: string[]
  evidenceBacklogTaskCount?: number
  evidenceBacklogHighCount?: number
  evidenceBacklogMediumCount?: number
  evidenceBacklogLowCount?: number
  evidenceBacklogFitTaskCount?: number
  evidenceBacklogCheckTaskCount?: number
  evidenceBacklogTopControlIds?: string[]
  looVerdict?: GeoreferenceQaVerdict
  looRmseM?: number
  spatialDistributionScore?: number
  spatialDistributionVerdict?: 'good' | 'review' | 'poor'
  areaVerdict?: GeoreferenceQaVerdict
  areaDifferencePercent?: number
  controlInfluenceSuspectCount?: number
  controlInfluenceTopSuspectId?: string
  controlInfluenceMaxHoldoutImprovementM?: number
  controlInfluenceMaxBoundaryShiftM?: number
  robustOutlierCount?: number
  robustTopOutlierId?: string
  robustHoldoutRmseM?: number
  robustBaselineHoldoutRmseM?: number
  robustBoundaryMaxDivergenceM?: number
  robustRecommendation?: RobustRecommendation
  irlsRecommendation?: IrlsRecommendation
  irlsTopDownweightedId?: string
  huberHoldoutRmseM?: number
  tukeyHoldoutRmseM?: number
  huberMinWeight?: number
  tukeyMinWeight?: number
  huberSevereCount?: number
  tukeySevereCount?: number
  irlsBoundaryMaxDivergenceM?: number
  localDistortionPattern?: LocalDistortionPattern
  localDistortionGradientExplainedFraction?: number
  localDistortionFieldVariationM?: number
  localDistortionHotspotRegion?: LocalDistortionRegion
  localDistortionRecommendation?: LocalDistortionRecommendation
  localDistortionBestModelId?: string
  localDistortionPersistentHotspotRegion?: LocalDistortionRegion
  localDistortionPiecewiseSuggested?: boolean
  piecewiseRecommendation?: 'consider-piecewise' | 'review-piecewise' | 'global-preferred' | 'insufficient'
  piecewiseBestLayout?: PiecewiseLayout
  piecewiseBestHoldoutRmseM?: number
  piecewiseBestSeamMaxM?: number
  piecewiseBestFoldOverRisk?: boolean
  spatialCvRecommendation?: SpatialCvRecommendation
  spatialCvBestGlobalModelId?: 'affine' | 'projective'
  spatialCvBestPiecewiseModelId?: Extract<SpatialCvModelId, `piecewise-${string}`>
  spatialCvRawImprovementPercent?: number
  spatialCvAdjustedImprovementPercent?: number
  spatialCvBestGlobalRmseM?: number
  spatialCvBestPiecewiseRmseM?: number
  spatialCvBestPiecewiseAdjustedRmseM?: number
  spatialCvBestPiecewiseWorstFoldId?: string
  spatialCvBestPiecewiseComplexitySurchargePercent?: number
  spatialCvBestPiecewiseSupportRatio?: number
  monteCarloTrials?: number
  monteCarloSuccessfulTrials?: number
  monteCarloSeed?: number
  monteCarloPixelSigmaPx?: number
  monteCarloGroundSigmaM?: number
  monteCarloUncertaintyMode?: 'uniform' | 'evidence-profiled'
  monteCarloProfiledControlCount?: number
  monteCarloFallbackControlCount?: number
  monteCarloPixelSigmaMinPx?: number
  monteCarloPixelSigmaMaxPx?: number
  monteCarloGroundSigmaMinM?: number
  monteCarloGroundSigmaMaxM?: number
  monteCarloWinnerModelId?: SpatialCvModelId
  monteCarloWinnerRate?: number
  monteCarloRunnerUpModelId?: SpatialCvModelId
  monteCarloRunnerUpRate?: number
  monteCarloEvidenceWinnerModelId?: SpatialCvModelId
  monteCarloEvidenceWinnerRate?: number
  monteCarloEvidenceRunnerUpModelId?: SpatialCvModelId
  monteCarloEvidenceRunnerUpRate?: number
  monteCarloRecommendation?: MonteCarloRecommendation
  monteCarloBoundaryMeanP95M?: number
  monteCarloBoundaryMaxP95M?: number
  monteCarloBoundaryMaxObservedM?: number
  monteCarloMostUnstableSegment?: string
  systematicStressRecommendation?: SystematicStressRecommendation
  systematicStressDominantScenarioId?: SystematicStressScenarioId
  systematicStressBaselineWinnerModelId?: SpatialCvModelId
  systematicStressModelFlipCount?: number
  systematicStressMaxHoldoutIncreaseM?: number
  systematicStressMaxBoundaryShiftM?: number
  systematicStressRotationDeg?: number
  systematicStressAnisotropicScaleFraction?: number
  systematicStressCommonGroundShiftM?: number
  systematicStressRegionalGroundBiasM?: number
  systematicStressSingleControlGrossErrorM?: number
  systematicStressPixelWaveAmplitudePx?: number
}

export interface CanonicalExtentPatch {
  schemaVersion: 1
  patchId: string
  siteId: number
  siteCode: string
  extentId: string
  sourceSessionId: string
  sourceMapTargetId?: string
  createdAt: string
  reviewStatus: CanonicalExtentPatchReviewStatus
  geometryWgs84: PolygonGeometry
  geometryGcj02: PolygonGeometry
  qa: CanonicalExtentPatchQa
  confirmation?: {
    token: string
    confirmedAt: string
  }
}

interface BuildPatchOptions {
  site: CaveTempleSite
  session: GeoreferenceSession
  advancedQa: GeoreferenceAdvancedQaResult
  readiness: GeoreferenceReviewReadiness
  areaComparison?: GeoreferenceAreaComparison
  controlInfluence?: FitPointInfluenceResult
  robust?: RobustGeoreferenceResult
  irls?: IrlsGeoreferenceResult
  localDistortion?: LocalDistortionResult
  localDistortionComparison?: LocalDistortionModelComparison
  piecewise?: PiecewiseSimulationResult
  spatialCv?: SpatialCrossValidationResult
  monteCarlo?: MonteCarloUncertaintyResult
  systematicStress?: SystematicStressResult
  uncertainCheck?: UncertainCheckHoldoutResult
  now?: string
}

export function buildCanonicalExtentPatch(options: BuildPatchOptions): CanonicalExtentPatch {
  const { site, session, advancedQa, readiness, areaComparison, controlInfluence, robust, irls, localDistortion, localDistortionComparison, piecewise, spatialCv, monteCarlo, systematicStress, uncertainCheck } = options
  if (readiness.verdict !== 'strong') throw new Error('canonical patch requires strong review readiness')
  if (session.siteId != null && session.siteId !== site.id) throw new Error('session site does not match canonical patch site')
  if (!session.boundaryExtentId) throw new Error('canonical patch requires a selected extent')
  const extent = site.spatialExtents?.find((item) => item.id === session.boundaryExtentId)
  if (!extent) throw new Error('canonical patch extent not found on site')
  if (extent.geometryStatus === 'verified') throw new Error('canonical patch target extent is already verified')
  if (session.boundaryPixels.length < 3) throw new Error('canonical patch requires a traced boundary')

  const geoJson = buildSessionGeoJson(session, advancedQa.fit, { advancedQa, areaComparison, controlInfluence, robust, irls, localDistortion, localDistortionComparison, piecewise, spatialCv, monteCarlo, systematicStress, uncertainCheck })
  const uncertaintyAudit = summarizeUncertaintyEvidenceAudit(session.controls)
  const evidenceBacklog = buildEvidenceResearchBacklog(session.controls, { influence: controlInfluence, robust, irls, uncertainCheck })
  const createdAt = options.now ?? new Date().toISOString()
  const patchId = `georef:${site.code}:${extent.id}:${session.id}`
  const qa: CanonicalExtentPatchQa = {
    readiness: 'strong',
    fitRmseM: advancedQa.fit.rmseM,
    fitMaxResidualM: advancedQa.fit.maxResidualM,
    fitControlCount: advancedQa.fit.fitControlCount,
    checkControlCount: advancedQa.fit.checkControlCount,
    amapLinkedControlCount: session.controls.filter((control) => control.groundSource === 'amap-click').length,
    uncertaintyAuditEvidenceBackedCount: uncertaintyAudit.evidenceBackedCount,
    uncertaintyAuditReviewedCount: uncertaintyAudit.reviewedCount,
    uncertaintyAuditFallbackCount: uncertaintyAudit.fallbackCount,
    uncertaintyAuditHeuristicCount: uncertaintyAudit.heuristicCount,
    uncertaintyAuditEvidenceBackedRatio: uncertaintyAudit.evidenceBackedRatio,
    uncertaintyAuditReviewedRatio: uncertaintyAudit.reviewedRatio,
    uncertaintyAuditFitEvidenceBackedCount: uncertaintyAudit.fitEvidenceBackedCount,
    uncertaintyAuditCheckEvidenceBackedCount: uncertaintyAudit.checkEvidenceBackedCount,
    uncertaintyAuditWeakestControlIds: uncertaintyAudit.weakestControlIds,
    evidenceBacklogTaskCount: evidenceBacklog.items.length,
    evidenceBacklogHighCount: evidenceBacklog.highCount,
    evidenceBacklogMediumCount: evidenceBacklog.mediumCount,
    evidenceBacklogLowCount: evidenceBacklog.lowCount,
    evidenceBacklogFitTaskCount: evidenceBacklog.fitTaskCount,
    evidenceBacklogCheckTaskCount: evidenceBacklog.checkTaskCount,
    evidenceBacklogTopControlIds: evidenceBacklog.topControlIds,
    ...(advancedQa.holdout ? { holdoutVerdict: advancedQa.holdout.verdict, holdoutRmseM: advancedQa.holdout.rmseM } : {}),
    ...(uncertainCheck?.available ? {
      checkUncertaintyInterpretation: uncertainCheck.overallInterpretation,
      checkUncertaintyNormalizedRms: uncertainCheck.normalizedRms,
      checkUncertaintyMaxStandardizedResidual: uncertainCheck.maxStandardizedResidual,
      checkUncertaintyProfiledCount: uncertainCheck.profiledCheckCount,
      checkUncertaintyFallbackCount: uncertainCheck.fallbackCheckCount,
      checkUncertaintySigmaMinM: uncertainCheck.effectiveSigmaRangeM[0],
      checkUncertaintySigmaMaxM: uncertainCheck.effectiveSigmaRangeM[1],
      checkUncertaintyCompatibleCount: uncertainCheck.compatibleCount,
      checkUncertaintyTensionCount: uncertainCheck.tensionCount,
      checkUncertaintyInconsistentCount: uncertainCheck.inconsistentCount,
    } : {}),
    ...(advancedQa.leaveOneOut.available ? { looVerdict: advancedQa.leaveOneOut.verdict, looRmseM: advancedQa.leaveOneOut.rmseM } : {}),
    ...(advancedQa.spatialDistribution.available ? { spatialDistributionScore: advancedQa.spatialDistribution.score, spatialDistributionVerdict: advancedQa.spatialDistribution.verdict } : {}),
    ...(areaComparison ? { areaVerdict: areaComparison.verdict, areaDifferencePercent: areaComparison.differencePercent } : {}),
    ...(controlInfluence?.available ? {
      controlInfluenceSuspectCount: controlInfluence.suspectCount,
      ...(controlInfluence.topSuspectControlId ? { controlInfluenceTopSuspectId: controlInfluence.topSuspectControlId } : {}),
      controlInfluenceMaxHoldoutImprovementM: Math.max(...controlInfluence.points.map((point) => point.holdoutImprovementM), 0),
      controlInfluenceMaxBoundaryShiftM: Math.max(...controlInfluence.points.map((point) => point.boundaryMaxShiftM), 0),
    } : {}),
    ...(robust?.available ? {
      robustOutlierCount: robust.outlierCount,
      ...([...robust.points].filter((point) => point.status === 'outlier').sort((a, b) => b.outlierVoteRate - a.outlierVoteRate)[0]?.controlId
        ? { robustTopOutlierId: [...robust.points].filter((point) => point.status === 'outlier').sort((a, b) => b.outlierVoteRate - a.outlierVoteRate)[0].controlId }
        : {}),
      robustHoldoutRmseM: robust.robustHoldout.rmseM,
      robustBaselineHoldoutRmseM: robust.baselineHoldout.rmseM,
      robustBoundaryMaxDivergenceM: robust.boundaryDivergence.maxM,
      robustRecommendation: robust.recommendation,
    } : {}),
    ...(irls?.available ? {
      irlsRecommendation: irls.recommendation,
      ...([...irls.tukey.points, ...irls.huber.points].sort((a, b) => a.weight - b.weight)[0]?.controlId
        ? { irlsTopDownweightedId: [...irls.tukey.points, ...irls.huber.points].sort((a, b) => a.weight - b.weight)[0].controlId }
        : {}),
      huberHoldoutRmseM: irls.huber.holdout.rmseM,
      tukeyHoldoutRmseM: irls.tukey.holdout.rmseM,
      huberMinWeight: Math.min(...irls.huber.points.map((point) => point.weight)),
      tukeyMinWeight: Math.min(...irls.tukey.points.map((point) => point.weight)),
      huberSevereCount: irls.huber.severeCount,
      tukeySevereCount: irls.tukey.severeCount,
      irlsBoundaryMaxDivergenceM: Math.max(irls.huber.boundaryDivergence.maxM, irls.tukey.boundaryDivergence.maxM),
    } : {}),
    ...(localDistortion?.available ? {
      localDistortionPattern: localDistortion.pattern,
      localDistortionGradientExplainedFraction: localDistortion.gradientExplainedFraction,
      localDistortionFieldVariationM: localDistortion.fieldVariationM,
      ...(localDistortion.hotspotRegion ? { localDistortionHotspotRegion: localDistortion.hotspotRegion } : {}),
    } : {}),
    ...(localDistortionComparison ? {
      localDistortionRecommendation: localDistortionComparison.recommendation,
      ...(localDistortionComparison.bestModelId ? { localDistortionBestModelId: localDistortionComparison.bestModelId } : {}),
      ...(localDistortionComparison.persistentHotspotRegion ? { localDistortionPersistentHotspotRegion: localDistortionComparison.persistentHotspotRegion } : {}),
      localDistortionPiecewiseSuggested: localDistortionComparison.recommendation === 'consider-piecewise',
    } : {}),
    ...(piecewise?.available ? (() => {
      const best = piecewise.bestLayout ? piecewise.candidates.find((candidate) => candidate.layout === piecewise.bestLayout && candidate.available) : undefined
      return {
        piecewiseRecommendation: piecewise.recommendation,
        ...(piecewise.bestLayout ? { piecewiseBestLayout: piecewise.bestLayout } : {}),
        ...(best && best.available ? { piecewiseBestHoldoutRmseM: best.holdoutRmseM, piecewiseBestSeamMaxM: best.seamMaxM, piecewiseBestFoldOverRisk: best.foldOverRisk } : {}),
      }
    })() : {}),
    ...(spatialCv?.available ? (() => {
      const bestGlobal = spatialCv.models.find((model) => model.id === spatialCv.bestGlobalModelId && model.available)
      const bestPiecewise = spatialCv.bestPiecewiseModelId ? spatialCv.models.find((model) => model.id === spatialCv.bestPiecewiseModelId && model.available) : undefined
      return {
        spatialCvRecommendation: spatialCv.recommendation,
        spatialCvBestGlobalModelId: spatialCv.bestGlobalModelId,
        ...(spatialCv.bestPiecewiseModelId ? { spatialCvBestPiecewiseModelId: spatialCv.bestPiecewiseModelId } : {}),
        spatialCvRawImprovementPercent: spatialCv.rawImprovementPercent,
        spatialCvAdjustedImprovementPercent: spatialCv.adjustedImprovementPercent,
        ...(bestGlobal && bestGlobal.available ? { spatialCvBestGlobalRmseM: bestGlobal.cvRmseM } : {}),
        ...(bestPiecewise && bestPiecewise.available ? {
          spatialCvBestPiecewiseRmseM: bestPiecewise.cvRmseM,
          spatialCvBestPiecewiseAdjustedRmseM: bestPiecewise.adjustedCvRmseM,
          spatialCvBestPiecewiseWorstFoldId: bestPiecewise.worstFoldId,
          spatialCvBestPiecewiseComplexitySurchargePercent: bestPiecewise.complexitySurchargePercent,
          spatialCvBestPiecewiseSupportRatio: bestPiecewise.minTrainingSupportRatio,
        } : {}),
      }
    })() : {}),
    ...(monteCarlo?.available ? {
      monteCarloTrials: monteCarlo.trials,
      monteCarloSuccessfulTrials: monteCarlo.successfulTrials,
      monteCarloSeed: monteCarlo.seed,
      monteCarloPixelSigmaPx: monteCarlo.pixelSigmaPx,
      monteCarloGroundSigmaM: monteCarlo.groundSigmaM,
      monteCarloUncertaintyMode: monteCarlo.uncertaintyMode,
      monteCarloProfiledControlCount: monteCarlo.uncertaintySummary.profiledControlCount,
      monteCarloFallbackControlCount: monteCarlo.uncertaintySummary.fallbackControlCount,
      monteCarloPixelSigmaMinPx: monteCarlo.uncertaintySummary.pixelSigmaRangePx[0],
      monteCarloPixelSigmaMaxPx: monteCarlo.uncertaintySummary.pixelSigmaRangePx[1],
      monteCarloGroundSigmaMinM: monteCarlo.uncertaintySummary.groundSigmaRangeM[0],
      monteCarloGroundSigmaMaxM: monteCarlo.uncertaintySummary.groundSigmaRangeM[1],
      monteCarloWinnerModelId: monteCarlo.winnerModelId,
      monteCarloWinnerRate: monteCarlo.winnerRate,
      ...(monteCarlo.runnerUpModelId ? { monteCarloRunnerUpModelId: monteCarlo.runnerUpModelId } : {}),
      ...(monteCarlo.runnerUpRate != null ? { monteCarloRunnerUpRate: monteCarlo.runnerUpRate } : {}),
      ...(monteCarlo.evidenceWinnerModelId ? { monteCarloEvidenceWinnerModelId: monteCarlo.evidenceWinnerModelId } : {}),
      ...(monteCarlo.evidenceWinnerRate != null ? { monteCarloEvidenceWinnerRate: monteCarlo.evidenceWinnerRate } : {}),
      ...(monteCarlo.evidenceRunnerUpModelId ? { monteCarloEvidenceRunnerUpModelId: monteCarlo.evidenceRunnerUpModelId } : {}),
      ...(monteCarlo.evidenceRunnerUpRate != null ? { monteCarloEvidenceRunnerUpRate: monteCarlo.evidenceRunnerUpRate } : {}),
      monteCarloRecommendation: monteCarlo.recommendation,
      ...(monteCarlo.boundary ? {
        monteCarloBoundaryMeanP95M: monteCarlo.boundary.meanP95M,
        monteCarloBoundaryMaxP95M: monteCarlo.boundary.maxP95M,
        monteCarloBoundaryMaxObservedM: monteCarlo.boundary.maxObservedM,
        monteCarloMostUnstableSegment: `${monteCarlo.boundary.mostUnstableSegment.startVertexIndex}-${monteCarlo.boundary.mostUnstableSegment.endVertexIndex}`,
      } : {}),
    } : {}),
    ...(systematicStress?.available ? {
      systematicStressRecommendation: systematicStress.recommendation,
      systematicStressDominantScenarioId: systematicStress.dominantScenarioId,
      systematicStressBaselineWinnerModelId: systematicStress.baselineWinnerModelId,
      systematicStressModelFlipCount: systematicStress.modelFlipCount,
      systematicStressMaxHoldoutIncreaseM: systematicStress.maxHoldoutIncreaseM,
      systematicStressMaxBoundaryShiftM: systematicStress.maxBoundaryShiftM,
      systematicStressRotationDeg: systematicStress.options.rotationDeg,
      systematicStressAnisotropicScaleFraction: systematicStress.options.anisotropicScaleFraction,
      systematicStressCommonGroundShiftM: systematicStress.options.commonGroundShiftM,
      systematicStressRegionalGroundBiasM: systematicStress.options.regionalGroundBiasM,
      systematicStressSingleControlGrossErrorM: systematicStress.options.singleControlGrossErrorM,
      systematicStressPixelWaveAmplitudePx: systematicStress.options.pixelWaveAmplitudePx,
    } : {}),
  }
  return {
    schemaVersion: 1,
    patchId,
    siteId: site.id,
    siteCode: site.code,
    extentId: extent.id,
    sourceSessionId: session.id,
    ...(session.targetId ? { sourceMapTargetId: session.targetId } : {}),
    createdAt,
    reviewStatus: 'draft-unreviewed',
    geometryWgs84: geoJson.wgs84.geometry,
    geometryGcj02: geoJson.gcj02.geometry,
    qa,
  }
}

export function approvalTokenForPatch(patch: Pick<CanonicalExtentPatch, 'siteCode' | 'extentId'>) {
  return `APPROVE ${patch.siteCode} ${patch.extentId}`
}

export function approveCanonicalExtentPatch(
  patch: CanonicalExtentPatch,
  confirmationToken: string,
  confirmedAt = new Date().toISOString(),
): CanonicalExtentPatch {
  if (patch.reviewStatus !== 'draft-unreviewed') throw new Error('canonical patch is not awaiting review')
  const expected = approvalTokenForPatch(patch)
  if (confirmationToken !== expected) throw new Error(`confirmation token must exactly equal: ${expected}`)
  return {
    ...patch,
    reviewStatus: 'human-approved',
    confirmation: { token: confirmationToken, confirmedAt },
  }
}
