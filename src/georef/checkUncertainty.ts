import { resolveControlUncertainty } from './controlUncertainty.ts'
import { applyTransform } from './fitTransform.ts'
import { haversineMeters } from './qa.ts'
import type { GeoreferenceSession, GeoreferenceTransformModel } from './types.ts'

export type CheckResidualInterpretation = 'compatible' | 'tension' | 'inconsistent'

export interface UncertainCheckDiagnostic {
  controlId: string
  label?: string
  residualM: number
  pixelSigmaPx: number
  groundSigmaM: number
  localMetersPerPixel: number
  effectiveSigmaM: number
  standardizedResidual: number
  interpretation: CheckResidualInterpretation
  calibrationSource: ReturnType<typeof resolveControlUncertainty>['calibrationSource']
}

export type UncertainCheckHoldoutResult =
  | { available: false; reason: string }
  | {
      available: true
      checkCount: number
      checks: UncertainCheckDiagnostic[]
      rawRmseM: number
      rawMaxResidualM: number
      normalizedRms: number
      maxStandardizedResidual: number
      compatibleCount: number
      tensionCount: number
      inconsistentCount: number
      overallInterpretation: CheckResidualInterpretation
      profiledCheckCount: number
      fallbackCheckCount: number
      effectiveSigmaRangeM: [number, number]
    }

function localMetersPerPixel(predict: (pixel: { x: number; y: number }) => { lng: number; lat: number }, x: number, y: number) {
  const center = predict({ x, y })
  const x1 = predict({ x: x + 1, y })
  const y1 = predict({ x, y: y + 1 })
  const mx = haversineMeters(center, x1)
  const my = haversineMeters(center, y1)
  return Math.sqrt((mx * mx + my * my) / 2)
}

function interpretationFor(value: number): CheckResidualInterpretation {
  if (value <= 2) return 'compatible'
  if (value <= 3) return 'tension'
  return 'inconsistent'
}

function standardizedResidual(residualM: number, sigmaM: number) {
  if (sigmaM > 1e-9) return residualM / sigmaM
  return residualM <= 1e-9 ? 0 : Number.POSITIVE_INFINITY
}

export function analyzeUncertainCheckPredictions(
  session: GeoreferenceSession,
  predict: (pixel: { x: number; y: number }) => { lng: number; lat: number },
): UncertainCheckHoldoutResult {
  const checks = session.controls.filter((control) => control.role === 'check')
  if (checks.length < 2) return { available: false, reason: 'uncertain check holdout requires at least 2 independent check points' }

  const diagnostics = checks.map((control) => {
    const predicted = predict(control.pixel)
    const residualM = haversineMeters(predicted, control.ground)
    const resolved = resolveControlUncertainty(control)
    const metersPerPixel = localMetersPerPixel(predict, control.pixel.x, control.pixel.y)
    const pixelComponentM = resolved.pixelSigmaPx * metersPerPixel
    const effectiveSigmaM = Math.hypot(resolved.groundSigmaM, pixelComponentM)
    const z = standardizedResidual(residualM, effectiveSigmaM)
    return {
      controlId: control.id,
      ...(control.label ? { label: control.label } : {}),
      residualM,
      pixelSigmaPx: resolved.pixelSigmaPx,
      groundSigmaM: resolved.groundSigmaM,
      localMetersPerPixel: metersPerPixel,
      effectiveSigmaM,
      standardizedResidual: z,
      interpretation: interpretationFor(z),
      calibrationSource: resolved.calibrationSource,
    }
  })

  const rawRmseM = Math.sqrt(diagnostics.reduce((sum, item) => sum + item.residualM ** 2, 0) / diagnostics.length)
  const normalizedRms = Math.sqrt(diagnostics.reduce((sum, item) => sum + item.standardizedResidual ** 2, 0) / diagnostics.length)
  const maxStandardizedResidual = Math.max(...diagnostics.map((item) => item.standardizedResidual))
  const compatibleCount = diagnostics.filter((item) => item.interpretation === 'compatible').length
  const tensionCount = diagnostics.filter((item) => item.interpretation === 'tension').length
  const inconsistentCount = diagnostics.filter((item) => item.interpretation === 'inconsistent').length
  const sigmas = diagnostics.map((item) => item.effectiveSigmaM)
  const profiledCheckCount = diagnostics.filter((item) => item.calibrationSource !== 'fallback').length

  return {
    available: true,
    checkCount: diagnostics.length,
    checks: diagnostics,
    rawRmseM,
    rawMaxResidualM: Math.max(...diagnostics.map((item) => item.residualM)),
    normalizedRms,
    maxStandardizedResidual,
    compatibleCount,
    tensionCount,
    inconsistentCount,
    overallInterpretation: inconsistentCount > 0 ? 'inconsistent' : tensionCount > 0 ? 'tension' : 'compatible',
    profiledCheckCount,
    fallbackCheckCount: diagnostics.length - profiledCheckCount,
    effectiveSigmaRangeM: [Math.min(...sigmas), Math.max(...sigmas)],
  }
}

export function analyzeUncertainCheckHoldout(
  session: GeoreferenceSession,
  model: GeoreferenceTransformModel,
): UncertainCheckHoldoutResult {
  return analyzeUncertainCheckPredictions(session, (pixel) => applyTransform(model, pixel))
}
