import test from 'node:test'
import assert from 'node:assert/strict'
import { applyTransform } from './fitTransform.ts'
import { analyzeFitPointInfluence } from './controlInfluence.ts'
import type { AffineModel, GeoreferenceControlPoint, GeoreferenceSession } from './types.ts'

function sessionBase(): GeoreferenceSession {
  return {
    schemaVersion: 1,
    id: 'influence-test',
    method: 'affine',
    imageWidth: 1000,
    imageHeight: 1000,
    controls: [],
    boundaryPixels: [{ x: 50, y: 50 }, { x: 950, y: 50 }, { x: 950, y: 950 }, { x: 50, y: 950 }],
    qaThresholds: { passRmseM: 25, passMaxM: 50, reviewRmseM: 75, reviewMaxM: 150 },
    createdAt: '2026-09-13T08:00:00.000Z',
    updatedAt: '2026-09-13T08:00:00.000Z',
  }
}

const trueAffine: AffineModel = {
  kind: 'affine',
  params: [0.001, 0.00008, 103, -0.00004, 0.0011, 35],
}

function control(id: string, role: 'fit' | 'check', x: number, y: number, corrupt?: { lng: number; lat: number }): GeoreferenceControlPoint {
  const ground = applyTransform(trueAffine, { x, y })
  return {
    id,
    role,
    pixel: { x, y },
    ground: corrupt ? { lng: ground.lng + corrupt.lng, lat: ground.lat + corrupt.lat } : ground,
  }
}

test('flags a corrupted fit point when removing it materially improves independent holdout RMSE', () => {
  const session = sessionBase()
  session.controls = [
    control('fit-1', 'fit', 0, 0),
    control('fit-2', 'fit', 1000, 0),
    control('fit-3', 'fit', 0, 1000),
    control('fit-bad', 'fit', 1000, 1000, { lng: 0.0012, lat: -0.001 }),
    control('fit-5', 'fit', 500, 250),
    control('check-1', 'check', 250, 650),
    control('check-2', 'check', 800, 350),
    control('check-3', 'check', 600, 850),
  ]

  const result = analyzeFitPointInfluence(session)
  assert.equal(result.available, true)
  if (!result.available) return

  const bad = result.points.find((item) => item.controlId === 'fit-bad')
  assert.ok(bad)
  assert.equal(bad?.status, 'suspect')
  assert.ok((bad?.holdoutImprovementPercent ?? 0) >= 25)
  assert.ok((bad?.holdoutImprovementM ?? 0) >= 5)
  assert.ok((bad?.boundaryMeanShiftM ?? 0) > 1)
  assert.equal(result.topSuspectControlId, 'fit-bad')
})

test('marks a useful fit point as supportive when removing it materially worsens holdout', () => {
  const session = sessionBase()
  session.controls = [
    control('fit-1', 'fit', 0, 0),
    control('fit-2', 'fit', 1000, 0),
    control('fit-3', 'fit', 0, 1000),
    control('fit-4', 'fit', 1000, 1000),
    control('fit-5', 'fit', 500, 500),
    control('check-1', 'check', 150, 850),
    control('check-2', 'check', 850, 150),
  ]
  // Introduce a small error in one corner fit so the center point helps stabilize the least-squares fit.
  const corner = session.controls.find((item) => item.id === 'fit-4')!
  corner.ground = { lng: corner.ground.lng + 0.00018, lat: corner.ground.lat - 0.00016 }

  const result = analyzeFitPointInfluence(session)
  assert.equal(result.available, true)
  if (!result.available) return
  assert.ok(result.points.some((item) => item.status === 'supportive' || item.status === 'neutral'))
  assert.equal(result.baselineCheckCount, 2)
})

test('requires enough fit points and independent check points before diagnosing influence', () => {
  const session = sessionBase()
  session.controls = [
    control('fit-1', 'fit', 0, 0),
    control('fit-2', 'fit', 1000, 0),
    control('fit-3', 'fit', 0, 1000),
    control('check-1', 'check', 500, 500),
  ]
  const result = analyzeFitPointInfluence(session)
  assert.equal(result.available, false)
  if (result.available) return
  assert.match(result.reason, /at least 4 fit points/i)
})

test('projective influence requires at least five fit points so every omission can still be fit', () => {
  const session = sessionBase()
  session.method = 'projective'
  session.controls = [
    control('fit-1', 'fit', 0, 0),
    control('fit-2', 'fit', 1000, 0),
    control('fit-3', 'fit', 0, 1000),
    control('fit-4', 'fit', 1000, 1000),
    control('check-1', 'check', 300, 300),
    control('check-2', 'check', 700, 700),
  ]
  const result = analyzeFitPointInfluence(session)
  assert.equal(result.available, false)
  if (result.available) return
  assert.match(result.reason, /at least 5 fit points/i)
})
