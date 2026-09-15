import type { MapDisplayPoint } from './getMapDisplayPoints'

export type ClusteredMapDisplayItem =
  | { kind: 'point', point: MapDisplayPoint }
  | { kind: 'cluster', count: number, lng: number, lat: number, points: MapDisplayPoint[] }

const DETAIL_ZOOM = 7
const TILE_SIZE = 256

export function clusterMapDisplayPoints(
  points: MapDisplayPoint[],
  zoom: number,
  selectedId?: number,
): ClusteredMapDisplayItem[] {
  if (zoom >= DETAIL_ZOOM) return points.map((point) => ({ kind: 'point', point }))

  const selected = points.filter(({ site }) => site.id === selectedId)
  const candidates = points
    .filter(({ site }) => site.id !== selectedId)
    .slice()
    .sort(compareDisplayPoints)

  const radius = clusterRadiusPx(zoom)
  const groups: ProjectedGroup[] = []

  for (const point of candidates) {
    const projected = project(point.point.lng, point.point.lat, zoom)
    let target: ProjectedGroup | undefined
    let bestDistance = Number.POSITIVE_INFINITY

    for (const group of groups) {
      const distance = Math.hypot(projected.x - group.x, projected.y - group.y)
      if (distance <= radius && distance < bestDistance) {
        target = group
        bestDistance = distance
      }
    }

    if (!target) {
      groups.push({ points: [point], x: projected.x, y: projected.y })
      continue
    }

    target.points.push(point)
    const count = target.points.length
    target.x += (projected.x - target.x) / count
    target.y += (projected.y - target.y) / count
  }

  const clustered = groups.map<ClusteredMapDisplayItem>((group) => {
    if (group.points.length === 1) return { kind: 'point', point: group.points[0] }
    const center = averageCoordinates(group.points)
    return {
      kind: 'cluster',
      count: group.points.length,
      lng: center.lng,
      lat: center.lat,
      points: group.points,
    }
  })

  return [
    ...selected.map((point) => ({ kind: 'point' as const, point })),
    ...clustered,
  ]
}

interface ProjectedGroup {
  points: MapDisplayPoint[]
  x: number
  y: number
}

function clusterRadiusPx(zoom: number) {
  if (zoom < 5) return 54
  if (zoom < 6) return 46
  return 38
}

function project(lng: number, lat: number, zoom: number) {
  const worldSize = TILE_SIZE * 2 ** zoom
  const clippedLat = Math.max(-85.05112878, Math.min(85.05112878, lat))
  const sin = Math.sin((clippedLat * Math.PI) / 180)
  return {
    x: ((lng + 180) / 360) * worldSize,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * worldSize,
  }
}

function averageCoordinates(points: MapDisplayPoint[]) {
  const total = points.reduce((acc, { point }) => ({
    lng: acc.lng + point.lng,
    lat: acc.lat + point.lat,
  }), { lng: 0, lat: 0 })
  return { lng: total.lng / points.length, lat: total.lat / points.length }
}

function compareDisplayPoints(a: MapDisplayPoint, b: MapDisplayPoint) {
  return a.site.id - b.site.id || a.point.markerLabel.localeCompare(b.point.markerLabel)
}
