import test from 'node:test'
import assert from 'node:assert/strict'
import { uncertaintyEvidenceGradeDisplay } from './uncertaintyEvidenceAuditView.ts'

test('maps evidence audit grades to stable UI labels and tones', () => {
  assert.deepEqual(uncertaintyEvidenceGradeDisplay('fallback'), { label: 'Fallback', tone: 'fail' })
  assert.deepEqual(uncertaintyEvidenceGradeDisplay('heuristic'), { label: 'Heuristic', tone: 'review' })
  assert.deepEqual(uncertaintyEvidenceGradeDisplay('evidence-backed'), { label: 'Evidence-backed', tone: 'pass' })
  assert.deepEqual(uncertaintyEvidenceGradeDisplay('reviewed'), { label: 'Reviewed', tone: 'pass' })
})
