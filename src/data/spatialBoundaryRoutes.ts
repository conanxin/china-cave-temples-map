import type { SpatialBoundaryRoute } from './types.ts'

const caveComponents = [
  [5, '1442-028'],
  [6, '1442-027'],
  [8, '1442-025'],
  [27, '1442-029'],
] as const

export const spatialBoundaryRoutes: SpatialBoundaryRoute[] = caveComponents.map(([siteId, officialReference]) => ({
  id: `boundary-route-${officialReference}`,
  siteId,
  officialReference,
  primarySourceAssetId: 'unesco-sites-navigator',
  fallbackSourceAssetId: 'unesco-1442-maps-2014',
  status: 'pdf-fallback-active',
  reason: 'UNESCO Sites Navigator 已确认存在官方边界，但当前公开可验证的 Polygon / MultiPolygon REST 端点仍未解析；已发现的 UNESCO 点图层、EEA 点图层以及 WWF Natural and Mixed Polygon 服务均不适用于这四个文化石窟组成遗产。',
  observedAt: '2026-09-12',
  nextAction: `继续定位 UNESCO Document 132728 中 ${officialReference} 的官方地图页；取得页图后记录 SHA-256、页码、控制点、CRS 与配准误差。`,
}))

export function getSpatialBoundaryRouteForSite(siteId: number) {
  return spatialBoundaryRoutes.find((route) => route.siteId === siteId)
}
