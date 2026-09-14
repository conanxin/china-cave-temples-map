import { wgs84ToGcj02 } from '../geo/wgs84ToGcj02.ts'
import type { GroundPoint } from './types.ts'
import type { SystematicStressResult, SystematicStressScenarioId } from './systematicStress.ts'

export interface SystematicStressOverlayVector {
  vertexIndex: number
  shiftM: number
  path: [GroundPoint, GroundPoint]
}

export interface SystematicStressOverlay {
  scenarioId: SystematicStressScenarioId
  scenarioLabel: string
  variantId: string
  variantLabel: string
  baselinePath: GroundPoint[]
  stressedPath: GroundPoint[]
  vectors: SystematicStressOverlayVector[]
  unstableSegment: {
    startVertexIndex: number
    endVertexIndex: number
    scoreM: number
    path: [GroundPoint, GroundPoint]
  }
}

function toGcj02(point: GroundPoint): GroundPoint {
  const [lng, lat] = wgs84ToGcj02(point.lng, point.lat)
  return { lng, lat }
}

function closePath(points: GroundPoint[]) {
  if (!points.length) return []
  return [...points, { ...points[0] }]
}

export function buildSystematicStressOverlay(
  result: SystematicStressResult,
  requestedScenarioId?: SystematicStressScenarioId,
): SystematicStressOverlay | undefined {
  if (!result.available) return undefined
  const scenario = result.scenarios.find((item) => item.id === (requestedScenarioId ?? result.dominantScenarioId))
  const variant = scenario?.worstVariant
  if (!scenario || !variant?.boundary) return undefined
  const baseline = variant.boundary.baseline.map(toGcj02)
  const stressed = variant.boundary.stressed.map(toGcj02)
  const vectors = baseline.map((point, index) => ({
    vertexIndex: index,
    shiftM: variant.boundary!.vertexShiftsM[index],
    path: [point, stressed[index]] as [GroundPoint, GroundPoint],
  }))
  const unstable = variant.boundary.mostUnstableSegment
  return {
    scenarioId: scenario.id,
    scenarioLabel: scenario.label,
    variantId: variant.id,
    variantLabel: variant.label,
    baselinePath: closePath(baseline),
    stressedPath: closePath(stressed),
    vectors,
    unstableSegment: {
      ...unstable,
      path: [stressed[unstable.startVertexIndex], stressed[unstable.endVertexIndex]],
    },
  }
}
