import { wgs84ToGcj02 } from '../geo/wgs84ToGcj02.ts'
import { applyTransform } from './fitTransform.ts'
import type { GeoreferenceSession, GroundPoint } from './types.ts'
import type { IrlsGeoreferenceResult, IrlsEstimator } from './robustIrls.ts'

export interface IrlsBoundaryOverlay {
  estimator: IrlsEstimator
  path: GroundPoint[]
}

export function buildIrlsBoundaryOverlays(
  session: GeoreferenceSession,
  result: IrlsGeoreferenceResult,
): IrlsBoundaryOverlay[] {
  if (!result.available || session.boundaryPixels.length < 3) return []
  return [result.huber, result.tukey].map((estimatorResult) => {
    const path = session.boundaryPixels.map((pixel) => {
      const point = applyTransform(estimatorResult.model, pixel)
      const [lng, lat] = wgs84ToGcj02(point.lng, point.lat)
      return { lng, lat }
    })
    const first = path[0]
    const last = path.at(-1)
    if (first && (!last || first.lng !== last.lng || first.lat !== last.lat)) path.push({ ...first })
    return { estimator: estimatorResult.estimator, path }
  })
}

export function irlsPointDisplay(weight: number) {
  if (weight < 0.35) return { label: `IRLS ${weight.toFixed(2)} · 复查`, tone: 'severe' as const, action: 'review' as const }
  if (weight < 0.8) return { label: `IRLS ${weight.toFixed(2)}`, tone: 'downweighted' as const, action: 'review' as const }
  return { label: 'IRLS FULL', tone: 'full' as const, action: 'none' as const }
}
