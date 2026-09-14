import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCheckUncertaintyOverlay } from './checkUncertaintyOverlay.ts'
import type { GeoreferenceSession } from './types.ts'
import type { UncertainCheckHoldoutResult } from './checkUncertainty.ts'

const session: GeoreferenceSession = {
  schemaVersion: 1,
  id: 'check-overlay',
  method: 'affine',
  controls: [
    { id: 'fit', role: 'fit', pixel: { x: 0, y: 0 }, ground: { lng: 116.38, lat: 39.9 } },
    { id: 'check-a', role: 'check', pixel: { x: 100, y: 100 }, ground: { lng: 116.39, lat: 39.91 } },
    { id: 'check-b', role: 'check', pixel: { x: 200, y: 200 }, ground: { lng: 116.40, lat: 39.92 } },
  ],
  boundaryPixels: [],
  qaThresholds: { passRmseM: 25, passMaxM: 50, reviewRmseM: 75, reviewMaxM: 150 },
  createdAt: '2026-09-14T04:50:00.000Z',
  updatedAt: '2026-09-14T04:50:00.000Z',
}

const result: UncertainCheckHoldoutResult = {
  available: true,
  checkCount: 2,
  rawRmseM: 10,
  rawMaxResidualM: 12,
  normalizedRms: 1.5,
  maxStandardizedResidual: 2.2,
  compatibleCount: 1,
  tensionCount: 1,
  inconsistentCount: 0,
  overallInterpretation: 'tension',
  profiledCheckCount: 2,
  fallbackCheckCount: 0,
  effectiveSigmaRangeM: [4, 8],
  checks: [
    { controlId: 'check-a', residualM: 8, pixelSigmaPx: 1, groundSigmaM: 4, localMetersPerPixel: 1, effectiveSigmaM: 4, standardizedResidual: 2, interpretation: 'compatible', calibrationSource: 'explicit-evidence' },
    { controlId: 'check-b', residualM: 12, pixelSigmaPx: 1, groundSigmaM: 8, localMetersPerPixel: 1, effectiveSigmaM: 8, standardizedResidual: 2.2, interpretation: 'tension', calibrationSource: 'explicit-evidence' },
  ],
}

test('builds 2-sigma GCJ-02 circles for independent check evidence', () => {
  const overlay = buildCheckUncertaintyOverlay(session, result)
  assert.equal(overlay.length, 2)
  assert.equal(overlay[0].radiusM, 8)
  assert.equal(overlay[1].radiusM, 16)
  assert.notEqual(overlay[0].centerGcj02.lng, 116.39)
})

test('returns no circles when uncertain check analysis is unavailable', () => {
  assert.deepEqual(buildCheckUncertaintyOverlay(session, { available: false, reason: 'need more checks' }), [])
})
