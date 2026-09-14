import type { SpatialBoundaryRouteStatus } from '../data/types.ts'

export function boundaryRouteStatusLabel(status: SpatialBoundaryRouteStatus) {
  if (status === 'gis-primary') return '优先 GIS 路线'
  if (status === 'pdf-fallback-active') return '官方地图回退已启用'
  return '已有可发布矢量'
}
