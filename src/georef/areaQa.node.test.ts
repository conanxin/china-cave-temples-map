import test from 'node:test'
import assert from 'node:assert/strict'
import { compareAreaHa, geodesicPolygonAreaHa } from './areaQa.ts'

test('geodesic polygon area is reported in hectares for a small WGS84 square', () => {
  const area = geodesicPolygonAreaHa([
    { lng: 116, lat: 39 },
    { lng: 116.01, lat: 39 },
    { lng: 116.01, lat: 39.01 },
    { lng: 116, lat: 39.01 },
  ])
  assert.ok(area > 94 && area < 97, `unexpected area ${area}`)
})

test('official area comparison separates pass review and fail', () => {
  assert.equal(compareAreaHa(100, 103).verdict, 'pass')
  assert.equal(compareAreaHa(100, 112).verdict, 'review')
  assert.equal(compareAreaHa(100, 130).verdict, 'fail')
  assert.throws(() => compareAreaHa(100, 0), /official area/i)
})
