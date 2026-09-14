import test from 'node:test'
import assert from 'node:assert/strict'
import { buildModelBoundaryOverlays, errorVectorSeverity } from './diagnosticOverlay.ts'
import { compareGeoreferenceModels } from './modelComparison.ts'
import { applyTransform } from './fitTransform.ts'
import type { GeoreferenceSession, ProjectiveModel } from './types.ts'

const thresholds = { passRmseM: 25, passMaxM: 50, reviewRmseM: 75, reviewMaxM: 150 }

test('error vectors use pass/review/fail severity from max-residual thresholds', () => {
  assert.equal(errorVectorSeverity(20, thresholds), 'pass')
  assert.equal(errorVectorSeverity(80, thresholds), 'review')
  assert.equal(errorVectorSeverity(180, thresholds), 'fail')
})

test('Affine and Projective comparison boundaries are converted to closed GCJ-02 overlays without mutating active method', () => {
  const truth: ProjectiveModel = { kind: 'projective', params: [0.001, 0.00002, 100, -0.00001, 0.0011, 30, 0.00008, 0.00004] }
  const session: GeoreferenceSession = {
    schemaVersion: 1,
    id: 'overlay',
    method: 'affine',
    imageWidth: 1000,
    imageHeight: 1000,
    controls: [
      [0, 0], [1000, 0], [0, 1000], [1000, 1000], [500, 200], [250, 700], [500, 500], [800, 300],
    ].map(([x, y], index) => ({
      id: index < 6 ? `fit-${index}` : `check-${index}`,
      role: index < 6 ? 'fit' as const : 'check' as const,
      pixel: { x, y },
      ground: applyTransform(truth, { x, y }),
    })),
    boundaryPixels: [{ x: 100, y: 100 }, { x: 900, y: 100 }, { x: 900, y: 900 }, { x: 100, y: 900 }],
    qaThresholds: thresholds,
    createdAt: '2026-09-13T07:40:00.000Z',
    updatedAt: '2026-09-13T07:40:00.000Z',
  }
  const comparison = compareGeoreferenceModels(session)
  assert.equal(comparison.available, true)
  if (!comparison.available) return
  const overlays = buildModelBoundaryOverlays(comparison)
  assert.equal(overlays.length, 2)
  assert.deepEqual(overlays.map((item) => item.method), ['affine', 'projective'])
  assert.ok(overlays.every((item) => item.path.length === 5))
  assert.ok(overlays.every((item) => item.path[0]?.lng === item.path.at(-1)?.lng && item.path[0]?.lat === item.path.at(-1)?.lat))
  assert.equal(session.method, 'affine')
})
