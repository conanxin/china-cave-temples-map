import test from 'node:test'
import assert from 'node:assert/strict'
import { wgs84ToGcj02 } from './wgs84ToGcj02.ts'

test('converts a documented mainland WGS84 coordinate to GCJ-02 reproducibly', () => {
  const [lng, lat] = wgs84ToGcj02(82.9028438888889, 41.798406111111106)
  assert.ok(Math.abs(lng - 82.9055641901) < 1e-9)
  assert.ok(Math.abs(lat - 41.7995065629) < 1e-9)
})
