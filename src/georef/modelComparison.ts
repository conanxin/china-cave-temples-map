import { evaluateLeaveOneOut } from './advancedQa.ts'
import { applyTransform, fitTransform } from './fitTransform.ts'
import { evaluateFit, haversineMeters } from './qa.ts'
import type {
  GeoreferenceFitResult,
  GeoreferenceHoldoutQa,
  GeoreferenceLeaveOneOut,
  GeoreferenceMethod,
  GeoreferenceSession,
  GeoreferenceTransformModel,
  GroundPoint,
} from './types.ts'

export interface ModelDiagnostic {
  method: GeoreferenceMethod
  model: GeoreferenceTransformModel
  fit: GeoreferenceFitResult
  holdout?: GeoreferenceHoldoutQa
  leaveOneOut: GeoreferenceLeaveOneOut
  boundaryWgs84: GroundPoint[]
}

export interface BoundaryDivergence {
  meanM: number
  maxM: number
  samples: Array<{ affine: GroundPoint; projective: GroundPoint; separationM: number }>
}

export type ModelComparisonResult =
  | { available: false; reason: string }
  | {
      available: true
      affine: ModelDiagnostic
      projective: ModelDiagnostic
      boundaryDivergence?: BoundaryDivergence
      recommendation: 'affine' | 'projective' | 'controls' | 'insufficient'
      reasons: string[]
    }

function diagnosticFor(method: GeoreferenceMethod, session: GeoreferenceSession): ModelDiagnostic {
  const fitControls = session.controls.filter((control) => control.role !== 'check')
  const checkControls = session.controls.filter((control) => control.role === 'check')
  const model = fitTransform(method, fitControls)
  const fit = evaluateFit(model, fitControls, session.qaThresholds)
  const holdout = checkControls.length ? (() => {
    const qa = evaluateFit(model, checkControls, session.qaThresholds)
    return { count: checkControls.length, residuals: qa.residuals, rmseM: qa.rmseM, maxResidualM: qa.maxResidualM, verdict: qa.verdict }
  })() : undefined
  const leaveOneOut = evaluateLeaveOneOut(method, fitControls, session.qaThresholds)
  const boundaryWgs84 = session.boundaryPixels.map((pixel) => applyTransform(model, pixel))
  return { method, model, fit, holdout, leaveOneOut, boundaryWgs84 }
}

function boundaryDivergence(affine: ModelDiagnostic, projective: ModelDiagnostic): BoundaryDivergence | undefined {
  if (!affine.boundaryWgs84.length || affine.boundaryWgs84.length !== projective.boundaryWgs84.length) return undefined
  const samples = affine.boundaryWgs84.map((point, index) => {
    const other = projective.boundaryWgs84[index]
    return { affine: point, projective: other, separationM: haversineMeters(point, other) }
  })
  return {
    meanM: samples.reduce((sum, item) => sum + item.separationM, 0) / samples.length,
    maxM: Math.max(...samples.map((item) => item.separationM)),
    samples,
  }
}

function notFailed(loo: GeoreferenceLeaveOneOut) {
  return !loo.available || loo.verdict !== 'fail'
}

function recommendationFor(affine: ModelDiagnostic, projective: ModelDiagnostic, checkCount: number) {
  const reasons: string[] = []
  if (checkCount < 2) return { recommendation: 'insufficient' as const, reasons: ['at least 2 independent check points are required for model selection'] }
  const a = affine.holdout!
  const p = projective.holdout!

  if (!projective.leaveOneOut.available) {
    if (a.verdict === 'pass') return { recommendation: 'affine' as const, reasons: ['projective leave-one-out is unavailable; prefer the simpler affine model until additional fit points are added'] }
    return { recommendation: 'insufficient' as const, reasons: ['projective leave-one-out is unavailable; add additional fit points before switching model'] }
  }

  if (a.verdict === 'fail' && p.verdict === 'fail') {
    return { recommendation: 'controls' as const, reasons: ['both models fail independent check points; revise control points or source-map assumptions'] }
  }
  if (a.verdict === 'pass' && p.verdict !== 'pass') {
    return { recommendation: 'affine' as const, reasons: ['affine passes holdout while projective does not'] }
  }
  if (p.verdict === 'pass' && a.verdict !== 'pass' && notFailed(projective.leaveOneOut)) {
    return { recommendation: 'projective' as const, reasons: ['projective passes holdout while affine does not'] }
  }

  const differenceM = a.rmseM - p.rmseM
  if (a.verdict === 'pass' && p.verdict === 'pass' && Math.abs(differenceM) <= 1) {
    return { recommendation: 'affine' as const, reasons: ['both models perform equivalently on holdout; prefer the simpler affine model'] }
  }
  if (p.rmseM < a.rmseM * 0.75 && notFailed(projective.leaveOneOut)) {
    return { recommendation: 'projective' as const, reasons: [`projective holdout RMSE improves by ${((1 - p.rmseM / a.rmseM) * 100).toFixed(0)}%`] }
  }
  if (a.rmseM <= p.rmseM * 1.1 && notFailed(affine.leaveOneOut)) {
    return { recommendation: 'affine' as const, reasons: ['projective does not provide a material holdout improvement; prefer affine'] }
  }
  reasons.push('model evidence is mixed; revise controls or add independent check points before switching model')
  return { recommendation: 'controls' as const, reasons }
}

export function compareGeoreferenceModels(session: GeoreferenceSession): ModelComparisonResult {
  const fitControls = session.controls.filter((control) => control.role !== 'check')
  if (fitControls.length < 4) return { available: false, reason: 'dual-model comparison requires at least 4 fit points' }
  try {
    const affine = diagnosticFor('affine', session)
    const projective = diagnosticFor('projective', session)
    const checkCount = session.controls.filter((control) => control.role === 'check').length
    const recommendation = recommendationFor(affine, projective, checkCount)
    return {
      available: true,
      affine,
      projective,
      boundaryDivergence: boundaryDivergence(affine, projective),
      ...recommendation,
    }
  } catch (error) {
    return { available: false, reason: `dual-model comparison failed: ${error instanceof Error ? error.message : String(error)}` }
  }
}
