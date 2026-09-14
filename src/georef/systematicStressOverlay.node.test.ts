import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSystematicStressOverlay } from './systematicStressOverlay.ts'
import type { SystematicStressResult } from './systematicStress.ts'

const boundary = {
  baseline: [
    { lng: 116.39, lat: 39.90 },
    { lng: 116.40, lat: 39.90 },
    { lng: 116.40, lat: 39.91 },
  ],
  stressed: [
    { lng: 116.3901, lat: 39.9001 },
    { lng: 116.4002, lat: 39.9001 },
    { lng: 116.4001, lat: 39.9102 },
  ],
  vertexShiftsM: [14, 22, 25],
  meanShiftM: 20.3,
  maxShiftM: 25,
  mostUnstableSegment: { startVertexIndex: 1, endVertexIndex: 2, scoreM: 23.5 },
}

const result: SystematicStressResult = {
  available: true,
  baselineWinnerModelId: 'affine',
  baselineActiveHoldoutRmseM: 8,
  dominantScenarioId: 'regional-ground-bias',
  maxHoldoutIncreaseM: 18,
  maxBoundaryShiftM: 25,
  modelFlipCount: 1,
  recommendation: 'model-sensitive',
  reasons: [],
  options: { rotationDeg: 0.25, anisotropicScaleFraction: 0.0035, commonGroundShiftM: 10, regionalGroundBiasM: 15, pixelWaveAmplitudePx: 2 },
  scenarios: [
    {
      id: 'pixel-rotation', label: 'rotation', maxHoldoutRmseM: 9, maxHoldoutIncreaseM: 1, maxBoundaryShiftM: 3, modelFlipCount: 0,
      variants: [{ id: 'rot+', label: '+', modelWinnerId: 'affine', modelWinnerChanged: false, activeHoldoutRmseM: 9, holdoutIncreaseM: 1 }],
      worstVariant: { id: 'rot+', label: '+', modelWinnerId: 'affine', modelWinnerChanged: false, activeHoldoutRmseM: 9, holdoutIncreaseM: 1 },
    },
    {
      id: 'regional-ground-bias', label: 'regional', maxHoldoutRmseM: 26, maxHoldoutIncreaseM: 18, maxBoundaryShiftM: 25, modelFlipCount: 1,
      variants: [{ id: 'west+', label: 'west+', modelWinnerId: 'projective', modelWinnerChanged: true, activeHoldoutRmseM: 26, holdoutIncreaseM: 18, boundary }],
      worstVariant: { id: 'west+', label: 'west+', modelWinnerId: 'projective', modelWinnerChanged: true, activeHoldoutRmseM: 26, holdoutIncreaseM: 18, boundary },
    },
  ],
}

test('builds GCJ-02 baseline/stressed paths, vertex vectors and unstable segment', () => {
  const overlay = buildSystematicStressOverlay(result)
  assert.equal(overlay?.scenarioId, 'regional-ground-bias')
  assert.equal(overlay?.variantId, 'west+')
  assert.equal(overlay?.baselinePath.length, 4)
  assert.equal(overlay?.stressedPath.length, 4)
  assert.equal(overlay?.vectors.length, 3)
  assert.equal(overlay?.unstableSegment.startVertexIndex, 1)
  assert.equal(overlay?.unstableSegment.endVertexIndex, 2)
  assert.notEqual(overlay?.baselinePath[0].lng, 116.39)
})

test('can preview a requested scenario instead of the dominant scenario', () => {
  const noBoundary = buildSystematicStressOverlay(result, 'pixel-rotation')
  assert.equal(noBoundary, undefined)
})

test('returns undefined when stress analysis is unavailable', () => {
  assert.equal(buildSystematicStressOverlay({ available: false, reason: 'missing checks' }), undefined)
})
