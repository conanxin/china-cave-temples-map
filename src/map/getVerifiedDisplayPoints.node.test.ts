import test from 'node:test'
import assert from 'node:assert/strict'
import { getVerifiedDisplayPoints } from './getVerifiedDisplayPoints.ts'
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

test('only verified static coordinates become publishable markers', () => {
  const sites: CaveTempleSite[] = [
    { ...base, id: 1, code: '01', name: '已核验', coordinateConfidence: 'verified', lng: 112.1, lat: 34.2 },
    { ...base, id: 2, code: '02', name: '候选', coordinateConfidence: 'probable', lng: 113.1, lat: 35.2 },
    { ...base, id: 3, code: '03', name: '未核验', coordinateConfidence: 'unresolved' },
  ]

  const result = getVerifiedDisplayPoints(sites)
  assert.deepEqual(result.map(({ site }) => site.id), [1])
  assert.equal(result[0]?.point.lng, 112.1)
  assert.equal(result[0]?.point.lat, 34.2)
})

test('verified records without both coordinates are not rendered', () => {
  const sites: CaveTempleSite[] = [
    { ...base, id: 1, code: '01', name: '缺经度', coordinateConfidence: 'verified', lat: 34.2 },
    { ...base, id: 2, code: '02', name: '缺纬度', coordinateConfidence: 'verified', lng: 112.1 },
  ]
  assert.equal(getVerifiedDisplayPoints(sites).length, 0)
})
