import type { CaveTempleSite, SpatialExtentKind } from '../data/types.ts'

export interface SpatialExtentPolygon {
  siteId: number
  code: string
  siteName: string
  extentId: string
  label: string
  kind: SpatialExtentKind
  path: [number, number][]
}

/**
 * Returns map-safe polygon shells only from explicitly verified geometry.
 * Text-only legal descriptions are intentionally excluded so the UI never
 * turns narrative boundary evidence into a fake precise polygon.
 */
export function getSpatialExtentPolygons(sites: CaveTempleSite[]): SpatialExtentPolygon[] {
  return sites.flatMap((site) => (site.spatialExtents ?? []).flatMap((extent) => {
    if (extent.geometryStatus !== 'verified' || !extent.geometry) return []
    if (extent.geometry.type === 'Polygon') {
      const outer = extent.geometry.coordinates[0]
      if (!outer || outer.length < 4) return []
      return [{
        siteId: site.id,
        code: site.code,
        siteName: site.name,
        extentId: extent.id,
        label: extent.label,
        kind: extent.kind,
        path: outer,
      }]
    }
    return extent.geometry.coordinates.flatMap((polygon, polygonIndex) => {
      const outer = polygon[0]
      if (!outer || outer.length < 4) return []
      return [{
        siteId: site.id,
        code: site.code,
        siteName: site.name,
        extentId: `${extent.id}:${polygonIndex + 1}`,
        label: extent.label,
        kind: extent.kind,
        path: outer,
      }]
    })
  }))
}
