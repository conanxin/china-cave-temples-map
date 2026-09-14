import test from 'node:test'
import assert from 'node:assert/strict'
import { influenceTone, sortInfluenceRecords } from './controlInfluenceView.ts'
import type { FitPointInfluenceRecord } from './controlInfluence.ts'

function record(id: string, status: FitPointInfluenceRecord['status'], improvement: number): FitPointInfluenceRecord {
  return {
    controlId: id,
    status,
    baselineHoldoutRmseM: 50,
    omittedHoldoutRmseM: 50 - improvement,
    holdoutImprovementM: improvement,
    holdoutImprovementPercent: improvement / 50 * 100,
    boundaryMeanShiftM: Math.abs(improvement),
    boundaryMaxShiftM: Math.abs(improvement) * 2,
    omittedLeaveOneOut: { available: false, reason: 'test' },
    reasons: [],
  }
}

test('influence view sorts suspect first, then supportive, then neutral', () => {
  const sorted = sortInfluenceRecords([
    record('neutral', 'neutral', 0),
    record('supportive', 'supportive', -20),
    record('suspect-low', 'suspect', 15),
    record('suspect-high', 'suspect', 30),
  ])
  assert.deepEqual(sorted.map((item) => item.controlId), ['suspect-high', 'suspect-low', 'supportive', 'neutral'])
})

test('influence tones stay diagnostic rather than implying automatic deletion', () => {
  assert.deepEqual(influenceTone('suspect'), { tone: 'fail', label: 'SUSPECT · 复查' })
  assert.deepEqual(influenceTone('supportive'), { tone: 'pass', label: 'SUPPORTIVE' })
  assert.deepEqual(influenceTone('neutral'), { tone: 'idle', label: 'NEUTRAL' })
})
