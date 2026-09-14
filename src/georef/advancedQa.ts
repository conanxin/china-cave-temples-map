import { applyTransform, fitTransform } from './fitTransform.ts'
import { evaluateFit, haversineMeters } from './qa.ts'
import { evaluateSpatialDistribution } from './spatialDistribution.ts'
import type {
  GeoreferenceAdvancedQaResult,
  GeoreferenceControlPoint,
  GeoreferenceLeaveOneOut,
  GeoreferenceQaThresholds,
  GeoreferenceResidual,
  GeoreferenceSession,
} from './types.ts'

function verdictFor(rmseM: number, maxResidualM: number, thresholds: GeoreferenceQaThresholds) {
  return rmseM <= thresholds.passRmseM && maxResidualM <= thresholds.passMaxM
    ? 'pass' as const
    : rmseM <= thresholds.reviewRmseM && maxResidualM <= thresholds.reviewMaxM
      ? 'review' as const
      : 'fail' as const
}

function summarizeResiduals(residuals: GeoreferenceResidual[], thresholds: GeoreferenceQaThresholds) {
  const sumSquares = residuals.reduce((sum, item) => sum + item.residualM ** 2, 0)
  const rmseM = Math.sqrt(sumSquares / residuals.length)
  const maxResidualM = Math.max(...residuals.map((item) => item.residualM))
  return { rmseM, maxResidualM, verdict: verdictFor(rmseM, maxResidualM, thresholds) }
}

export function evaluateLeaveOneOut(
  method: GeoreferenceSession['method'],
  controls: GeoreferenceControlPoint[],
  thresholds: GeoreferenceQaThresholds,
): GeoreferenceLeaveOneOut {
  const trainingMinimum = method === 'affine' ? 3 : 4
  if (controls.length < trainingMinimum + 1) {
    return { available: false, reason: `leave-one-out requires at least ${trainingMinimum + 1} fit points for ${method}` }
  }
  const residuals: GeoreferenceResidual[] = []
  for (let omittedIndex = 0; omittedIndex < controls.length; omittedIndex += 1) {
    const omitted = controls[omittedIndex]
    const training = controls.filter((_, index) => index !== omittedIndex)
    try {
      const model = fitTransform(method, training)
      const predicted = applyTransform(model, omitted.pixel)
      residuals.push({
        controlId: omitted.id,
        predicted,
        deltaLng: predicted.lng - omitted.ground.lng,
        deltaLat: predicted.lat - omitted.ground.lat,
        residualM: haversineMeters(predicted, omitted.ground),
      })
    } catch (error) {
      return { available: false, reason: `leave-one-out fit failed for ${omitted.id}: ${error instanceof Error ? error.message : String(error)}` }
    }
  }
  return { available: true, residuals, ...summarizeResiduals(residuals, thresholds) }
}

export function evaluateSessionQa(session: GeoreferenceSession): GeoreferenceAdvancedQaResult {
  const fitControls = session.controls.filter((item) => item.role !== 'check')
  const checkControls = session.controls.filter((item) => item.role === 'check')
  const model = fitTransform(session.method, fitControls)
  const fit = evaluateFit(model, fitControls, session.qaThresholds)
  const holdout = checkControls.length
    ? (() => {
        const evaluated = evaluateFit(model, checkControls, session.qaThresholds)
        return {
          count: checkControls.length,
          residuals: evaluated.residuals,
          rmseM: evaluated.rmseM,
          maxResidualM: evaluated.maxResidualM,
          verdict: evaluated.verdict,
        }
      })()
    : undefined
  return {
    fit: { ...fit, fitControlCount: fitControls.length, checkControlCount: checkControls.length },
    holdout,
    leaveOneOut: evaluateLeaveOneOut(session.method, fitControls, session.qaThresholds),
    spatialDistribution: evaluateSpatialDistribution(fitControls, session.imageWidth, session.imageHeight),
  }
}
