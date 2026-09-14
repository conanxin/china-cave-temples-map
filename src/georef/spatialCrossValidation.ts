import { applyTransform, fitAffine, fitTransform } from './fitTransform.ts'
import { haversineMeters } from './qa.ts'
import { simulatePiecewiseRegistration, type PiecewiseLayout } from './piecewiseRegistration.ts'
import type { AffineModel, GeoreferenceControlPoint, GeoreferenceMethod, GeoreferenceSession, PixelPoint } from './types.ts'

export type SpatialCvModelId =
  | 'affine'
  | 'projective'
  | 'piecewise-vertical-2'
  | 'piecewise-horizontal-2'
  | 'piecewise-quadrants-4'

export type SpatialCvRecommendation = 'piecewise-supported' | 'piecewise-review' | 'overfit-risk' | 'global-preferred' | 'insufficient'

export interface SpatialCvFoldResult {
  id: string
  row: number
  column: number
  available: boolean
  heldOutControlIds: string[]
  trainingControlCount: number
  rmseM?: number
  maxResidualM?: number
  reason?: string
}

interface SpatialCvCommon {
  id: SpatialCvModelId
  label: string
  parameterCount: number
  totalFitPointCount: number
  evaluatedPointCount: number
  coverageRatio: number
  folds: SpatialCvFoldResult[]
  complexitySurchargePercent: number
}

export type SpatialCvModelResult =
  | (SpatialCvCommon & { available: false; reason: string })
  | (SpatialCvCommon & {
      available: true
      cvRmseM: number
      cvMaxResidualM: number
      adjustedCvRmseM: number
      foldRmseMeanM: number
      foldRmseStdM: number
      foldStabilityRatio: number
      independentCheckCount: number
      independentCheckRmseM?: number
      independentCheckMaxResidualM?: number
      minTrainingSupportRatio: number
      worstFoldId: string
    })

export type SpatialCrossValidationResult =
  | { available: false; reason: string }
  | {
      available: true
      gridColumns: number
      gridRows: number
      models: SpatialCvModelResult[]
      bestGlobalModelId: 'affine' | 'projective'
      bestPiecewiseModelId?: Extract<SpatialCvModelId, `piecewise-${string}`>
      rawImprovementPercent: number
      adjustedImprovementPercent: number
      recommendation: SpatialCvRecommendation
      reasons: string[]
    }

interface RegionDefinition {
  id: string
  minX: number
  maxX: number
  minY: number
  maxY: number
}

interface PiecewiseFit {
  definition: RegionDefinition
  model: AffineModel
  fitCount: number
}

const GRID_COLUMNS = 3
const GRID_ROWS = 2

function modelLabel(id: SpatialCvModelId) {
  if (id === 'affine') return 'Global Affine'
  if (id === 'projective') return 'Global Projective'
  if (id === 'piecewise-vertical-2') return 'Piecewise 2×1'
  if (id === 'piecewise-horizontal-2') return 'Piecewise 1×2'
  return 'Piecewise 2×2'
}

function parameterCount(id: SpatialCvModelId) {
  if (id === 'affine') return 6
  if (id === 'projective') return 8
  if (id === 'piecewise-quadrants-4') return 24
  return 12
}

function complexitySurchargePercent(id: SpatialCvModelId) {
  const count = parameterCount(id)
  return Math.max(0, 5 * Math.log2(count / 6))
}

function piecewiseLayout(id: SpatialCvModelId): PiecewiseLayout | undefined {
  if (id === 'piecewise-vertical-2') return 'vertical-2'
  if (id === 'piecewise-horizontal-2') return 'horizontal-2'
  if (id === 'piecewise-quadrants-4') return 'quadrants-4'
  return undefined
}

function regionDefinitions(layout: PiecewiseLayout, width: number, height: number): RegionDefinition[] {
  if (layout === 'vertical-2') return [
    { id: 'W', minX: 0, maxX: width / 2, minY: 0, maxY: height },
    { id: 'E', minX: width / 2, maxX: width, minY: 0, maxY: height },
  ]
  if (layout === 'horizontal-2') return [
    { id: 'N', minX: 0, maxX: width, minY: 0, maxY: height / 2 },
    { id: 'S', minX: 0, maxX: width, minY: height / 2, maxY: height },
  ]
  return [
    { id: 'NW', minX: 0, maxX: width / 2, minY: 0, maxY: height / 2 },
    { id: 'NE', minX: width / 2, maxX: width, minY: 0, maxY: height / 2 },
    { id: 'SW', minX: 0, maxX: width / 2, minY: height / 2, maxY: height },
    { id: 'SE', minX: width / 2, maxX: width, minY: height / 2, maxY: height },
  ]
}

