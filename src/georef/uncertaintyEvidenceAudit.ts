import { resolveControlUncertainty } from './controlUncertainty.ts'
import type { GeoreferenceControlPoint } from './types.ts'

export type UncertaintyEvidenceAuditGrade = 'fallback' | 'heuristic' | 'evidence-backed' | 'reviewed'

export interface ControlUncertaintyEvidenceAudit {
  controlId: string
  role: 'fit' | 'check'
  grade: UncertaintyEvidenceAuditGrade
  hasExplicitSigma: boolean
  hasEvidenceReference: boolean
  hasCalibrationBasis: boolean
  reviewed: boolean
  evidenceRef?: string
  evidenceDate?: string
  calibrationBasis?: string
  issues: string[]
}

export interface UncertaintyEvidenceAuditSummary {
  totalControlCount: number
  fitControlCount: number
  checkControlCount: number
  fallbackCount: number
  heuristicCount: number
  evidenceBackedCount: number
  reviewedCount: number
  fitEvidenceBackedCount: number
  checkEvidenceBackedCount: number
  evidenceBackedRatio: number
  reviewedRatio: number
  weakestControlIds: string[]
}

const gradeRank: Record<UncertaintyEvidenceAuditGrade, number> = {
  fallback: 0,
  heuristic: 1,
  'evidence-backed': 2,
  reviewed: 3,
}

export function auditControlUncertaintyEvidence(control: GeoreferenceControlPoint): ControlUncertaintyEvidenceAudit {
  const uncertainty = control.uncertainty
  const resolved = resolveControlUncertainty(control)
  const evidenceRef = uncertainty?.evidenceRef?.trim()
  const hasEvidenceReference = Boolean(evidenceRef)
  const hasCalibrationBasis = Boolean(uncertainty?.calibrationBasis)
  const hasExplicitSigma = uncertainty?.pixelSigmaPx != null || uncertainty?.groundSigmaM != null
  const requestedReviewed = uncertainty?.reviewStatus === 'reviewed'
  const issues: string[] = []

  let grade: UncertaintyEvidenceAuditGrade
  if (requestedReviewed && hasEvidenceReference && hasCalibrationBasis) grade = 'reviewed'
  else if (hasEvidenceReference) grade = 'evidence-backed'
  else if (resolved.calibrationSource === 'fallback') grade = 'fallback'
  else grade = 'heuristic'

  if (!hasEvidenceReference && grade !== 'fallback') issues.push('uncertainty claim has no traceable evidence reference')
  if (hasEvidenceReference && !hasCalibrationBasis) issues.push('evidence reference exists but calibration basis is unspecified')
  if (requestedReviewed && grade !== 'reviewed') issues.push('reviewed status is incomplete without evidenceRef and calibrationBasis')
  if (hasExplicitSigma && !hasEvidenceReference) issues.push('explicit sigma is a manual/heuristic override until evidence is attached')

  return {
    controlId: control.id,
    role: control.role === 'check' ? 'check' : 'fit',
    grade,
    hasExplicitSigma,
    hasEvidenceReference,
    hasCalibrationBasis,
    reviewed: grade === 'reviewed',
    ...(evidenceRef ? { evidenceRef } : {}),
    ...(uncertainty?.evidenceDate ? { evidenceDate: uncertainty.evidenceDate } : {}),
    ...(uncertainty?.calibrationBasis ? { calibrationBasis: uncertainty.calibrationBasis } : {}),
    issues,
  }
}

export function summarizeUncertaintyEvidenceAudit(controls: GeoreferenceControlPoint[]): UncertaintyEvidenceAuditSummary {
  const audits = controls.map(auditControlUncertaintyEvidence)
  const count = (grade: UncertaintyEvidenceAuditGrade) => audits.filter((audit) => audit.grade === grade).length
  const evidenceBacked = audits.filter((audit) => gradeRank[audit.grade] >= gradeRank['evidence-backed'])
  const reviewed = audits.filter((audit) => audit.grade === 'reviewed')
  const weakestRank = audits.length ? Math.min(...audits.map((audit) => gradeRank[audit.grade])) : 0
  const weakestControlIds = audits.filter((audit) => gradeRank[audit.grade] === weakestRank).map((audit) => audit.controlId)
  return {
    totalControlCount: audits.length,
    fitControlCount: audits.filter((audit) => audit.role === 'fit').length,
    checkControlCount: audits.filter((audit) => audit.role === 'check').length,
    fallbackCount: count('fallback'),
    heuristicCount: count('heuristic'),
    evidenceBackedCount: evidenceBacked.length,
    reviewedCount: reviewed.length,
    fitEvidenceBackedCount: evidenceBacked.filter((audit) => audit.role === 'fit').length,
    checkEvidenceBackedCount: evidenceBacked.filter((audit) => audit.role === 'check').length,
    evidenceBackedRatio: audits.length ? evidenceBacked.length / audits.length : 0,
    reviewedRatio: audits.length ? reviewed.length / audits.length : 0,
    weakestControlIds,
  }
}
