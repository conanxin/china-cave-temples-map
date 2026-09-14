import type { UncertaintyEvidenceAuditGrade } from './uncertaintyEvidenceAudit.ts'

export function uncertaintyEvidenceGradeDisplay(grade: UncertaintyEvidenceAuditGrade): { label: string; tone: 'pass' | 'review' | 'fail' } {
  if (grade === 'reviewed') return { label: 'Reviewed', tone: 'pass' }
  if (grade === 'evidence-backed') return { label: 'Evidence-backed', tone: 'pass' }
  if (grade === 'heuristic') return { label: 'Heuristic', tone: 'review' }
  return { label: 'Fallback', tone: 'fail' }
}
