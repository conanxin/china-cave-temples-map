import test from 'node:test'
import assert from 'node:assert/strict'
import { assessReviewReadiness } from './reviewReadiness.ts'
import type { GeoreferenceAdvancedQaResult, GeoreferenceAreaComparison } from './types.ts'

function baseQa(): GeoreferenceAdvancedQaResult {
  return {
    fit: {
      model: { kind: 'affine', params: [1, 0, 0, 0, 1, 0] }, residuals: [], rmseM: 1, maxResidualM: 2, verdict: 'pass',
      thresholds: { passRmseM: 25, passMaxM: 50, reviewRmseM: 75, reviewMaxM: 150 }, fitControlCount: 5, checkControlCount: 2,
    },
    holdout: { count: 2, residuals: [], rmseM: 5, maxResidualM: 8, verdict: 'pass' },
    leaveOneOut: { available: true, residuals: [], rmseM: 7, maxResidualM: 10, verdict: 'pass' },
    spatialDistribution: { available: true, score: 86, xSpanRatio: .9, ySpanRatio: .85, hullAreaRatio: .6, verdict: 'good' },
  }
}

const goodArea: GeoreferenceAreaComparison = {
  computedAreaHa: 100, officialAreaHa: 103, differenceHa: 3, differencePercent: 2.91, verdict: 'pass',
}

test('strong readiness requires independent QA and official-area agreement when expected', () => {
  assert.deepEqual(assessReviewReadiness(baseQa(), { boundaryTraced: true, officialAreaExpected: true, areaComparison: goodArea }), {
    verdict: 'strong', reasons: [],
  })
})

test('missing holdout points or unavailable LOO makes readiness insufficient', () => {
  const noHoldout = baseQa(); noHoldout.holdout = undefined; noHoldout.fit.checkControlCount = 0
  assert.equal(assessReviewReadiness(noHoldout, { boundaryTraced: false, officialAreaExpected: false }).verdict, 'insufficient')
  const noLoo = baseQa(); noLoo.leaveOneOut = { available: false, reason: 'need more points' }
  assert.equal(assessReviewReadiness(noLoo, { boundaryTraced: false, officialAreaExpected: false }).verdict, 'insufficient')
})

test('bad area agreement or poor spatial distribution blocks review readiness', () => {
  const badArea = { ...goodArea, differencePercent: 30, verdict: 'fail' as const }
  assert.equal(assessReviewReadiness(baseQa(), { boundaryTraced: true, officialAreaExpected: true, areaComparison: badArea }).verdict, 'fail')
  const poor = baseQa(); poor.spatialDistribution = { available: true, score: 20, xSpanRatio: .2, ySpanRatio: .2, hullAreaRatio: .02, verdict: 'poor' }
  assert.equal(assessReviewReadiness(poor, { boundaryTraced: false, officialAreaExpected: false }).verdict, 'fail')
})
