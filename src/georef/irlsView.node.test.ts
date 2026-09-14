import test from 'node:test'
import assert from 'node:assert/strict'
import { combineIrlsPointDiagnostics, irlsCombinedDisplay } from './irlsView.ts'
import type { IrlsGeoreferenceResult } from './robustIrls.ts'

const result: IrlsGeoreferenceResult = {
  available: true,
  method: 'affine', fitControlCount: 2, checkControlCount: 2,
  baselineHoldout: { model: { kind: 'affine', params: [1,0,0,0,1,0] }, residuals: [], rmseM: 40, maxResidualM: 50, verdict: 'review', thresholds: { passRmseM: 25, passMaxM: 50, reviewRmseM: 75, reviewMaxM: 150 } },
  huber: {
    estimator: 'huber', tuningConstant: 1.345, iterations: 4, converged: true, scaleM: 10,
    model: { kind: 'affine', params: [1,0,0,0,1,0] },
    points: [
      { controlId: 'a', weight: 0.9, status: 'full', residualM: 3 },
      { controlId: 'b', weight: 0.3, status: 'severe', residualM: 80 },
    ],
    holdout: { model: { kind: 'affine', params: [1,0,0,0,1,0] }, residuals: [], rmseM: 15, maxResidualM: 20, verdict: 'pass', thresholds: { passRmseM: 25, passMaxM: 50, reviewRmseM: 75, reviewMaxM: 150 } },
    boundaryDivergence: { meanM: 8, maxM: 12 }, downweightedCount: 1, severeCount: 1,
  },
  tukey: {
    estimator: 'tukey', tuningConstant: 4.685, iterations: 5, converged: true, scaleM: 9,
    model: { kind: 'affine', params: [1,0,0,0,1,0] },
    points: [
      { controlId: 'a', weight: 0.82, status: 'full', residualM: 3 },
      { controlId: 'b', weight: 0.05, status: 'severe', residualM: 82 },
    ],
    holdout: { model: { kind: 'affine', params: [1,0,0,0,1,0] }, residuals: [], rmseM: 10, maxResidualM: 15, verdict: 'pass', thresholds: { passRmseM: 25, passMaxM: 50, reviewRmseM: 75, reviewMaxM: 150 } },
    boundaryDivergence: { meanM: 10, maxM: 16 }, downweightedCount: 1, severeCount: 1,
  },
  recommendation: 'review-downweighted', reasons: ['review'],
}

test('combines Huber and Tukey weights by control id using the more conservative minimum weight', () => {
  const rows = combineIrlsPointDiagnostics(result)
  assert.deepEqual(rows.map((row) => [row.controlId, row.huberWeight, row.tukeyWeight, row.minWeight, row.status]), [
    ['b', 0.3, 0.05, 0.05, 'severe'],
    ['a', 0.9, 0.82, 0.82, 'full'],
  ])
})

test('combined display never says delete and escalates severe continuous downweighting to review', () => {
  assert.deepEqual(irlsCombinedDisplay(0.05), { label: 'IRLS 0.05 · 复查', tone: 'severe', action: 'review' })
  assert.deepEqual(irlsCombinedDisplay(0.55), { label: 'IRLS 0.55', tone: 'downweighted', action: 'review' })
  assert.deepEqual(irlsCombinedDisplay(0.95), { label: 'IRLS FULL', tone: 'full', action: 'none' })
})
