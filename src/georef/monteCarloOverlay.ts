import { wgs84ToGcj02 } from '../geo/wgs84ToGcj02.ts'
import type { MonteCarloUncertaintyResult } from './monteCarloUncertainty.ts'
import type { GroundPoint } from './types.ts'

export interface MonteCarloOverlayVertex {
  vertexIndex: number
  gcj02: GroundPoint
  radiusM: number
  p50M: number
  maxM: number
}

export interface MonteCarloOverlaySegment {
  startVertexIndex: number
  endVertexIndex: number
  p95M: number
  maxM: number
  path: [GroundPoint, GroundPoint]
}

export interface MonteCarloBoundaryOverlay {
  vertices: MonteCarloOverlayVertex[]
  unstableSegment: MonteCarloOverlaySegment
}

function toGcj02(point: GroundPoint): GroundPoint {
  const [lng, lat] = wgs84ToGcj02(point.lng, point.lat)
  return { lng, lat }
}

export function buildMonteCarloBoundaryOverlay(result: MonteCarloUncertaintyResult): MonteCarloBoundaryOverlay | undefined {
  if (!result.available || !result.boundary) return undefined
  const vertices = result.boundary.vertices.map((vertex) => ({
    vertexIndex: vertex.vertexIndex,
    gcj02: toGcj02(vertex.baseline),
    radiusM: vertex.p95M,
    p50M: vertex.p50M,
    maxM: vertex.maxM,
  }))
  const segment = result.boundary.mostUnstableSegment
  const start = vertices.find((vertex) => vertex.vertexIndex === segment.startVertexIndex)
  const end = vertices.find((vertex) => vertex.vertexIndex === segment.endVertexIndex)
  if (!start || !end) return undefined
  return {
    vertices,
    unstableSegment: {
      ...segment,
      path: [start.gcj02, end.gcj02],
    },
  }
}
