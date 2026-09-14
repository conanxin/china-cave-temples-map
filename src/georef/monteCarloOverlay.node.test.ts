import test from 'node:test'
import assert from 'node:assert/strict'
import { buildMonteCarloBoundaryOverlay } from './monteCarloOverlay.ts'
import type { MonteCarloUncertaintyResult } from './monteCarloUncertainty.ts'

const result: MonteCarloUncertaintyResult = {
  available: true,
  trials: 200,
  successfulTrials: 200,
  seed: 27,
  pixelSigmaPx: 1.5,
  groundSigmaM: 10,
  models: [],
  winnerModelId: 'affine',
  winnerRate: 0.8,
  recommendation: 'global-stable',
  reasons: [],
  boundary: {
    vertices: [
      { vertexIndex: 0, baseline: { lng: 116.39, lat: 39.9 }, p50M: 5, p95M: 12, maxM: 20 },
      { vertexIndex: 1, baseline: { lng: 116.40, lat: 39.9 }, p50M: 8, p95M: 30, maxM: 46 },
      { vertexIndex: 2, baseline: { lng: 116.40, lat: 39.91 }, p50M: 6, p95M: 18, maxM: 28 },
    ],
    segments: [
      { startVertexIndex: 0, endVertexIndex: 1, p95M: 21, maxM: 46 },
      { startVertexIndex: 1, endVertexIndex: 2, p95M: 24, maxM: 46 },
      { startVertexIndex: 2, endVertexIndex: 0, p95M: 15, maxM: 28 },
    ],
    meanP95M: 20,
    maxP95M: 30,
    maxObservedM: 46,
    mostUnstableSegment: { startVertexIndex: 1, endVertexIndex: 2, p95M: 24, maxM: 46 },
  },
}

test('builds GCJ-02 P95 circles and the most unstable boundary segment', () => {
  const overlay = buildMonteCarloBoundaryOverlay(result)
  assert.equal(overlay?.vertices.length, 3)
  assert.equal(overlay?.vertices[1].radiusM, 30)
  assert.equal(overlay?.unstableSegment.startVertexIndex, 1)
  assert.equal(overlay?.unstableSegment.endVertexIndex, 2)
  assert.equal(overlay?.unstableSegment.path.length, 2)
  assert.notEqual(overlay?.vertices[0].gcj02.lng, 116.39)
})

test('returns undefined when Monte Carlo has no boundary uncertainty', () => {
  const noBoundary: MonteCarloUncertaintyResult = { ...result, boundary: undefined }
  assert.equal(buildMonteCarloBoundaryOverlay(noBoundary), undefined)
})
