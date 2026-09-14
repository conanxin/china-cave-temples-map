import test from 'node:test'
import assert from 'node:assert/strict'
import { analyzeRobustGeoreference } from './robustRansac.ts'
import { applyTransform } from './fitTransform.ts'
import type { AffineModel, GeoreferenceControlPoint, GeoreferenceSession, ProjectiveModel } from './types.ts'

const thresholds = { passRmseM: 25, passMaxM: 50, reviewRmseM: 75, reviewMaxM: 150 }

function sessionBase(method: 'affine' | 'projective'): GeoreferenceSession {
  return {
    schemaVersion: 1,
    id: `ransac-${method}`,
    method,
    imageWidth: 1000,
    imageHeight: 1000,
    controls: [],
    boundaryPixels: [{ x: 50, y: 50 }, { x: 950, y: 50 }, { x: 950, y: 950 }, { x: 50, y: 950 }],
    qaThresholds: thresholds,
    createdAt: '2026-09-13T09:00:00Z',
    updatedAt: '2026-09-13T09:00:00Z',
  }
}

function makeControl(
  id: string,
  role: 'fit' | 'check',
  x: number,
  y: number,
  truth: AffineModel | ProjectiveModel,
  corrupt?: { lng: number; lat: number },
): GeoreferenceControlPoint {
  const ground = applyTransform(truth, { x, y })
  return {
    id,
    role,
    pixel: { x, y },
    ground: corrupt ? { lng: ground.lng + corrupt.lng, lat: ground.lat + corrupt.lat } : ground,
  }
}

test('RANSAC repeatedly classifies one corrupted affine fit point as an outlier and improves holdout', () => {
  const truth: AffineModel = { kind: 'affine', params: [0.001, 0.00008, 103, -0.00004, 0.0011, 35] }
  const session = sessionBase('affine')
  session.controls = [
    makeControl('fit-1', 'fit', 0, 0, truth),
    makeControl('fit-2', 'fit', 1000, 0, truth),
    makeControl('fit-3', 'fit', 0, 1000, truth),
    makeControl('fit-bad', 'fit', 1000, 1000, truth, { lng: 0.0014, lat: -0.0011 }),
    makeControl('fit-5', 'fit', 500, 250, truth),
    makeControl('fit-6', 'fit', 250, 700, truth),
    makeControl('check-1', 'check', 200, 800, truth),
    makeControl('check-2', 'check', 800, 200, truth),
    makeControl('check-3', 'check', 650, 650, truth),
  ]

  const result = analyzeRobustGeoreference(session)
  assert.equal(result.available, true)
  if (!result.available) return

  const bad = result.points.find((point) => point.controlId === 'fit-bad')
  assert.ok(bad)
  assert.equal(bad?.status, 'outlier')
  assert.ok((bad?.outlierVoteRate ?? 0) >= 0.6)
  assert.ok(result.robustHoldout.rmseM < result.baselineHoldout.rmseM * 0.5)
  assert.ok(result.boundaryDivergence.maxM > 5)
  assert.equal(result.recommendation, 'review-outliers')
  assert.ok(result.robustInlierControlIds.every((id) => id !== 'fit-bad'))
})

test('clean affine data keeps all fit points in consensus and does not invent outliers', () => {
  const truth: AffineModel = { kind: 'affine', params: [0.001, 0.00008, 103, -0.00004, 0.0011, 35] }
  const session = sessionBase('affine')
  session.controls = [
    makeControl('fit-1', 'fit', 0, 0, truth),
    makeControl('fit-2', 'fit', 1000, 0, truth),
    makeControl('fit-3', 'fit', 0, 1000, truth),
    makeControl('fit-4', 'fit', 1000, 1000, truth),
    makeControl('fit-5', 'fit', 500, 200, truth),
    makeControl('fit-6', 'fit', 250, 750, truth),
    makeControl('check-1', 'check', 200, 700, truth),
    makeControl('check-2', 'check', 800, 300, truth),
  ]

  const result = analyzeRobustGeoreference(session)
  assert.equal(result.available, true)
  if (!result.available) return
  assert.equal(result.outlierCount, 0)
  assert.ok(result.points.every((point) => point.status === 'inlier'))
  assert.ok(result.boundaryDivergence.maxM < 0.01)
  assert.ok(['agree', 'least-squares'].includes(result.recommendation))
})

test('projective RANSAC can isolate a single corrupted fit point with redundant controls', () => {
  const truth: ProjectiveModel = { kind: 'projective', params: [0.001, 0.00002, 100, -0.00001, 0.0011, 30, 0.00008, 0.00004] }
  const session = sessionBase('projective')
  session.controls = [
    makeControl('fit-1', 'fit', 0, 0, truth),
    makeControl('fit-2', 'fit', 1000, 0, truth),
    makeControl('fit-3', 'fit', 0, 1000, truth),
    makeControl('fit-4', 'fit', 1000, 1000, truth),
    makeControl('fit-bad', 'fit', 500, 180, truth, { lng: -0.0012, lat: 0.0010 }),
    makeControl('fit-6', 'fit', 220, 650, truth),
    makeControl('fit-7', 'fit', 780, 620, truth),
    makeControl('check-1', 'check', 350, 350, truth),
    makeControl('check-2', 'check', 650, 420, truth),
    makeControl('check-3', 'check', 450, 780, truth),
  ]

  const result = analyzeRobustGeoreference(session)
  assert.equal(result.available, true)
  if (!result.available) return
  const bad = result.points.find((point) => point.controlId === 'fit-bad')
  assert.equal(bad?.status, 'outlier')
  assert.ok((bad?.outlierVoteRate ?? 0) >= 0.6)
  assert.ok(result.robustHoldout.rmseM < result.baselineHoldout.rmseM)
})

test('robust diagnosis requires redundant fit points and at least two independent check points', () => {
  const truth: AffineModel = { kind: 'affine', params: [0.001, 0, 100, 0, 0.001, 30] }
  const session = sessionBase('affine')
  session.controls = [
    makeControl('fit-1', 'fit', 0, 0, truth),
    makeControl('fit-2', 'fit', 1000, 0, truth),
    makeControl('fit-3', 'fit', 0, 1000, truth),
    makeControl('fit-4', 'fit', 1000, 1000, truth),
    makeControl('check-1', 'check', 500, 500, truth),
  ]
  const result = analyzeRobustGeoreference(session)
  assert.equal(result.available, false)
  if (result.available) return
  assert.match(result.reason, /at least 5 fit points|at least 2 independent check points/i)
})
