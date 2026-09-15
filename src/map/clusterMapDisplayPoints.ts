import type { MapDisplayPoint } from './getMapDisplayPoints'

export type ClusteredMapDisplayItem =
  | { kind: 'point', point: MapDisplayPoint }
  | { kind: 'cluster', count: number, lng: number, lat: number, points: MapDisplayPoint[] }

export function clusterMapDisplayPoints(
  points: MapDisplayPoint[],
  _zoom: number,
  _selectedId?: number,
): ClusteredMapDisplayItem[] {
  return points.map((point) => ({ kind: 'point' as const, point }))
}
