import type { CaveTempleSite, SiteSubpoint } from '../data/types.ts'

export interface VerifiedMapPoint {
  siteId: number
  lng: number
  lat: number
  confidence: 'verified'
  source: string
  markerLabel: string
  subpointId?: string
  subpointName?: string
}

export interface VerifiedDisplayPoint {
  site: CaveTempleSite
  point: VerifiedMapPoint
  subpoint?: SiteSubpoint
}

export function getVerifiedDisplayPoints(sites: CaveTempleSite[]): VerifiedDisplayPoint[] {
  return sites.flatMap((site) => {
    const result: VerifiedDisplayPoint[] = []
    if (site.coordinateConfidence === 'verified' && site.lng != null && site.lat != null) {
      result.push({
        site,
        point: {
          siteId: site.id,
          lng: site.lng,
          lat: site.lat,
          confidence: 'verified',
          source: site.coordinateSource ?? '静态人工核验',
          markerLabel: site.code,
        },
      })
    }

    for (const subpoint of site.subpoints ?? []) {
      if (subpoint.coordinateConfidence !== 'verified') continue
      result.push({
        site,
        subpoint,
        point: {
          siteId: site.id,
          lng: subpoint.lng,
          lat: subpoint.lat,
          confidence: 'verified',
          source: subpoint.source,
          markerLabel: `${site.code}${subpoint.codeSuffix}`,
          subpointId: subpoint.id,
          subpointName: subpoint.name,
        },
      })
    }
    return result
  })
}
