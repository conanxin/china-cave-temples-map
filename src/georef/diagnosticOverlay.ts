import { wgs84ToGcj02 } from '../geo/wgs84ToGcj02.ts'
import type { GeoreferenceMethod, GeoreferenceQaThresholds, GroundPoint } from './types.ts'
import type { ModelComparisonResult } from './modelComparison.ts'

export type ErrorVectorSeverity = 'pass' | 'review' | 'fail'

export interface ModelBoundaryOverlay {
  method: GeoreferenceMethod
  path: GroundPoint[]
}

export function errorVectorSeverity(residualM: number, thresholds: GeoreferenceQaThresholds): ErrorVectorSeverity {
  if (residualM <= thresholds.passMaxM) return 'pass'
  if (residualM <= thresholds.reviewMaxM) return 'review'
  return 'fail'
}

function closePath(path: GroundPoint[]) {
  if (!path.length) return []
  const converted = path.map((point) => {
    const [lng, lat] = wgs84ToGcj02(point.lng, point.lat)
    return { lng, lat }
  })
  const first = converted[0]
  const last = converted.at(-1)
  if (!last || first.lng !== last.lng || first.lat !== last.lat) converted.push({ ...first })
  return converted
}

export function buildModelBoundaryOverlays(comparison: ModelComparisonResult): ModelBoundaryOverlay[] {
  if (!comparison.available) return []
  return [
    { method: 'affine' as const, path: closePath(comparison.affine.boundaryWgs84) },
    { method: 'projective' as const, path: closePath(comparison.projective.boundaryWgs84) },
  ].filter((item) => item.path.length >= 4)
}
