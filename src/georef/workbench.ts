import { fitTransform } from './fitTransform.ts'
import { buildPolygonFeature, transformPixelPolygon } from './geojson.ts'
import { evaluateFit } from './qa.ts'
import type { ErrorFieldResult } from './errorField.ts'
import type { ModelComparisonResult } from './modelComparison.ts'
import type { FitPointInfluenceResult } from './controlInfluence.ts'
import type { RobustGeoreferenceResult } from './robustRansac.ts'
import type { IrlsGeoreferenceResult } from './robustIrls.ts'
import type { LocalDistortionModelComparison, LocalDistortionResult } from './localDistortion.ts'
import type { PiecewiseSimulationResult } from './piecewiseRegistration.ts'
import type { SpatialCrossValidationResult } from './spatialCrossValidation.ts'
import type { MonteCarloUncertaintyResult } from './monteCarloUncertainty.ts'
import type { SystematicStressResult } from './systematicStress.ts'
import type { UncertainCheckHoldoutResult } from './checkUncertainty.ts'
import { summarizeUncertaintyEvidenceAudit } from './uncertaintyEvidenceAudit.ts'
import { buildEvidenceResearchBacklog } from './evidenceResearchBacklog.ts'
import type {
  GeoreferenceAdvancedQaResult,
  GeoreferenceAreaComparison,
  GeoreferenceFitResult,
  GeoreferenceSession,
} from './types.ts'

export interface SessionGeoJsonOptions {
  advancedQa?: GeoreferenceAdvancedQaResult
  areaComparison?: GeoreferenceAreaComparison
  errorField?: ErrorFieldResult
  modelComparison?: ModelComparisonResult
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
}

export function fitSession(session: GeoreferenceSession): GeoreferenceFitResult {
  const fitControls = session.controls.filter((control) => control.role !== 'check')
  const model = fitTransform(session.method, fitControls)
  return evaluateFit(model, fitControls, session.qaThresholds)
}

