import test from 'node:test'
import assert from 'node:assert/strict'
import { auditControlUncertaintyEvidence, summarizeUncertaintyEvidenceAudit } from './uncertaintyEvidenceAudit.ts'
import type { GeoreferenceControlPoint } from './types.ts'

const base: GeoreferenceControlPoint = {
  id: 'cp',
  role: 'fit',
  pixel: { x: 100, y: 100 },
  ground: { lng: 116.4, lat: 39.9 },
}

test('legacy or default-table uncertainty remains fallback or heuristic, never evidence-backed', () => {
  assert.equal(auditControlUncertaintyEvidence(base).grade, 'fallback')
  const evidenceOnly: GeoreferenceControlPoint = {
    ...base,
    uncertainty: { groundEvidence: 'official-survey-gis', pixelEvidence: 'exact-corner' },
  }
  const audit = auditControlUncertaintyEvidence(evidenceOnly)
  assert.equal(audit.grade, 'heuristic')
  assert.equal(audit.hasEvidenceReference, false)
})

test('explicit sigma without a traceable source is manual override but not evidence-backed', () => {
  const control: GeoreferenceControlPoint = {
    ...base,
    uncertainty: { groundSigmaM: 3, pixelSigmaPx: 0.8, note: 'manually tightened' },
  }
  const audit = auditControlUncertaintyEvidence(control)
  assert.equal(audit.grade, 'heuristic')
  assert.equal(audit.hasExplicitSigma, true)
  assert.equal(audit.hasEvidenceReference, false)
})

test('traceable evidence reference upgrades a claim to evidence-backed', () => {
  const control: GeoreferenceControlPoint = {
    ...base,
    uncertainty: {
      groundEvidence: 'official-survey-gis',
      groundSigmaM: 2,
      calibrationBasis: 'metadata',
      evidenceRef: 'https://example.org/gis-layer/123',
      evidenceDate: '2026-09-01',
      reviewStatus: 'unreviewed',
    },
  }
  const audit = auditControlUncertaintyEvidence(control)
  assert.equal(audit.grade, 'evidence-backed')
  assert.equal(audit.hasEvidenceReference, true)
  assert.equal(audit.hasCalibrationBasis, true)
})

test('only explicit reviewed status produces reviewed grade', () => {
  const control: GeoreferenceControlPoint = {
    ...base,
    uncertainty: {
      groundEvidence: 'field-gps',
      groundSigmaM: 4,
      evidenceRef: 'gps-log://2026-09-10/track-17',
      calibrationBasis: 'measured',
      reviewStatus: 'reviewed',
      reviewedAt: '2026-09-14T04:45:00Z',
    },
  }
  const audit = auditControlUncertaintyEvidence(control)
  assert.equal(audit.grade, 'reviewed')
  assert.equal(audit.reviewed, true)
})

test('summary finds weakest controls and separates fit/check audit coverage', () => {
  const controls: GeoreferenceControlPoint[] = [
    base,
    { ...base, id: 'fit-backed', uncertainty: { groundEvidence: 'official-survey-gis', evidenceRef: 'doc://gis', calibrationBasis: 'metadata' } },
    { ...base, id: 'check-reviewed', role: 'check', uncertainty: { groundEvidence: 'field-gps', evidenceRef: 'doc://gps', calibrationBasis: 'measured', reviewStatus: 'reviewed' } },
  ]
  const summary = summarizeUncertaintyEvidenceAudit(controls)
  assert.equal(summary.totalControlCount, 3)
  assert.equal(summary.evidenceBackedCount, 2)
  assert.equal(summary.reviewedCount, 1)
  assert.equal(summary.fallbackCount, 1)
  assert.deepEqual(summary.weakestControlIds, ['cp'])
  assert.equal(summary.fitEvidenceBackedCount, 1)
  assert.equal(summary.checkEvidenceBackedCount, 1)
})
