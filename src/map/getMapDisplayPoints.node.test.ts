import test from 'node:test'
import assert from 'node:assert/strict'
import { getMapDisplayPoints } from './getMapDisplayPoints.ts'
import type { CaveTempleSite } from '../data/types.ts'

const base: Omit<CaveTempleSite, 'id' | 'code' | 'name' | 'coordinateConfidence'> = {
  aliases: [],
  regionGroup: 'north',
  province: '测试省',
  prefecture: '测试市',
  county: '测试县',
  heritageBatch: 1,
  religion: 'buddhist',
  siteType: 'cave-temple',
  mainPeriods: [],
  siteExtent: 'single',
  amapQuery: '测试',
}

const sites: CaveTempleSite[] = [
  { ...base, id: 1, code: '01', name: '已核验', coordinateConfidence: 'verified', lng: 112.1, lat: 34.2 },
  { ...base, id: 2, code: '02', name: '待核验', coordinateConfidence: 'unresolved' },
  {
    ...base, id: 3, code: '03', name: '遗址群', coordinateConfidence: 'unresolved', siteExtent: 'group',
    subpoints: [{
      id: '03-a', name: '已核验组成点', codeSuffix: 'A', role: 'component',
      lng: 114.2, lat: 36.3, coordinateConfidence: 'verified', source: '人工核验组成点',
    }],
  },
]

const candidates = {
  1: { siteId: 1, lng: 120, lat: 40, confidence: 'probable' as const, source: '错误候选不应覆盖 verified' },
  2: { siteId: 2, lng: 113.1, lat: 35.2, confidence: 'probable' as const, source: '高德候选' },
  3: { siteId: 3, lng: 115.1, lat: 37.2, confidence: 'probable' as const, source: '遗址群候选不应覆盖组成点' },
}

test('candidate review mode is off by default', () => {
  const result = getMapDisplayPoints(sites, candidates, false)
  assert.deepEqual(result.map(({ site, point }) => [site.id, point.confidence, point.markerLabel]), [
    [1, 'verified', '01'],
    [3, 'verified', '03A'],
  ])
})

test('candidate review mode adds unresolved candidates without replacing verified coordinates', () => {
  const result = getMapDisplayPoints(sites, candidates, true)
  assert.deepEqual(result.map(({ site, point }) => [site.id, point.confidence, point.markerLabel]), [
    [1, 'verified', '01'],
    [3, 'verified', '03A'],
    [2, 'probable', '02'],
  ])
  assert.equal(result[0]?.point.lng, 112.1)
  assert.equal(result[1]?.point.lng, 114.2)
  assert.equal(result[2]?.point.lng, 113.1)
})
