import { wgs84ToGcj02 } from '../geo/wgs84ToGcj02.ts'
import { applyTransform } from './fitTransform.ts'
import type { GeoreferenceSession, GeoreferenceTransformModel, GroundPoint, PixelPoint } from './types.ts'

const EARTH_RADIUS_M = 6371008.8

export interface CheckErrorVector {
  controlId: string
  label?: string
  pixel: PixelPoint
  predictedWgs84: GroundPoint
  actualWgs84: GroundPoint
  predictedGcj02: GroundPoint
  actualGcj02: GroundPoint
  eastM: number
  northM: number
  residualM: number
  bearingDeg: number
  quadrant: 'NW' | 'NE' | 'SW' | 'SE' | 'unknown'
}

export interface ErrorFieldQuadrantSummary {
  quadrant: CheckErrorVector['quadrant']
  count: number
  meanResidualM: number
}

export type ErrorFieldResult =
  | { available: false; reason: string }
  | {
      available: true
      vectors: CheckErrorVector[]
      meanResidualM: number
      maxResidualM: number
      meanEastM: number
      meanNorthM: number
      systematicMagnitudeM: number
      systematicBearingDeg: number
      directionalCoherence: number
      localRmsM: number
      pattern: 'stable' | 'global-shift' | 'local-distortion' | 'mixed'
      quadrantSummaries: ErrorFieldQuadrantSummary[]
      hotspotQuadrant?: CheckErrorVector['quadrant']
    }

function localComponentsMeters(predicted: GroundPoint, actual: GroundPoint) {
  const toRad = Math.PI / 180
  const meanLat = (predicted.lat + actual.lat) / 2 * toRad
  return {
    eastM: (actual.lng - predicted.lng) * toRad * EARTH_RADIUS_M * Math.cos(meanLat),
    northM: (actual.lat - predicted.lat) * toRad * EARTH_RADIUS_M,
  }
}

function bearingDeg(eastM: number, northM: number) {
  return (Math.atan2(eastM, northM) * 180 / Math.PI + 360) % 360
}

function quadrantFor(pixel: PixelPoint, width?: number, height?: number): CheckErrorVector['quadrant'] {
  if (!width || !height) return 'unknown'
  const east = pixel.x >= width / 2
  const south = pixel.y >= height / 2
  if (!south && !east) return 'NW'
  if (!south && east) return 'NE'
  if (south && !east) return 'SW'
  return 'SE'
}

export function analyzeCheckErrorField(session: GeoreferenceSession, model: GeoreferenceTransformModel): ErrorFieldResult {
  const checks = session.controls.filter((control) => control.role === 'check')
  if (checks.length < 2) return { available: false, reason: 'error field requires at least 2 check points' }

  const vectors: CheckErrorVector[] = checks.map((control) => {
    const predictedWgs84 = applyTransform(model, control.pixel)
    const actualWgs84 = control.ground
    const components = localComponentsMeters(predictedWgs84, actualWgs84)
    const residualM = Math.hypot(components.eastM, components.northM)
    const [predLng, predLat] = wgs84ToGcj02(predictedWgs84.lng, predictedWgs84.lat)
    const [actualLng, actualLat] = wgs84ToGcj02(actualWgs84.lng, actualWgs84.lat)
    return {
      controlId: control.id,
      ...(control.label ? { label: control.label } : {}),
      pixel: { ...control.pixel },
      predictedWgs84,
      actualWgs84: { ...actualWgs84 },
      predictedGcj02: { lng: predLng, lat: predLat },
      actualGcj02: { lng: actualLng, lat: actualLat },
      eastM: components.eastM,
      northM: components.northM,
      residualM,
      bearingDeg: bearingDeg(components.eastM, components.northM),
      quadrant: quadrantFor(control.pixel, session.imageWidth, session.imageHeight),
    }
  })

  const meanEastM = vectors.reduce((sum, vector) => sum + vector.eastM, 0) / vectors.length
  const meanNorthM = vectors.reduce((sum, vector) => sum + vector.northM, 0) / vectors.length
  const systematicMagnitudeM = Math.hypot(meanEastM, meanNorthM)
  const meanResidualM = vectors.reduce((sum, vector) => sum + vector.residualM, 0) / vectors.length
  const maxResidualM = Math.max(...vectors.map((vector) => vector.residualM))
  const directionalCoherence = meanResidualM > 1e-9 ? Math.min(1, systematicMagnitudeM / meanResidualM) : 1
  const localRmsM = Math.sqrt(vectors.reduce((sum, vector) => (
    sum + (vector.eastM - meanEastM) ** 2 + (vector.northM - meanNorthM) ** 2
  ), 0) / vectors.length)

  let pattern: Extract<ErrorFieldResult, { available: true }>['pattern'] = 'mixed'
  if (meanResidualM <= session.qaThresholds.passRmseM && maxResidualM <= session.qaThresholds.passMaxM) pattern = 'stable'
  else if (directionalCoherence >= 0.75 && systematicMagnitudeM >= 10) pattern = 'global-shift'
  else if (directionalCoherence <= 0.35 && localRmsM > Math.max(5, systematicMagnitudeM * 1.5)) pattern = 'local-distortion'

  const quadrants: CheckErrorVector['quadrant'][] = ['NW', 'NE', 'SW', 'SE', 'unknown']
  const quadrantSummaries = quadrants.flatMap((quadrant) => {
    const group = vectors.filter((vector) => vector.quadrant === quadrant)
    if (!group.length) return []
    return [{ quadrant, count: group.length, meanResidualM: group.reduce((sum, vector) => sum + vector.residualM, 0) / group.length }]
  })
  const hotspot = quadrantSummaries
    .filter((item) => item.count >= 2 && item.meanResidualM > meanResidualM * 1.35)
    .sort((a, b) => b.meanResidualM - a.meanResidualM)[0]

  return {
    available: true,
    vectors,
    meanResidualM,
    maxResidualM,
    meanEastM,
    meanNorthM,
    systematicMagnitudeM,
    systematicBearingDeg: bearingDeg(meanEastM, meanNorthM),
    directionalCoherence,
    localRmsM,
    pattern,
    quadrantSummaries,
    ...(hotspot ? { hotspotQuadrant: hotspot.quadrant } : {}),
  }
}
