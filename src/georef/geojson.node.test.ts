import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPolygonFeature, transformPixelPolygon } from './geojson.ts'
import type { AffineModel } from './types.ts'

const model: AffineModel = { kind: 'affine', params: [0.001, 0, 116, 0, 0.001, 39] }

test('pixel polygon transforms to WGS84 and closes the ring automatically', () => {
  const polygon = transformPixelPolygon(model, [
    { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 },
  ])
  assert.equal(polygon.length, 5)
  assert.deepEqual(polygon[0], polygon.at(-1))
  assert.deepEqual(polygon[1], { lng: 116.1, lat: 39 })
})

test('GeoJSON export preserves WGS84 or converts to GCJ-02 with explicit metadata', () => {
  const wgsPoints = [
    { lng: 116, lat: 39 }, { lng: 116.1, lat: 39 }, { lng: 116.1, lat: 39.1 }, { lng: 116, lat: 39.1 }, { lng: 116, lat: 39 },
  ]
  const wgs = buildPolygonFeature(wgsPoints, 'WGS84', { source: 'test' })
  assert.equal(wgs.type, 'Feature')
  assert.equal(wgs.geometry.type, 'Polygon')
  assert.deepEqual(wgs.geometry.coordinates[0][0], [116, 39])
  assert.equal(wgs.properties.coordinateSystem, 'WGS84')

  const gcj = buildPolygonFeature(wgsPoints, 'GCJ-02', { source: 'test' })
  assert.equal(gcj.properties.coordinateSystem, 'GCJ-02')
  assert.notDeepEqual(gcj.geometry.coordinates[0][0], [116, 39])
})

test('polygon transformation rejects fewer than three distinct source points', () => {
  assert.throws(() => transformPixelPolygon(model, [{ x: 0, y: 0 }, { x: 10, y: 10 }]), /at least 3/i)
})
