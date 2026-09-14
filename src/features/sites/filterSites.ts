import type { CaveTempleSite, SiteFilters } from '../../data/types'

const normalize = (value: string) => value
  .toLocaleLowerCase('zh-CN')
  .replace(/[\s·—–\-_,，。()（）/]/g, '')

export function matchesSearch(site: CaveTempleSite, rawQuery: string) {
  const query = normalize(rawQuery)
  if (!query) return true
  const haystack = [
    site.code,
    String(site.id),
    site.name,
    ...site.aliases,
    site.province,
    site.prefecture,
    site.county,
    site.locality ?? '',
    ...(site.subpoints ?? []).flatMap((point) => [point.name, `${site.code}${point.codeSuffix}`]),
  ].map(normalize)
  return haystack.some((value) => value.includes(query))
}

export function filterSites(sites: CaveTempleSite[], filters: SiteFilters) {
  return sites.filter((site) => {
    if (!matchesSearch(site, filters.query)) return false
    if (filters.regions.length && !filters.regions.includes(site.regionGroup)) return false
    if (filters.batches.length && !filters.batches.includes(site.heritageBatch)) return false
    if (filters.types.length && !filters.types.includes(site.siteType)) return false
    if (filters.religions.length && !filters.religions.includes(site.religion)) return false
    if (filters.verifiedOnly) {
      const hasVerifiedParent = site.coordinateConfidence === 'verified' && site.lng != null && site.lat != null
      const hasVerifiedComponent = site.subpoints?.some((point) => point.coordinateConfidence === 'verified') ?? false
      if (!hasVerifiedParent && !hasVerifiedComponent) return false
    }
    return true
  })
}
