import type { CaveTempleSite } from '../data/types.ts'
import { getVerifiedDisplayPoints } from './getVerifiedDisplayPoints.ts'

export interface GroupRelationLine {
  siteId: number
  code: string
  name: string
  path: [number, number][]
}

/**
 * Returns simple relation lines joining already-verified points in the same
 * composite heritage unit. These lines express membership only; they are not
 * protection boundaries, cave extents or historical routes.
 */
export function getGroupRelationLines(sites: CaveTempleSite[]): GroupRelationLine[] {
  return sites.flatMap((site) => {
    if (site.siteExtent !== 'group') return []
    const path = getVerifiedDisplayPoints([site]).map(({ point }) => [point.lng, point.lat] as [number, number])
    if (path.length < 2) return []
    return [{ siteId: site.id, code: site.code, name: site.name, path }]
  })
}
