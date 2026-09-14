import { wgs84ToGcj02 } from '../geo/wgs84ToGcj02.ts'
import { applyTransform } from './fitTransform.ts'
import type { GeoreferenceSession, GroundPoint } from './types.ts'
import type { RobustGeoreferenceResult, RobustPointStatus } from './robustRansac.ts'

export interface RobustBoundaryOverlay {
  path: GroundPoint[]
}

export function buildRobustBoundaryOverlay(
  session: GeoreferenceSession,
  result: RobustGeoreferenceResult,
): RobustBoundaryOverlay | undefined {
  if (!result.available || session.boundaryPixels.length < 3) return undefined
  const path = session.boundaryPixels.map((pixel) => {
    const point = applyTransform(result.robustModel, pixel)
    const [lng, lat] = wgs84ToGcj02(point.lng, point.lat)
    return { lng, lat }
  })
  if (!path.length) return undefined
  const first = path[0]
  const last = path.at(-1)
  if (!last || first.lng !== last.lng || first.lat !== last.lat) path.push({ ...first })
  return { path }
}

export function robustPointDisplay(status: RobustPointStatus) {
  if (status === 'outlier') return { label: 'RANSAC OUTLIER · 复查', tone: 'outlier' as const, action: 'review' as const }
  if (status === 'ambiguous') return { label: 'RANSAC AMBIGUOUS', tone: 'ambiguous' as const, action: 'review' as const }
  return { label: 'RANSAC INLIER', tone: 'inlier' as const, action: 'none' as const }
}
