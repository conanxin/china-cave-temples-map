import type { CaveTempleSite } from '../data/types.ts'

export function getAmapPickerCenter(site: CaveTempleSite): [number, number] {
  if (site.coordinateConfidence === 'verified' && site.lng != null && site.lat != null) return [site.lng, site.lat]
  const subpoint = site.subpoints?.find((point) => point.coordinateConfidence === 'verified')
  if (subpoint) return [subpoint.lng, subpoint.lat]
  return [105.5, 35.8]
}
