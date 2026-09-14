import { describe, expect, it } from 'vitest'
import { sites } from '../../data/sites'
import { filterSites, matchesSearch } from './filterSites'
import type { SiteFilters } from '../../data/types'

const base: SiteFilters = {
  query: '', regions: [], batches: [], types: [], religions: [], verifiedOnly: false,
}

describe('site filtering', () => {
  it('searches by code, name and location', () => {
    expect(matchesSearch(sites[0], '01')).toBe(true)
    expect(matchesSearch(sites[0], '云冈')).toBe(true)
    expect(matchesSearch(sites[0], '大同')).toBe(true)
  })

  it('combines region and heritage batch filters', () => {
    const result = filterSites(sites, { ...base, regions: ['xinjiang'], batches: [1] })
    expect(result.map((site) => site.code)).toEqual(['08', '09'])
  })

  it('can find the seventh-batch Sichuan cluster', () => {
    const result = filterSites(sites, { ...base, batches: [7], regions: ['south'] })
    expect(result.some((site) => site.name === '中岩寺摩崖造像')).toBe(true)
    expect(result.every((site) => site.heritageBatch === 7)).toBe(true)
  })

  it('treats a group with a verified component point as coordinate-reviewed', () => {
    const result = filterSites(sites, { ...base, verifiedOnly: true })
    expect(result.some((site) => site.id === 32)).toBe(true)
    expect(result.some((site) => site.id === 45)).toBe(true)
  })

})