function regionForPixel(regions: RegionDefinition[], pixel: PixelPoint) {
  const lastX = Math.max(...regions.map((region) => region.maxX))
  const lastY = Math.max(...regions.map((region) => region.maxY))
  return regions.find((region) => (
    pixel.x >= region.minX && (pixel.x < region.maxX || (region.maxX === lastX && pixel.x <= region.maxX))
    && pixel.y >= region.minY && (pixel.y < region.maxY || (region.maxY === lastY && pixel.y <= region.maxY))
  ))
}

function foldIdForPixel(pixel: PixelPoint, width: number, height: number) {
  const column = Math.min(GRID_COLUMNS - 1, Math.max(0, Math.floor(pixel.x / Math.max(width, 1) * GRID_COLUMNS)))
  const row = Math.min(GRID_ROWS - 1, Math.max(0, Math.floor(pixel.y / Math.max(height, 1) * GRID_ROWS)))
  return { id: `r${row}c${column}`, row, column }
}

function buildFolds(controls: GeoreferenceControlPoint[], width: number, height: number) {
  const byId = new Map<string, { id: string; row: number; column: number; controls: GeoreferenceControlPoint[] }>()
  for (const control of controls) {
    const fold = foldIdForPixel(control.pixel, width, height)
    const existing = byId.get(fold.id)
    if (existing) existing.controls.push(control)
    else byId.set(fold.id, { ...fold, controls: [control] })
  }
  return [...byId.values()].sort((a, b) => a.row - b.row || a.column - b.column)
}

function summarizeResiduals(values: number[]) {
  const rmseM = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length)
  return { rmseM, maxResidualM: Math.max(...values) }
}

function standardDeviation(values: number[]) {
  if (!values.length) return 0
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length)
}

function fitPiecewise(layout: PiecewiseLayout, controls: GeoreferenceControlPoint[], width: number, height: number) {
  const regions = regionDefinitions(layout, width, height)
  const fits: PiecewiseFit[] = []
  for (const definition of regions) {
    const local = controls.filter((control) => regionForPixel(regions, control.pixel)?.id === definition.id)
    if (local.length < 3) throw new Error(`region ${definition.id} has ${local.length} fit points; requires at least 3`)
    fits.push({ definition, model: fitAffine(local), fitCount: local.length })
  }
  return {
    fits,
    predict(pixel: PixelPoint) {
      const region = regionForPixel(regions, pixel)
      const fit = fits.find((candidate) => candidate.definition.id === region?.id)
      if (!fit) throw new Error(`no local model for ${pixel.x},${pixel.y}`)
      return applyTransform(fit.model, pixel)
    },
  }
}

function evaluateIndependentChecks(
  id: SpatialCvModelId,
  session: GeoreferenceSession,
  fitControls: GeoreferenceControlPoint[],
  checkControls: GeoreferenceControlPoint[],
) {
  if (!checkControls.length || !session.imageWidth || !session.imageHeight) return undefined
  try {
    let predict: (pixel: PixelPoint) => { lng: number; lat: number }
    const layout = piecewiseLayout(id)
    if (layout) {
      const model = fitPiecewise(layout, fitControls, session.imageWidth, session.imageHeight)
      predict = model.predict
    } else {
      const model = fitTransform(id as GeoreferenceMethod, fitControls)
      predict = (pixel) => applyTransform(model, pixel)
    }
    const residuals = checkControls.map((control) => haversineMeters(predict(control.pixel), control.ground))
    return { count: residuals.length, ...summarizeResiduals(residuals) }
  } catch {
    return undefined
  }
}

