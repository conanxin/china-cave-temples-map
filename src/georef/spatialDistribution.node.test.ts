import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateSpatialDistribution } from './spatialDistribution.ts'
import type { GeoreferenceControlPoint } from './types.ts'

function cp(id: string, x: number, y: number): GeoreferenceControlPoint {
  return { id, role: 'fit', pixel: { x, y }, ground: { lng: 100 + x / 1000, lat: 30 + y / 1000 } }
}

test('controls distributed around the image score much higher than a tight cluster', () => {
  const spread = evaluateSpatialDistribution([
    cp('a', 0, 0), cp('b', 1000, 0), cp('c', 1000, 1000), cp('d', 0, 1000), cp('e', 500, 500),
  ], 1000, 1000)
  const cluster = evaluateSpatialDistribution([
    cp('a', 400, 400), cp('b', 600, 400), cp('c', 600, 600), cp('d', 400, 600), cp('e', 500, 500),
  ], 1000, 1000)

  assert.equal(spread.available, true)
  assert.equal(cluster.available, true)
  if (spread.available && cluster.available) {
    assert.ok(spread.score >= 95)
    assert.equal(spread.verdict, 'good')
    assert.ok(cluster.score < 35)
    assert.equal(cluster.verdict, 'poor')
    assert.ok(spread.hullAreaRatio > cluster.hullAreaRatio)
  }
})

test('distribution is unavailable without valid image dimensions', () => {
  const result = evaluateSpatialDistribution([cp('a', 0, 0), cp('b', 1, 0), cp('c', 0, 1)], undefined, undefined)
  assert.equal(result.available, false)
})
