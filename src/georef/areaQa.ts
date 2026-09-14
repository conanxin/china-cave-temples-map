import type { GeoreferenceAreaComparison, GroundPoint } from './types.ts'

const EARTH_RADIUS_M = 6371008.8

function toRad(value: number) { return value * Math.PI / 180 }

export function geodesicPolygonAreaHa(points: GroundPoint[]) {
  const unique = points.length > 1 && points[0].lng === points.at(-1)?.lng && points[0].lat === points.at(-1)?.lat
    ? points.slice(0, -1)
    : [...points]
  if (unique.length < 3) throw new Error('polygon area requires at least 3 points')
  let sum = 0
  for (let i = 0; i < unique.length; i += 1) {
    const a = unique[i]
    const b = unique[(i + 1) % unique.length]
    let deltaLng = toRad(b.lng - a.lng)
    if (deltaLng > Math.PI) deltaLng -= 2 * Math.PI
    if (deltaLng < -Math.PI) deltaLng += 2 * Math.PI
    sum += deltaLng * (2 + Math.sin(toRad(a.lat)) + Math.sin(toRad(b.lat)))
  }
  return Math.abs(sum) * EARTH_RADIUS_M ** 2 / 2 / 10_000
}

export function compareAreaHa(computedAreaHa: number, officialAreaHa: number): GeoreferenceAreaComparison {
  if (!Number.isFinite(computedAreaHa) || computedAreaHa <= 0) throw new Error('computed area must be positive')
  if (!Number.isFinite(officialAreaHa) || officialAreaHa <= 0) throw new Error('official area must be positive')
  const differenceHa = Math.abs(computedAreaHa - officialAreaHa)
  const differencePercent = differenceHa / officialAreaHa * 100
  const verdict = differencePercent <= 5 ? 'pass' : differencePercent <= 15 ? 'review' : 'fail'
  return { computedAreaHa, officialAreaHa, differenceHa, differencePercent, verdict }
}
