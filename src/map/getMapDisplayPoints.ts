import type { CaveTempleSite } from '../data/types.ts'
import { getVerifiedDisplayPoints } from './getVerifiedDisplayPoints.ts'

export interface CandidateMapPoint {
  siteId: number
  lng: number
  lat: number
  confidence: 'probable'
  source: string
}

export interface MapDisplayPoint {
  site: CaveTempleSite
  point: {
    siteId: number
    lng: number
    lat: number
    confidence: 'verified' | 'probable'
    source: string
    markerLabel: string
    subpointId?: string
    subpointName?: string
  }
}

export function getMapDisplayPoints(
  sites: CaveTempleSite[],
  candidates: Record<number, CandidateMapPoint>,
  includeCandidates: boolean,
): MapDisplayPoint[] {
  const verified = getVerifiedDisplayPoints(sites)
  if (!includeCandidates) return verified

  const verifiedIds = new Set(verified.map(({ site }) => site.id))
  const probable = sites.flatMap((site) => {
    if (verifiedIds.has(site.id)) return []
    const point = candidates[site.id]
    if (!point) return []
    return [{ site, point: { ...point, markerLabel: site.code } }]
  })

  return [...verified, ...probable]
}
