import test from 'node:test'
import assert from 'node:assert/strict'
import { wgs84ToGcj02 } from './wgs84ToGcj02.ts'
import { gcj02ToWgs84 } from './gcj02ToWgs84.ts'

test('GCJ-02 inverse round-trips a mainland WGS84 point within sub-meter scale', () => {
  const source: [number, number] = [112.477482, 34.558727]
  const gcj = wgs84ToGcj02(...source)
  const restored = gcj02ToWgs84(...gcj)
  assert.ok(Math.abs(restored[0] - source[0]) < 1e-7)
  assert.ok(Math.abs(restored[1] - source[1]) < 1e-7)
})

test('GCJ-02 inverse leaves coordinates outside mainland transform bounds unchanged', () => {
  assert.deepEqual(gcj02ToWgs84(-73.9857, 40.7484), [-73.9857, 40.7484])
})