function evaluateModel(id: SpatialCvModelId, session: GeoreferenceSession, fitControls: GeoreferenceControlPoint[]): SpatialCvModelResult {
  const width = session.imageWidth!
  const height = session.imageHeight!
  const folds = buildFolds(fitControls, width, height)
  const foldResults: SpatialCvFoldResult[] = []
  const allResiduals: number[] = []
  const foldRmseValues: number[] = []
  let minTrainingSupportRatio = Number.POSITIVE_INFINITY

  for (const fold of folds) {
    const heldIds = new Set(fold.controls.map((control) => control.id))
    const training = fitControls.filter((control) => !heldIds.has(control.id))
    try {
      let predict: (pixel: PixelPoint) => { lng: number; lat: number }
      const layout = piecewiseLayout(id)
      if (layout) {
        const fitted = fitPiecewise(layout, training, width, height)
        predict = fitted.predict
        minTrainingSupportRatio = Math.min(minTrainingSupportRatio, ...fitted.fits.map((item) => 2 * item.fitCount / 6))
      } else {
        const minimum = id === 'affine' ? 3 : 4
        if (training.length < minimum) throw new Error(`${id} requires at least ${minimum} training fit points`)
        const fitted = fitTransform(id as GeoreferenceMethod, training)
        predict = (pixel) => applyTransform(fitted, pixel)
        minTrainingSupportRatio = Math.min(minTrainingSupportRatio, 2 * training.length / parameterCount(id))
      }
      const residuals = fold.controls.map((control) => haversineMeters(predict(control.pixel), control.ground))
      const summary = summarizeResiduals(residuals)
      allResiduals.push(...residuals)
      foldRmseValues.push(summary.rmseM)
      foldResults.push({
        id: fold.id,
        row: fold.row,
        column: fold.column,
        available: true,
        heldOutControlIds: fold.controls.map((control) => control.id),
        trainingControlCount: training.length,
        ...summary,
      })
    } catch (error) {
      foldResults.push({
        id: fold.id,
        row: fold.row,
        column: fold.column,
        available: false,
        heldOutControlIds: fold.controls.map((control) => control.id),
        trainingControlCount: training.length,
        reason: `spatial fold ${fold.id}: ${error instanceof Error ? error.message : String(error)}`,
      })
    }
  }

  const common = {
    id,
    label: modelLabel(id),
    parameterCount: parameterCount(id),
    totalFitPointCount: fitControls.length,
    evaluatedPointCount: allResiduals.length,
    coverageRatio: fitControls.length ? allResiduals.length / fitControls.length : 0,
    folds: foldResults,
    complexitySurchargePercent: complexitySurchargePercent(id),
  }
  const firstInvalid = foldResults.find((fold) => !fold.available)
  if (firstInvalid || allResiduals.length !== fitControls.length) {
    return {
      ...common,
      available: false,
      reason: firstInvalid?.reason ?? `spatial CV covered ${allResiduals.length}/${fitControls.length} fit points`,
    }
  }

  const cv = summarizeResiduals(allResiduals)
  const foldRmseMeanM = foldRmseValues.reduce((sum, value) => sum + value, 0) / foldRmseValues.length
  const foldRmseStdM = standardDeviation(foldRmseValues)
  const independent = evaluateIndependentChecks(id, session, fitControls, session.controls.filter((control) => control.role === 'check'))
  const adjustedCvRmseM = cv.rmseM * (1 + common.complexitySurchargePercent / 100)
  const worst = [...foldResults].filter((fold): fold is SpatialCvFoldResult & { available: true; rmseM: number } => fold.available && fold.rmseM !== undefined).sort((a, b) => b.rmseM - a.rmseM)[0]

  return {
    ...common,
    available: true,
    cvRmseM: cv.rmseM,
    cvMaxResidualM: cv.maxResidualM,
    adjustedCvRmseM,
    foldRmseMeanM,
    foldRmseStdM,
    foldStabilityRatio: foldRmseMeanM > 1e-9 ? foldRmseStdM / foldRmseMeanM : 0,
    independentCheckCount: independent?.count ?? 0,
    ...(independent ? { independentCheckRmseM: independent.rmseM, independentCheckMaxResidualM: independent.maxResidualM } : {}),
    minTrainingSupportRatio: Number.isFinite(minTrainingSupportRatio) ? minTrainingSupportRatio : 0,
    worstFoldId: worst?.id ?? '—',
  }
}

