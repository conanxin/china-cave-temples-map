import test from 'node:test'
import assert from 'node:assert/strict'
import { combineControlReviewPriority } from './controlReviewPriority.ts'

test('three independent diagnostics agreeing on one fit point yields high-priority review', () => {
  assert.deepEqual(combineControlReviewPriority({ influence: 'suspect', ransac: 'outlier', irls: 'severe' }), {
    priority: 'high', label: '高优先复查', evidenceCount: 3, action: 'review',
  })
})

test('two warning signals request review but do not escalate to high priority', () => {
  assert.deepEqual(combineControlReviewPriority({ influence: 'suspect', ransac: 'inlier', irls: 'severe' }), {
    priority: 'review', label: '复查', evidenceCount: 2, action: 'review',
  })
})

test('supportive or full-weight evidence does not count as a warning signal', () => {
  assert.deepEqual(combineControlReviewPriority({ influence: 'supportive', ransac: 'inlier', irls: 'full' }), {
    priority: 'none', label: '—', evidenceCount: 0, action: 'none',
  })
})
