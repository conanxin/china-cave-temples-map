import { describe, expect, it } from 'vitest'
import type { CaveTempleSite } from '../data/types'
import type { MapDisplayPoint } from './getMapDisplayPoints'
import { clusterMapDisplayPoints } from './clusterMapDisplayPoints'

function displayPoint(id: number, code: string, lng: number, lat: number): MapDisplayPoint {
  const site = {
    id,
    code,
    name: `遗址${code}`,
    aliases: [],
    regionGroup: 'north',
    province: '山西省',
    prefecture: '大同市',
    county: '测试区',
    heritageBatch: 1,
    religion: 'buddhist',
    siteType: 'cave-temple',
    mainPeriods: [],
    siteExtent: 'single',
    coordinateConfidence: 'verified',
    lng,
    lat,
    amapQuery: `遗址${code}`,
  } as CaveTempleSite

  return {
    site,
    point: {
      siteId: id,
      lng,
      lat,
      confidence: 'verified',
      source: 'test',
      markerLabel: code,
    },
  }
}

describe('marker clustering', () => {
  it('clusters nearby markers at national zoom while leaving distant markers separate', () => {
    const points = [
      displayPoint(1, '01', 112.8, 34.7),
      displayPoint(2, '02', 113.1, 34.9),
      displayPoint(3, '03', 87.6, 43.8),
    ]

    const items = clusterMapDisplayPoints(points, 4.1)

    expect(items).toHaveLength(2)
    const cluster = items.find((item) => item.kind === 'cluster')
    expect(cluster).toMatchObject({ kind: 'cluster', count: 2 })
    expect(cluster && cluster.kind === 'cluster' ? cluster.points.map(({ site }) => site.id).sort() : []).toEqual([1, 2])
    expect(items.some((item) => item.kind === 'point' && item.point.site.id === 3)).toBe(true)
  })

  it('never hides the selected site inside a cluster', () => {
    const points = [
      displayPoint(1, '01', 112.8, 34.7),
      displayPoint(2, '02', 113.1, 34.9),
      displayPoint(3, '03', 113.2, 35.0),
    ]

    const items = clusterMapDisplayPoints(points, 4.1, 1)

    expect(items.some((item) => item.kind === 'point' && item.point.site.id === 1)).toBe(true)
    const cluster = items.find((item) => item.kind === 'cluster')
    expect(cluster).toMatchObject({ kind: 'cluster', count: 2 })
    expect(cluster && cluster.kind === 'cluster' ? cluster.points.map(({ site }) => site.id).sort() : []).toEqual([2, 3])
  })

  it('fully expands markers at detailed zoom', () => {
    const points = [
      displayPoint(1, '01', 112.8, 34.7),
      displayPoint(2, '02', 113.1, 34.9),
    ]

    const items = clusterMapDisplayPoints(points, 7)

    expect(items).toHaveLength(2)
    expect(items.every((item) => item.kind === 'point')).toBe(true)
  })
})