export function evaluateSpatialCrossValidation(session: GeoreferenceSession): SpatialCrossValidationResult {
  if (!session.imageWidth || !session.imageHeight) return { available: false, reason: 'spatial cross-validation requires image width and height' }
  const fitControls = session.controls.filter((control) => control.role !== 'check')
  if (fitControls.length < 6) return { available: false, reason: 'spatial cross-validation requires at least 6 fit points' }

  const ids: SpatialCvModelId[] = ['affine', 'projective', 'piecewise-vertical-2', 'piecewise-horizontal-2', 'piecewise-quadrants-4']
  const models = ids.map((id) => evaluateModel(id, session, fitControls))
  const availableGlobals = models.filter((model): model is Extract<SpatialCvModelResult, { available: true }> => model.available && (model.id === 'affine' || model.id === 'projective'))
    .sort((a, b) => a.adjustedCvRmseM - b.adjustedCvRmseM)
  const bestGlobal = availableGlobals[0]
  if (!bestGlobal) return { available: false, reason: 'neither global affine nor projective survives every spatial fold' }

  const availablePiecewise = models.filter((model): model is Extract<SpatialCvModelResult, { available: true }> => model.available && model.id.startsWith('piecewise-'))
    .sort((a, b) => a.adjustedCvRmseM - b.adjustedCvRmseM)
  const bestPiecewise = availablePiecewise[0]
  if (!bestPiecewise) {
    return {
      available: true,
      gridColumns: GRID_COLUMNS,
      gridRows: GRID_ROWS,
      models,
      bestGlobalModelId: bestGlobal.id as 'affine' | 'projective',
      rawImprovementPercent: 0,
      adjustedImprovementPercent: 0,
      recommendation: 'global-preferred',
      reasons: ['no Piecewise candidate survives all spatial folds; keep the globally validated model'],
    }
  }

  const rawImprovementPercent = bestGlobal.cvRmseM > 1e-9 ? (bestGlobal.cvRmseM - bestPiecewise.cvRmseM) / bestGlobal.cvRmseM * 100 : 0
  const adjustedImprovementPercent = bestGlobal.adjustedCvRmseM > 1e-9
    ? (bestGlobal.adjustedCvRmseM - bestPiecewise.adjustedCvRmseM) / bestGlobal.adjustedCvRmseM * 100
    : 0
  const layout = piecewiseLayout(bestPiecewise.id)!
  const simulation = simulatePiecewiseRegistration(session)
  const candidate = simulation.available ? simulation.candidates.find((item) => item.layout === layout) : undefined
  const candidateSafe = candidate?.available && !candidate.foldOverRisk && candidate.seamMaxM <= session.qaThresholds.reviewMaxM && candidate.holdoutVerdict !== 'fail'
  const candidatePromising = candidate?.available && candidate.recommendation === 'promising'
  const stableEnough = bestPiecewise.foldRmseStdM <= Math.max(10, bestPiecewise.foldRmseMeanM * 0.75)
  const supportedEnough = bestPiecewise.minTrainingSupportRatio >= 1.33
  const nearPerfectGlobal = bestGlobal.cvRmseM <= 0.5 && bestPiecewise.cvRmseM <= 0.5
  const independentSupportsPiecewise = bestPiecewise.independentCheckRmseM === undefined || bestGlobal.independentCheckRmseM === undefined
    || bestPiecewise.independentCheckRmseM <= Math.max(1, bestGlobal.independentCheckRmseM * 0.9)

  const reasons: string[] = []
  let recommendation: SpatialCvRecommendation = 'global-preferred'
  if (nearPerfectGlobal) {
    reasons.push('global model already cross-validates near perfectly; extra Piecewise parameters add no practical gain')
  } else if (candidatePromising && adjustedImprovementPercent < 5) {
    recommendation = 'overfit-risk'
    reasons.push('Piecewise looks promising on the current checks but spatial blocked CV does not preserve the gain')
  } else if (adjustedImprovementPercent >= 15 && candidateSafe && stableEnough && supportedEnough && independentSupportsPiecewise) {
    recommendation = 'piecewise-supported'
    reasons.push(`complexity-adjusted spatial CV improves ${adjustedImprovementPercent.toFixed(0)}% and remains stable across held-out map blocks`)
  } else if (adjustedImprovementPercent >= 5 && candidateSafe) {
    recommendation = 'piecewise-review'
    reasons.push(`Piecewise keeps ${adjustedImprovementPercent.toFixed(0)}% complexity-adjusted spatial CV gain but still needs manual review`)
    if (!stableEnough) reasons.push('fold-to-fold error is unstable')
    if (!supportedEnough) reasons.push('at least one local model has weak parameter redundancy under spatial holdout')
    if (!independentSupportsPiecewise) reasons.push('independent check points do not confirm the spatial-CV advantage')
  } else {
    reasons.push('Piecewise does not retain enough complexity-adjusted gain under spatial block holdout')
    if (!candidateSafe) reasons.push('existing Piecewise seam/fold-over/independent-check guards are not satisfied')
  }

  return {
    available: true,
    gridColumns: GRID_COLUMNS,
    gridRows: GRID_ROWS,
    models,
    bestGlobalModelId: bestGlobal.id as 'affine' | 'projective',
    bestPiecewiseModelId: bestPiecewise.id as Extract<SpatialCvModelId, `piecewise-${string}`>,
    rawImprovementPercent,
    adjustedImprovementPercent,
    recommendation,
    reasons,
  }
}