export function buildSessionGeoJson(
  session: GeoreferenceSession,
  fit: GeoreferenceFitResult,
  options: SessionGeoJsonOptions = {},
) {
  const wgsPolygon = transformPixelPolygon(fit.model, session.boundaryPixels)
  const qa = options.advancedQa
  const area = options.areaComparison
  const errorField = options.errorField
  const modelComparison = options.modelComparison
  const controlInfluence = options.controlInfluence
  const robust = options.robust
  const irls = options.irls
  const localDistortion = options.localDistortion
  const localDistortionComparison = options.localDistortionComparison
  const piecewise = options.piecewise
  const spatialCv = options.spatialCv
  const monteCarlo = options.monteCarlo
  const systematicStress = options.systematicStress
  const uncertainCheck = options.uncertainCheck
  const uncertaintyAudit = summarizeUncertaintyEvidenceAudit(session.controls)
  const evidenceBacklog = buildEvidenceResearchBacklog(session.controls, { influence: controlInfluence, robust, irls, uncertainCheck })
  const properties = {
    georeferenceSessionId: session.id,
    mapTargetId: session.targetId ?? null,
    siteId: session.siteId ?? null,
    boundaryExtentId: session.boundaryExtentId ?? null,
    method: session.method,
    rmseM: fit.rmseM,
    maxResidualM: fit.maxResidualM,
    qaVerdict: fit.verdict,
    checkPointCount: qa?.fit.checkControlCount ?? 0,
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
    holdoutRmseM: qa?.holdout?.rmseM ?? null,
    holdoutMaxResidualM: qa?.holdout?.maxResidualM ?? null,
    holdoutVerdict: qa?.holdout?.verdict ?? null,
    checkUncertaintyAvailable: uncertainCheck?.available ?? false,
    checkUncertaintyInterpretation: uncertainCheck?.available ? uncertainCheck.overallInterpretation : null,
    checkUncertaintyNormalizedRms: uncertainCheck?.available ? uncertainCheck.normalizedRms : null,
    checkUncertaintyMaxStandardizedResidual: uncertainCheck?.available ? uncertainCheck.maxStandardizedResidual : null,
    checkUncertaintyProfiledCount: uncertainCheck?.available ? uncertainCheck.profiledCheckCount : null,
    checkUncertaintyFallbackCount: uncertainCheck?.available ? uncertainCheck.fallbackCheckCount : null,
    checkUncertaintySigmaMinM: uncertainCheck?.available ? uncertainCheck.effectiveSigmaRangeM[0] : null,
    checkUncertaintySigmaMaxM: uncertainCheck?.available ? uncertainCheck.effectiveSigmaRangeM[1] : null,
    checkUncertaintyCompatibleCount: uncertainCheck?.available ? uncertainCheck.compatibleCount : null,
    checkUncertaintyTensionCount: uncertainCheck?.available ? uncertainCheck.tensionCount : null,
    checkUncertaintyInconsistentCount: uncertainCheck?.available ? uncertainCheck.inconsistentCount : null,
    looAvailable: qa?.leaveOneOut.available ?? false,
    looRmseM: qa?.leaveOneOut.available ? qa.leaveOneOut.rmseM : null,
    looMaxResidualM: qa?.leaveOneOut.available ? qa.leaveOneOut.maxResidualM : null,
    looVerdict: qa?.leaveOneOut.available ? qa.leaveOneOut.verdict : null,
    spatialDistributionScore: qa?.spatialDistribution.available ? qa.spatialDistribution.score : null,
    spatialDistributionVerdict: qa?.spatialDistribution.available ? qa.spatialDistribution.verdict : null,
    officialAreaHa: area?.officialAreaHa ?? null,
    computedAreaHa: area?.computedAreaHa ?? null,
    areaDifferencePercent: area?.differencePercent ?? null,
    areaVerdict: area?.verdict ?? null,
    errorPattern: errorField?.available ? errorField.pattern : null,
    systematicBiasM: errorField?.available ? errorField.systematicMagnitudeM : null,
    systematicBearingDeg: errorField?.available ? errorField.systematicBearingDeg : null,
    directionalCoherence: errorField?.available ? errorField.directionalCoherence : null,
    localErrorRmsM: errorField?.available ? errorField.localRmsM : null,
    modelRecommendation: modelComparison?.available ? modelComparison.recommendation : null,
    affineHoldoutRmseM: modelComparison?.available ? modelComparison.affine.holdout?.rmseM ?? null : null,
    projectiveHoldoutRmseM: modelComparison?.available ? modelComparison.projective.holdout?.rmseM ?? null : null,
    modelBoundaryMeanDivergenceM: modelComparison?.available ? modelComparison.boundaryDivergence?.meanM ?? null : null,
    modelBoundaryMaxDivergenceM: modelComparison?.available ? modelComparison.boundaryDivergence?.maxM ?? null : null,
    controlInfluenceAvailable: controlInfluence?.available ?? false,
    controlInfluenceTopSuspectId: controlInfluence?.available ? controlInfluence.topSuspectControlId ?? null : null,
    controlInfluenceSuspectCount: controlInfluence?.available ? controlInfluence.suspectCount : null,
    controlInfluenceSupportiveCount: controlInfluence?.available ? controlInfluence.supportiveCount : null,
    controlInfluenceMaxHoldoutImprovementM: controlInfluence?.available ? Math.max(...controlInfluence.points.map((point) => point.holdoutImprovementM), 0) : null,
    controlInfluenceMaxBoundaryShiftM: controlInfluence?.available ? Math.max(...controlInfluence.points.map((point) => point.boundaryMaxShiftM), 0) : null,
    robustAvailable: robust?.available ?? false,
    robustMethod: robust?.available ? robust.method : null,
    robustThresholdM: robust?.available ? robust.thresholdM : null,
    robustTrialCount: robust?.available ? robust.trialCount : null,
    robustValidTrialCount: robust?.available ? robust.validTrialCount : null,
    robustOutlierCount: robust?.available ? robust.outlierCount : null,
    robustTopOutlierId: robust?.available ? [...robust.points].filter((point) => point.status === 'outlier').sort((a, b) => b.outlierVoteRate - a.outlierVoteRate)[0]?.controlId ?? null : null,
    robustHoldoutRmseM: robust?.available ? robust.robustHoldout.rmseM : null,
    robustBaselineHoldoutRmseM: robust?.available ? robust.baselineHoldout.rmseM : null,
    robustBoundaryMeanDivergenceM: robust?.available ? robust.boundaryDivergence.meanM : null,
    robustBoundaryMaxDivergenceM: robust?.available ? robust.boundaryDivergence.maxM : null,
    robustRecommendation: robust?.available ? robust.recommendation : null,
    irlsAvailable: irls?.available ?? false,
    irlsRecommendation: irls?.available ? irls.recommendation : null,
    irlsTopDownweightedId: irls?.available ? [...irls.tukey.points, ...irls.huber.points].sort((a, b) => a.weight - b.weight)[0]?.controlId ?? null : null,
    huberHoldoutRmseM: irls?.available ? irls.huber.holdout.rmseM : null,
    tukeyHoldoutRmseM: irls?.available ? irls.tukey.holdout.rmseM : null,
    huberMinWeight: irls?.available ? Math.min(...irls.huber.points.map((point) => point.weight)) : null,
    tukeyMinWeight: irls?.available ? Math.min(...irls.tukey.points.map((point) => point.weight)) : null,
    huberSevereCount: irls?.available ? irls.huber.severeCount : null,
    tukeySevereCount: irls?.available ? irls.tukey.severeCount : null,
    irlsBoundaryMaxDivergenceM: irls?.available ? Math.max(irls.huber.boundaryDivergence.maxM, irls.tukey.boundaryDivergence.maxM) : null,
    localDistortionAvailable: localDistortion?.available ?? false,
    localDistortionPattern: localDistortion?.available ? localDistortion.pattern : null,
    localDistortionGradientExplainedFraction: localDistortion?.available ? localDistortion.gradientExplainedFraction : null,
    localDistortionPostFieldRmsM: localDistortion?.available ? localDistortion.postFieldRmsM : null,
    localDistortionFieldVariationM: localDistortion?.available ? localDistortion.fieldVariationM : null,
    localDistortionHotspotRegion: localDistortion?.available ? localDistortion.hotspotRegion ?? null : null,
    localDistortionRecommendation: localDistortionComparison?.recommendation ?? null,
    localDistortionBestModelId: localDistortionComparison?.bestModelId ?? null,
    localDistortionPersistentHotspotRegion: localDistortionComparison?.persistentHotspotRegion ?? null,
    localDistortionPiecewiseSuggested: localDistortionComparison?.recommendation === 'consider-piecewise',
    piecewiseAvailable: piecewise?.available ?? false,
    piecewiseRecommendation: piecewise?.available ? piecewise.recommendation : null,
    piecewiseBestLayout: piecewise?.available ? piecewise.bestLayout ?? null : null,
    piecewiseBestHoldoutRmseM: piecewise?.available && piecewise.bestLayout ? (piecewise.candidates.find((candidate) => candidate.layout === piecewise.bestLayout && candidate.available) as any)?.holdoutRmseM ?? null : null,
    piecewiseBestSeamMaxM: piecewise?.available && piecewise.bestLayout ? (piecewise.candidates.find((candidate) => candidate.layout === piecewise.bestLayout && candidate.available) as any)?.seamMaxM ?? null : null,
    piecewiseBestFoldOverRisk: piecewise?.available && piecewise.bestLayout ? (piecewise.candidates.find((candidate) => candidate.layout === piecewise.bestLayout && candidate.available) as any)?.foldOverRisk ?? null : null,
    spatialCvAvailable: spatialCv?.available ?? false,
    spatialCvRecommendation: spatialCv?.available ? spatialCv.recommendation : null,
    spatialCvBestGlobalModelId: spatialCv?.available ? spatialCv.bestGlobalModelId : null,
    spatialCvBestPiecewiseModelId: spatialCv?.available ? spatialCv.bestPiecewiseModelId ?? null : null,
    spatialCvRawImprovementPercent: spatialCv?.available ? spatialCv.rawImprovementPercent : null,
    spatialCvAdjustedImprovementPercent: spatialCv?.available ? spatialCv.adjustedImprovementPercent : null,
    spatialCvBestGlobalRmseM: spatialCv?.available ? (spatialCv.models.find((model) => model.id === spatialCv.bestGlobalModelId && model.available) as any)?.cvRmseM ?? null : null,
    spatialCvBestPiecewiseRmseM: spatialCv?.available && spatialCv.bestPiecewiseModelId ? (spatialCv.models.find((model) => model.id === spatialCv.bestPiecewiseModelId && model.available) as any)?.cvRmseM ?? null : null,
    spatialCvBestPiecewiseAdjustedRmseM: spatialCv?.available && spatialCv.bestPiecewiseModelId ? (spatialCv.models.find((model) => model.id === spatialCv.bestPiecewiseModelId && model.available) as any)?.adjustedCvRmseM ?? null : null,
    spatialCvBestPiecewiseWorstFoldId: spatialCv?.available && spatialCv.bestPiecewiseModelId ? (spatialCv.models.find((model) => model.id === spatialCv.bestPiecewiseModelId && model.available) as any)?.worstFoldId ?? null : null,
    spatialCvBestPiecewiseComplexitySurchargePercent: spatialCv?.available && spatialCv.bestPiecewiseModelId ? (spatialCv.models.find((model) => model.id === spatialCv.bestPiecewiseModelId && model.available) as any)?.complexitySurchargePercent ?? null : null,
    spatialCvBestPiecewiseSupportRatio: spatialCv?.available && spatialCv.bestPiecewiseModelId ? (spatialCv.models.find((model) => model.id === spatialCv.bestPiecewiseModelId && model.available) as any)?.minTrainingSupportRatio ?? null : null,
    monteCarloAvailable: monteCarlo?.available ?? false,
    monteCarloTrials: monteCarlo?.available ? monteCarlo.trials : null,
    monteCarloSuccessfulTrials: monteCarlo?.available ? monteCarlo.successfulTrials : null,
    monteCarloSeed: monteCarlo?.available ? monteCarlo.seed : null,
    monteCarloPixelSigmaPx: monteCarlo?.available ? monteCarlo.pixelSigmaPx : null,
    monteCarloGroundSigmaM: monteCarlo?.available ? monteCarlo.groundSigmaM : null,
    monteCarloUncertaintyMode: monteCarlo?.available ? monteCarlo.uncertaintyMode : null,
    monteCarloProfiledControlCount: monteCarlo?.available ? monteCarlo.uncertaintySummary.profiledControlCount : null,
    monteCarloFallbackControlCount: monteCarlo?.available ? monteCarlo.uncertaintySummary.fallbackControlCount : null,
    monteCarloPixelSigmaMinPx: monteCarlo?.available ? monteCarlo.uncertaintySummary.pixelSigmaRangePx[0] : null,
    monteCarloPixelSigmaMaxPx: monteCarlo?.available ? monteCarlo.uncertaintySummary.pixelSigmaRangePx[1] : null,
    monteCarloGroundSigmaMinM: monteCarlo?.available ? monteCarlo.uncertaintySummary.groundSigmaRangeM[0] : null,
    monteCarloGroundSigmaMaxM: monteCarlo?.available ? monteCarlo.uncertaintySummary.groundSigmaRangeM[1] : null,
    monteCarloWinnerModelId: monteCarlo?.available ? monteCarlo.winnerModelId : null,
    monteCarloWinnerRate: monteCarlo?.available ? monteCarlo.winnerRate : null,
    monteCarloRunnerUpModelId: monteCarlo?.available ? monteCarlo.runnerUpModelId ?? null : null,
    monteCarloRunnerUpRate: monteCarlo?.available ? monteCarlo.runnerUpRate ?? null : null,
    monteCarloEvidenceWinnerModelId: monteCarlo?.available ? monteCarlo.evidenceWinnerModelId ?? null : null,
    monteCarloEvidenceWinnerRate: monteCarlo?.available ? monteCarlo.evidenceWinnerRate ?? null : null,
    monteCarloEvidenceRunnerUpModelId: monteCarlo?.available ? monteCarlo.evidenceRunnerUpModelId ?? null : null,
    monteCarloEvidenceRunnerUpRate: monteCarlo?.available ? monteCarlo.evidenceRunnerUpRate ?? null : null,
    monteCarloRecommendation: monteCarlo?.available ? monteCarlo.recommendation : null,
    monteCarloBoundaryMeanP95M: monteCarlo?.available ? monteCarlo.boundary?.meanP95M ?? null : null,
    monteCarloBoundaryMaxP95M: monteCarlo?.available ? monteCarlo.boundary?.maxP95M ?? null : null,
    monteCarloBoundaryMaxObservedM: monteCarlo?.available ? monteCarlo.boundary?.maxObservedM ?? null : null,
    monteCarloMostUnstableSegment: monteCarlo?.available && monteCarlo.boundary ? `${monteCarlo.boundary.mostUnstableSegment.startVertexIndex}-${monteCarlo.boundary.mostUnstableSegment.endVertexIndex}` : null,
    systematicStressAvailable: systematicStress?.available ?? false,
    systematicStressRecommendation: systematicStress?.available ? systematicStress.recommendation : null,
    systematicStressDominantScenarioId: systematicStress?.available ? systematicStress.dominantScenarioId : null,
    systematicStressBaselineWinnerModelId: systematicStress?.available ? systematicStress.baselineWinnerModelId : null,
    systematicStressModelFlipCount: systematicStress?.available ? systematicStress.modelFlipCount : null,
    systematicStressMaxHoldoutIncreaseM: systematicStress?.available ? systematicStress.maxHoldoutIncreaseM : null,
    systematicStressMaxBoundaryShiftM: systematicStress?.available ? systematicStress.maxBoundaryShiftM : null,
    systematicStressRotationDeg: systematicStress?.available ? systematicStress.options.rotationDeg : null,
    systematicStressAnisotropicScaleFraction: systematicStress?.available ? systematicStress.options.anisotropicScaleFraction : null,
    systematicStressCommonGroundShiftM: systematicStress?.available ? systematicStress.options.commonGroundShiftM : null,
    systematicStressRegionalGroundBiasM: systematicStress?.available ? systematicStress.options.regionalGroundBiasM : null,
    systematicStressSingleControlGrossErrorM: systematicStress?.available ? systematicStress.options.singleControlGrossErrorM : null,
    systematicStressPixelWaveAmplitudePx: systematicStress?.available ? systematicStress.options.pixelWaveAmplitudePx : null,
    reviewStatus: 'draft-unreviewed',
  }
  return {
    wgs84: buildPolygonFeature(wgsPolygon, 'WGS84', properties),
    gcj02: buildPolygonFeature(wgsPolygon, 'GCJ-02', properties),
  }
}
