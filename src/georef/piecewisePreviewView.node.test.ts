import test from 'node:test'
import assert from 'node:assert/strict'
import { choosePiecewisePreviewLayout, piecewisePreviewTone } from './piecewisePreviewView.ts'
import type { PiecewiseSimulationResult } from './piecewiseRegistration.ts'

const simulation: PiecewiseSimulationResult = {
  available: true,
  baselineHoldoutRmseM: 80,
  bestLayout: 'vertical-2',
  recommendation: 'consider-piecewise',
  reasons: [],
  candidates: [
    { layout: 'vertical-2', available: true, regions: [], baselineHoldoutRmseM: 80, holdoutRmseM: 15, holdoutMaxResidualM: 25, holdoutVerdict: 'pass', improvementPercent: 81, seamMeanM: 8, seamMaxM: 12, seamSampleCount: 5, foldOverRisk: false, unvalidatedRegionCount: 0, recommendation: 'promising', reasons: [] },
    { layout: 'horizontal-2', available: true, regions: [], baselineHoldoutRmseM: 80, holdoutRmseM: 55, holdoutMaxResidualM: 90, holdoutVerdict: 'review', improvementPercent: 31, seamMeanM: 20, seamMaxM: 40, seamSampleCount: 5, foldOverRisk: false, unvalidatedRegionCount: 0, recommendation: 'review', reasons: [] },
    { layout: 'quadrants-4', available: false, reason: 'not enough controls' },
  ],
}

test('requested available layout wins over automatic best layout', () => {
  assert.equal(choosePiecewisePreviewLayout(simulation, 'horizontal-2'), 'horizontal-2')
})

test('unavailable request falls back to simulation best layout', () => {
  assert.equal(choosePiecewisePreviewLayout(simulation, 'quadrants-4'), 'vertical-2')
  assert.equal(choosePiecewisePreviewLayout(simulation), 'vertical-2')
})

test('preview tone prioritizes fold-over then seam severity', () => {
  assert.equal(piecewisePreviewTone({ foldOverCount: 1, seamMaxM: 5 }, { passMaxM: 50, reviewMaxM: 150 }), 'fail')
  assert.equal(piecewisePreviewTone({ foldOverCount: 0, seamMaxM: 180 }, { passMaxM: 50, reviewMaxM: 150 }), 'fail')
  assert.equal(piecewisePreviewTone({ foldOverCount: 0, seamMaxM: 90 }, { passMaxM: 50, reviewMaxM: 150 }), 'review')
  assert.equal(piecewisePreviewTone({ foldOverCount: 0, seamMaxM: 20 }, { passMaxM: 50, reviewMaxM: 150 }), 'pass')
})
