import { wgs84ToGcj02 } from '../geo/wgs84ToGcj02.ts'
import { applyTransform } from './fitTransform.ts'
import type { GeoreferenceTransformModel, GroundPoint, PixelPoint } from './types.ts'

export type GeoJsonCoordinateSystem = 'WGS84' | 'GCJ-02'

export interface PolygonGeoJsonFeature {
  type: 'Feature'
  properties: Record<string, unknown> & { coordinateSystem: GeoJsonCoordinateSystem }
  geometry: {
    type: 'Polygon'
    coordinates: [number, number][][]
  }
}

function samePixel(a: PixelPoint, b: PixelPoint) {
  return a.x === b.x && a.y === b.y
}

function sameGround(a: GroundPoint, b: GroundPoint) {
  return a.lng === b.lng && a.lat === b.lat
}

export function transformPixelPolygon(model: GeoreferenceTransformModel, pixels: PixelPoint[]): GroundPoint[] {
  const distinct = new Set(pixels.map((point) => `${point.x},${point.y}`))
  if (distinct.size < 3) throw new Error('polygon requires at least 3 distinct pixel points')
  const source = [...pixels]
  if (source.length > 1 && samePixel(source[0], source.at(-1)!)) source.pop()
  const transformed = source.map((point) => applyTransform(model, point))
  return [...transformed, { ...transformed[0] }]
}

function closeGroundRing(points: GroundPoint[]) {
  if (points.length < 3) throw new Error('polygon requires at least 3 ground points')
  const ring = [...points]
  if (!sameGround(ring[0], ring.at(-1)!)) ring.push({ ...ring[0] })
  return ring
}

export function buildPolygonFeature(
  points: GroundPoint[],
  coordinateSystem: GeoJsonCoordinateSystem,
  properties: Record<string, unknown> = {},
): PolygonGeoJsonFeature {
  const ring = closeGroundRing(points)
  const coordinates = ring.map((point) => {
    if (coordinateSystem === 'WGS84') return [point.lng, point.lat] as [number, number]
    const [lng, lat] = wgs84ToGcj02(point.lng, point.lat)
    return [lng, lat] as [number, number]
  })
  return {
    type: 'Feature',
    properties: { ...properties, coordinateSystem },
    geometry: { type: 'Polygon', coordinates: [coordinates] },
  }
}
