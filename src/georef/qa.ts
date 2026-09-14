import { applyTransform } from './fitTransform.ts'
import type {
  GeoreferenceControlPoint,
  GeoreferenceFitResult,
  GeoreferenceQaThresholds,
  GeoreferenceTransformModel,
  GroundPoint,
} from './types.ts'

export const DEFAULT_QA_THRESHOLDS: GeoreferenceQaThresholds = {
  passRmseM: 25,
  passMaxM: 50,
  reviewRmseM: 75,
  reviewMaxM: 150,
}

const EARTH_RADIUS_M = 6371008.8

export function haversineMeters(a: GroundPoint, b: GroundPoint) {
  const toRad = (value: number) => value * Math.PI / 180
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const dLat = lat2 - lat1
  const dLng = toRad(b.lng - a.lng)
  const sinLat = Math.sin(dLat / 2)
  const sinLng = Math.sin(dLng / 2)
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function evaluateFit(
  model: GeoreferenceTransformModel,
  controls: GeoreferenceControlPoint[],
  thresholds: GeoreferenceQaThresholds = DEFAULT_QA_THRESHOLDS,
): GeoreferenceFitResult {
  if (!controls.length) throw new Error('QA requires at least one control point')
  const residuals = controls.map((control) => {
    const predicted = applyTransform(model, control.pixel)
    return {
      controlId: control.id,
      predicted,
      deltaLng: predicted.lng - control.ground.lng,
      deltaLat: predicted.lat - control.ground.lat,
      residualM: haversineMeters(predicted, control.ground),
    }
  })
  const sumSquares = residuals.reduce((sum, item) => sum + item.residualM ** 2, 0)
  const rmseM = Math.sqrt(sumSquares / residuals.length)
  const maxResidualM = Math.max(...residuals.map((item) => item.residualM))
  const verdict = rmseM <= thresholds.passRmseM && maxResidualM <= thresholds.passMaxM
    ? 'pass'
    : rmseM <= thresholds.reviewRmseM && maxResidualM <= thresholds.reviewMaxM
      ? 'review'
      : 'fail'

  return { model, residuals, rmseM, maxResidualM, verdict, thresholds }
}
