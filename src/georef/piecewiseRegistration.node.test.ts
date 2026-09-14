import test from 'node:test'
import assert from 'node:assert/strict'
import { simulatePiecewiseRegistration } from './piecewiseRegistration.ts'
import type { GeoreferenceControlPoint, GeoreferenceSession } from './types.ts'

function groundForContinuousVertical(x: number, y: number) {
  const lng = x <= 500
    ? 110 + x * 0.00001 + y * 0.000001
    : 110 + 500 * 0.00001 + (x - 500) * 0.00002 + y * 0.000001
  const lat = 30 - y * 0.00001 + x * 0.0000005
  return { lng, lat }
}

function makeControl(id: string, x: number, y: number, role: 'fit' | 'check', ground = groundForContinuousVertical(x, y)): GeoreferenceControlPoint {
  return { id, role, pixel: { x, y }, ground }
}

function baseSession(controls: GeoreferenceControlPoint[]): GeoreferenceSession {
  return {
    schemaVersion: 1,
    id: 'piecewise-test',
    method: 'affine',
    imageWidth: 1000,
    imageHeight: 800,
    controls,
    boundaryPixels: [
      { x: 100, y: 100 }, { x: 900, y: 100 }, { x: 900, y: 700 }, { x: 100, y: 700 },
    ],
    qaThresholds: { passRmseM: 25, passMaxM: 50, reviewRmseM: 75, reviewMaxM: 150 },
    createdAt: '2026-09-13T00:00:00.000Z',
    updatedAt: '2026-09-13T00:00:00.000Z',
  }
}

function verticalControls() {
  return [
    makeControl('lf1', 100, 100, 'fit'), makeControl('lf2', 420, 120, 'fit'), makeControl('lf3', 160, 650, 'fit'), makeControl('lf4', 440, 620, 'fit'),
    makeControl('rf1', 560, 120, 'fit'), makeControl('rf2', 900, 100, 'fit'), makeControl('rf3', 580, 650, 'fit'), makeControl('rf4', 920, 620, 'fit'),
    makeControl('lc1', 260, 300, 'check'), makeControl('lc2', 360, 520, 'check'),
    makeControl('rc1', 650, 300, 'check'), makeControl('rc2', 800, 500, 'check'),
  ]
}

test('vertical 2-region candidate materially improves holdout for a continuous piecewise-affine source', () => {
  const result = simulatePiecewiseRegistration(baseSession(verticalControls()))
  assert.equal(result.available, true)
  if (!result.available) return
  const vertical = result.candidates.find((candidate) => candidate.layout === 'vertical-2')!
  assert.equal(vertical.available, true)
  if (!vertical.available) return
  assert.ok(vertical.baselineHoldoutRmseM > 20)
  assert.ok(vertical.holdoutRmseM < 3)
  assert.ok(vertical.improvementPercent > 80)
  assert.ok(vertical.seamMaxM < 3)
  assert.equal(vertical.foldOverRisk, false)
  assert.equal(vertical.recommendation, 'promising')
  assert.equal(result.bestLayout, 'vertical-2')
})

test('candidate rejects strong seam discontinuity even when each region fits internally', () => {
  const controls = verticalControls().map((control) => {
    if (control.pixel.x < 500) return control
    return { ...control, ground: { ...control.ground, lng: control.ground.lng + 0.002 } }
  })
  const result = simulatePiecewiseRegistration(baseSession(controls))
  assert.equal(result.available, true)
  if (!result.available) return
  const vertical = result.candidates.find((candidate) => candidate.layout === 'vertical-2')!
  assert.equal(vertical.available, true)
  if (!vertical.available) return
  assert.ok(vertical.seamMaxM > 100)
  assert.equal(vertical.recommendation, 'reject')
  assert.match(vertical.reasons.join(' '), /seam/i)
})

test('candidate detects local orientation flip as fold-over risk', () => {
  const controls = verticalControls().map((control) => {
    if (control.pixel.x < 500) return control
    const { x, y } = control.pixel
    return { ...control, ground: { lng: 110.02 - x * 0.00001 + y * 0.000001, lat: 30 - y * 0.00001 + x * 0.0000005 } }
  })
  const result = simulatePiecewiseRegistration(baseSession(controls))
  assert.equal(result.available, true)
  if (!result.available) return
  const vertical = result.candidates.find((candidate) => candidate.layout === 'vertical-2')!
  assert.equal(vertical.available, true)
  if (!vertical.available) return
  assert.equal(vertical.foldOverRisk, true)
  assert.equal(vertical.recommendation, 'reject')
})

test('candidate is unavailable when a segment lacks three fit points or independent checks', () => {
  const controls = verticalControls().filter((control) => !['rf3', 'rf4', 'rc2'].includes(control.id))
  const result = simulatePiecewiseRegistration(baseSession(controls))
  assert.equal(result.available, true)
  if (!result.available) return
  const vertical = result.candidates.find((candidate) => candidate.layout === 'vertical-2')!
  assert.equal(vertical.available, false)
  if (vertical.available) return
  assert.match(vertical.reason, /fit points|check/i)
})
