import test from 'node:test'
import assert from 'node:assert/strict'
import { evidenceBacklogActionLabel, evidenceBacklogPriorityDisplay } from './evidenceResearchBacklogView.ts'

test('maps research queue priorities to stable display tones', () => {
  assert.deepEqual(evidenceBacklogPriorityDisplay('high'), { label: '高优先', tone: 'fail' })
  assert.deepEqual(evidenceBacklogPriorityDisplay('medium'), { label: '中优先', tone: 'review' })
  assert.deepEqual(evidenceBacklogPriorityDisplay('low'), { label: '低优先', tone: 'pass' })
})

test('maps backlog actions to concise Chinese research instructions', () => {
  assert.equal(evidenceBacklogActionLabel('calibrate-and-attach-evidence'), '校准 σ 并补原始证据')
  assert.equal(evidenceBacklogActionLabel('attach-evidence'), '补 evidenceRef / 来源')
  assert.equal(evidenceBacklogActionLabel('review-uncertainty-claim'), '人工复核 uncertainty claim')
  assert.equal(evidenceBacklogActionLabel('review-control-and-source'), '复核控制点与来源')
  assert.equal(evidenceBacklogActionLabel('verify-check-evidence'), '核验 check 证据与对应关系')
})
