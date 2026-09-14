import test from 'node:test'
import assert from 'node:assert/strict'
import { buildRobustBoundaryOverlay, robustPointDisplay } from './robustOverlay.ts'
import { analyzeRobustGeoreference } from './robustRansac.ts'
import { applyTransform } from './fitTransform.ts'
import type { AffineModel, GeoreferenceSession } from './types.ts'

const truth: AffineModel = { kind: 'affine', params: [0.001, 0.00008, 103, -0.00004, 0.0011, 35] }
const session: GeoreferenceSession = {
  schemaVersion: 1,
  id: 'robust-overlay',
  method: 'affine',
  imageWidth: 1000,
  imageHeight: 1000,
  controls: [
    [0, 0], [1000, 0], [0, 1000], [1000, 1000], [500, 250], [250, 700], [200, 800], [800, 200],
  ].map(([x, y], index) => {
    const role = index < 6 ? 'fit' as const : 'check' as const
    const ground = applyTransform(truth, { x, y })
    return {
      id: role === 'fit' ? `fit-${index}` : `check-${index}`,
      role,
      pixel: { x, y },
      ground: index === 3 ? { lng: ground.lng + 0.0014, lat: ground.lat - 0.0011 } : ground,
    }
  }),
  boundaryPixels: [{ x: 100, y: 100 }, { x: 900, y: 100 }, { x: 900, y: 900 }, { x: 100, y: 900 }],
  qaThresholds: { passRmseM: 25, passMaxM: 50, reviewRmseM: 75, reviewMaxM: 150 },
  createdAt: '2026-09-13T09:10:00Z',
  updatedAt: '2026-09-13T09:10:00Z',
}

test('builds a closed GCJ-02 robust boundary overlay without mutating the active session method', () => {
  const result = analyzeRobustGeoreference(session)
  assert.equal(result.available, true)
  if (!result.available) return
  const overlay = buildRobustBoundaryOverlay(session, result)
  assert.ok(overlay)
  assert.equal(overlay?.path.length, 5)
  assert.deepEqual(overlay?.path[0], overlay?.path.at(-1))
  assert.equal(session.method, 'affine')
})

test('robust point display never maps an outlier diagnosis to an automatic delete action', () => {
  assert.deepEqual(robustPointDisplay('outlier'), { label: 'RANSAC OUTLIER · 复查', tone: 'outlier', action: 'review' })
  assert.deepEqual(robustPointDisplay('ambiguous'), { label: 'RANSAC AMBIGUOUS', tone: 'ambiguous', action: 'review' })
  assert.deepEqual(robustPointDisplay('inlier'), { label: 'RANSAC INLIER', tone: 'inlier', action: 'none' })
})
