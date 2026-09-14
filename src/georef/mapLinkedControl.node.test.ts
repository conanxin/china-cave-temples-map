import test from 'node:test'
import assert from 'node:assert/strict'
import { wgs84ToGcj02 } from '../geo/wgs84ToGcj02.ts'
import { createAmapLinkedControlPoint, createManualControlPoint, clearGroundProvenance } from './mapLinkedControl.ts'

test('AMap-linked control stores WGS84 ground plus original GCJ-02 provenance', () => {
  const wgs: [number, number] = [112.477482, 34.558727]
  const gcj = wgs84ToGcj02(...wgs)
  const control = createAmapLinkedControlPoint({
    id: 'cp-1',
    label: 'CP1',
    role: 'check',
    pixel: { x: 120, y: 240 },
    gcj02: { lng: gcj[0], lat: gcj[1] },
  })
  assert.equal(control.role, 'check')
  assert.equal(control.groundSource, 'amap-click')
  assert.equal(control.groundSourceCrs, 'GCJ-02')
  assert.deepEqual(control.groundSourceOriginal, { lng: gcj[0], lat: gcj[1] })
  assert.ok(Math.abs(control.ground.lng - wgs[0]) < 1e-7)
  assert.ok(Math.abs(control.ground.lat - wgs[1]) < 1e-7)
})

test('manual controls are marked manual and editing ground coordinates clears linked-map provenance', () => {
  const manual = createManualControlPoint({
    id: 'cp-2', label: 'CP2', role: 'fit', pixel: { x: 10, y: 20 }, ground: { lng: 100, lat: 30 },
  })
  assert.equal(manual.groundSource, 'manual')
  const linked = { ...manual, groundSource: 'amap-click' as const, groundSourceCrs: 'GCJ-02' as const, groundSourceOriginal: { lng: 100.01, lat: 30.01 } }
  const cleared = clearGroundProvenance(linked)
  assert.equal(cleared.groundSource, 'manual')
  assert.equal(cleared.groundSourceCrs, 'WGS84')
  assert.equal(cleared.groundSourceOriginal, undefined)
})
