import test from 'node:test'
import assert from 'node:assert/strict'
import { getControlDisplayStyle, getDualMapControlMarkers, getProjectedBoundaryGcj02 } from './dualMap.ts'
import type { GeoreferenceFitResult, GeoreferenceSession } from './types.ts'

const session: GeoreferenceSession = {
  schemaVersion: 1,
  id: 'dual-map-test',
  siteId: 5,
  method: 'affine',
  controls: [
    {
      id: 'fit-amap', role: 'fit', pixel: { x: 0, y: 0 },
      ground: { lng: 112.994, lat: 34.342 },
      groundSource: 'amap-click', groundSourceCrs: 'GCJ-02',
      groundSourceOriginal: { lng: 113.000001, lat: 34.350001 },
    },
    {
      id: 'check-manual', role: 'check', pixel: { x: 100, y: 100 },
      ground: { lng: 112.995, lat: 34.343 },
      groundSource: 'manual', groundSourceCrs: 'WGS84',
    },
  ],
  boundaryPixels: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }],
  qaThresholds: { passRmseM: 10, passMaxM: 20, reviewRmseM: 30, reviewMaxM: 50 },
  createdAt: '2026-09-13T00:00:00.000Z',
  updatedAt: '2026-09-13T00:00:00.000Z',
}

const fit: GeoreferenceFitResult = {
  model: { kind: 'affine', params: [0.001, 0, 112.9, 0, 0.001, 34.2] },
  residuals: [], rmseM: 0, maxResidualM: 0, verdict: 'pass', thresholds: session.qaThresholds,
}

test('dual-map markers preserve original AMap GCJ-02 provenance and convert manual WGS84 only for display', () => {
  const markers = getDualMapControlMarkers(session)
  assert.equal(markers.length, 2)
  assert.deepEqual(markers[0]?.gcj02, { lng: 113.000001, lat: 34.350001 })
  assert.equal(markers[0]?.source, 'amap-click')
  assert.equal(markers[1]?.source, 'manual')
  assert.notDeepEqual(markers[1]?.gcj02, markers[1]?.wgs84)
})

test('projected boundary is transformed to GCJ-02 and closed', () => {
  const path = getProjectedBoundaryGcj02(session, fit)
  assert.equal(path.length, 4)
  assert.deepEqual(path[0], path.at(-1))
  assert.notEqual(path[0]?.lng, 112.9)
})

test('fit/check and selected state have distinct display classes', () => {
  const fitStyle = getControlDisplayStyle('fit', false)
  const checkStyle = getControlDisplayStyle('check', false)
  const selected = getControlDisplayStyle('fit', true)
  assert.notEqual(fitStyle.cssClass, checkStyle.cssClass)
  assert.match(selected.cssClass, /selected/)
  assert.equal(fitStyle.label, '拟合')
  assert.equal(checkStyle.label, '检查')
})
