import test from 'node:test'
import assert from 'node:assert/strict'
import { buildEvidenceResearchBacklog } from './evidenceResearchBacklog.ts'
import type { GeoreferenceControlPoint } from './types.ts'
import type { FitPointInfluenceResult } from './controlInfluence.ts'
import type { RobustGeoreferenceResult } from './robustRansac.ts'
import type { IrlsGeoreferenceResult } from './robustIrls.ts'
import type { UncertainCheckHoldoutResult } from './checkUncertainty.ts'

function control(id: string, role: 'fit' | 'check', uncertainty?: GeoreferenceControlPoint['uncertainty']): GeoreferenceControlPoint {
  return { id, role, pixel: { x: 100, y: 100 }, ground: { lng: 110, lat: 30 }, uncertainty }
}

const controls: GeoreferenceControlPoint[] = [
  control('fit-fallback-impact', 'fit'),
  control('fit-heuristic', 'fit', { groundEvidence: 'amap-poi', groundSigmaM: 10 }),
  control('check-conflict', 'check', { groundEvidence: 'osm-wikidata', groundSigmaM: 15 }),
  control('fit-backed', 'fit', { groundEvidence: 'official-survey-gis', groundSigmaM: 2, evidenceRef: 'gis://layer-1', calibrationBasis: 'metadata', reviewStatus: 'unreviewed' }),
  control('fit-reviewed', 'fit', { groundEvidence: 'official-survey-gis', groundSigmaM: 2, evidenceRef: 'gis://layer-2', calibrationBasis: 'metadata', reviewStatus: 'reviewed', reviewedAt: '2026-09-14T00:00:00Z' }),
]

const influence: FitPointInfluenceResult = {
  available: true,
  method: 'affine',
  baselineCheckCount: 2,
  baselineHoldoutRmseM: 30,
  baselineHoldoutMaxResidualM: 40,
  suspectCount: 1,
  supportiveCount: 0,
  topSuspectControlId: 'fit-fallback-impact',
  points: [{
    controlId: 'fit-fallback-impact', status: 'suspect', baselineHoldoutRmseM: 30, omittedHoldoutRmseM: 10,
    holdoutImprovementM: 20, holdoutImprovementPercent: 66, boundaryMeanShiftM: 12, boundaryMaxShiftM: 25,
    omittedLeaveOneOut: { available: false, reason: 'fixture' }, reasons: ['fixture'],
  }],
}

const robust: RobustGeoreferenceResult = { available: false, reason: 'fixture' }
const irls: IrlsGeoreferenceResult = { available: false, reason: 'fixture' }
const uncertainCheck: UncertainCheckHoldoutResult = {
  available: true,
  checkCount: 1,
  rawRmseM: 50,
  rawMaxResidualM: 50,
  normalizedRms: 4.2,
  maxStandardizedResidual: 4.2,
  compatibleCount: 0,
  tensionCount: 0,
  inconsistentCount: 1,
  overallInterpretation: 'inconsistent',
  profiledCheckCount: 1,
  fallbackCheckCount: 0,
  effectiveSigmaRangeM: [12, 12],
  checks: [{
    controlId: 'check-conflict', residualM: 50, pixelSigmaPx: 1.5, groundSigmaM: 15,
    localMetersPerPixel: 1, effectiveSigmaM: 12, standardizedResidual: 4.2,
    interpretation: 'inconsistent', calibrationSource: 'explicit-evidence',
  }],
}

test('ranks weak evidence plus model impact above ordinary heuristic gaps', () => {
  const result = buildEvidenceResearchBacklog(controls, { influence, robust, irls, uncertainCheck })
  assert.equal(result.items[0].controlId, 'fit-fallback-impact')
  assert.equal(result.items[0].priority, 'high')
  const heuristic = result.items.find((item) => item.controlId === 'fit-heuristic')!
  assert.ok(result.items[0].score > heuristic.score)
  assert.equal(heuristic.recommendedAction, 'attach-evidence')
})

test('an inconsistent independent check becomes a high-priority evidence task without becoming a fit point', () => {
  const result = buildEvidenceResearchBacklog(controls, { influence, robust, irls, uncertainCheck })
  const item = result.items.find((candidate) => candidate.controlId === 'check-conflict')!
  assert.equal(item.role, 'check')
  assert.equal(item.priority, 'high')
  assert.equal(item.recommendedAction, 'verify-check-evidence')
  assert.ok(item.reasons.some((reason) => reason.includes('4.20σ')))
})

test('evidence-backed but unreviewed claims remain a low-priority review task', () => {
  const result = buildEvidenceResearchBacklog(controls, { influence, robust, irls, uncertainCheck })
  const item = result.items.find((candidate) => candidate.controlId === 'fit-backed')!
  assert.equal(item.auditGrade, 'evidence-backed')
  assert.equal(item.priority, 'low')
  assert.equal(item.recommendedAction, 'review-uncertainty-claim')
})

test('reviewed clean controls are excluded from the backlog', () => {
  const result = buildEvidenceResearchBacklog(controls, { influence, robust, irls, uncertainCheck })
  assert.equal(result.items.some((item) => item.controlId === 'fit-reviewed'), false)
})

test('backlog ordering is deterministic', () => {
  const a = buildEvidenceResearchBacklog(controls, { influence, robust, irls, uncertainCheck })
  const b = buildEvidenceResearchBacklog(controls, { influence, robust, irls, uncertainCheck })
  assert.deepEqual(a, b)
})
