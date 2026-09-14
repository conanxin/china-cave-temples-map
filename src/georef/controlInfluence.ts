import { evaluateLeaveOneOut } from './advancedQa.ts'
import { applyTransform, fitTransform } from './fitTransform.ts'
import { evaluateFit, haversineMeters } from './qa.ts'
import type { GeoreferenceLeaveOneOut, GeoreferenceSession, GroundPoint } from './types.ts'

export type FitPointInfluenceStatus = 'suspect' | 'supportive' | 'neutral'

export interface FitPointInfluenceRecord {
  controlId: string
  label?: string
  status: FitPointInfluenceStatus
  baselineHoldoutRmseM: number
  omittedHoldoutRmseM: number
  holdoutImprovementM: number
  holdoutImprovementPercent: number
  boundaryMeanShiftM: number
  boundaryMaxShiftM: number
  omittedLeaveOneOut: GeoreferenceLeaveOneOut
  reasons: string[]
}

export type FitPointInfluenceResult =
  | { available: false; reason: string }
  | {
      available: true
      method: GeoreferenceSession['method']
      baselineCheckCount: number
      baselineHoldoutRmseM: number
      baselineHoldoutMaxResidualM: number
      points: FitPointInfluenceRecord[]
      topSuspectControlId?: string
      suspectCount: number
      supportiveCount: number
    }

const MATERIAL_CHANGE_PERCENT = 25
const MATERIAL_CHANGE_METERS = 5

function boundaryPoints(session: GeoreferenceSession, model: ReturnType<typeof fitTransform>): GroundPoint[] {
  return session.boundaryPixels.map((pixel) => applyTransform(model, pixel))
}

function boundaryShift(baseline: GroundPoint[], omitted: GroundPoint[]) {
  if (!baseline.length || baseline.length !== omitted.length) return { meanM: 0, maxM: 0 }
  const distances = baseline.map((point, index) => haversineMeters(point, omitted[index]))
  return {
    meanM: distances.reduce((sum, value) => sum + value, 0) / distances.length,
    maxM: Math.max(...distances),
  }
}

function classify(improvementM: number, improvementPercent: number) {
  if (improvementM >= MATERIAL_CHANGE_METERS && improvementPercent >= MATERIAL_CHANGE_PERCENT) {
    return { status: 'suspect' as const, reasons: [`removing this point improves independent holdout RMSE by ${improvementM.toFixed(1)}m (${improvementPercent.toFixed(0)}%)`] }
  }
  if (improvementM <= -MATERIAL_CHANGE_METERS && improvementPercent <= -MATERIAL_CHANGE_PERCENT) {
    return { status: 'supportive' as const, reasons: [`removing this point worsens independent holdout RMSE by ${Math.abs(improvementM).toFixed(1)}m (${Math.abs(improvementPercent).toFixed(0)}%)`] }
  }
  return { status: 'neutral' as const, reasons: ['removing this point does not materially change independent holdout RMSE'] }
}

export function analyzeFitPointInfluence(session: GeoreferenceSession): FitPointInfluenceResult {
  const fitControls = session.controls.filter((control) => control.role !== 'check')
  const checkControls = session.controls.filter((control) => control.role === 'check')
  const minimumFitCount = session.method === 'affine' ? 4 : 5

  if (fitControls.length < minimumFitCount) {
    return { available: false, reason: `fit-point influence requires at least ${minimumFitCount} fit points for ${session.method}` }
  }
  if (checkControls.length < 2) {
    return { available: false, reason: 'fit-point influence requires at least 2 independent check points' }
  }

  try {
    const baselineModel = fitTransform(session.method, fitControls)
    const baselineHoldout = evaluateFit(baselineModel, checkControls, session.qaThresholds)
    const baselineBoundary = boundaryPoints(session, baselineModel)

    const points: FitPointInfluenceRecord[] = fitControls.map((control, omittedIndex) => {
      const training = fitControls.filter((_, index) => index !== omittedIndex)
      const omittedModel = fitTransform(session.method, training)
      const omittedHoldout = evaluateFit(omittedModel, checkControls, session.qaThresholds)
      const omittedBoundary = boundaryPoints(session, omittedModel)
      const shift = boundaryShift(baselineBoundary, omittedBoundary)
      const improvementM = baselineHoldout.rmseM - omittedHoldout.rmseM
      const denominator = Math.max(baselineHoldout.rmseM, 1)
      const improvementPercent = improvementM / denominator * 100
      const classification = classify(improvementM, improvementPercent)
      return {
        controlId: control.id,
        ...(control.label ? { label: control.label } : {}),
        status: classification.status,
        baselineHoldoutRmseM: baselineHoldout.rmseM,
        omittedHoldoutRmseM: omittedHoldout.rmseM,
        holdoutImprovementM: improvementM,
        holdoutImprovementPercent: improvementPercent,
        boundaryMeanShiftM: shift.meanM,
        boundaryMaxShiftM: shift.maxM,
        omittedLeaveOneOut: evaluateLeaveOneOut(session.method, training, session.qaThresholds),
        reasons: classification.reasons,
      }
    })

    const suspects = points.filter((point) => point.status === 'suspect')
      .sort((a, b) => b.holdoutImprovementM - a.holdoutImprovementM)

    return {
      available: true,
      method: session.method,
      baselineCheckCount: checkControls.length,
      baselineHoldoutRmseM: baselineHoldout.rmseM,
      baselineHoldoutMaxResidualM: baselineHoldout.maxResidualM,
      points,
      ...(suspects[0] ? { topSuspectControlId: suspects[0].controlId } : {}),
      suspectCount: suspects.length,
      supportiveCount: points.filter((point) => point.status === 'supportive').length,
    }
  } catch (error) {
    return { available: false, reason: `fit-point influence failed: ${error instanceof Error ? error.message : String(error)}` }
  }
}
