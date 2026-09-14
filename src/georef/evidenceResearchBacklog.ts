import { combineIrlsPointDiagnostics } from './irlsView.ts'
import { auditControlUncertaintyEvidence, type UncertaintyEvidenceAuditGrade } from './uncertaintyEvidenceAudit.ts'
import type { FitPointInfluenceResult } from './controlInfluence.ts'
import type { RobustGeoreferenceResult } from './robustRansac.ts'
import type { IrlsGeoreferenceResult } from './robustIrls.ts'
import type { UncertainCheckHoldoutResult } from './checkUncertainty.ts'
import type { GeoreferenceControlPoint } from './types.ts'

export type EvidenceBacklogPriority = 'high' | 'medium' | 'low'
export type EvidenceBacklogAction =
  | 'calibrate-and-attach-evidence'
  | 'attach-evidence'
  | 'review-uncertainty-claim'
  | 'review-control-and-source'
  | 'verify-check-evidence'

export interface EvidenceResearchBacklogItem {
  controlId: string
  label?: string
  role: 'fit' | 'check'
  auditGrade: UncertaintyEvidenceAuditGrade
  score: number
  evidenceGapScore: number
  diagnosticScore: number
  priority: EvidenceBacklogPriority
  recommendedAction: EvidenceBacklogAction
  reasons: string[]
}

export interface EvidenceResearchBacklogResult {
  items: EvidenceResearchBacklogItem[]
  highCount: number
  mediumCount: number
  lowCount: number
  fitTaskCount: number
  checkTaskCount: number
  topControlIds: string[]
}

export interface EvidenceResearchBacklogContext {
  influence?: FitPointInfluenceResult
  robust?: RobustGeoreferenceResult
  irls?: IrlsGeoreferenceResult
  uncertainCheck?: UncertainCheckHoldoutResult
}

const evidenceGapByGrade: Record<UncertaintyEvidenceAuditGrade, number> = {
  fallback: 40,
  heuristic: 25,
  'evidence-backed': 10,
  reviewed: 0,
}

function priorityFor(score: number): EvidenceBacklogPriority {
  if (score >= 60) return 'high'
  if (score >= 30) return 'medium'
  return 'low'
}

export function buildEvidenceResearchBacklog(
  controls: GeoreferenceControlPoint[],
  context: EvidenceResearchBacklogContext = {},
): EvidenceResearchBacklogResult {
  const influenceById = new Map(context.influence?.available ? context.influence.points.map((item) => [item.controlId, item]) : [])
  const robustById = new Map(context.robust?.available ? context.robust.points.map((item) => [item.controlId, item]) : [])
  const irlsById = new Map(combineIrlsPointDiagnostics(context.irls ?? { available: false, reason: 'not evaluated' }).map((item) => [item.controlId, item]))
  const checkById = new Map(context.uncertainCheck?.available ? context.uncertainCheck.checks.map((item) => [item.controlId, item]) : [])

  const items: EvidenceResearchBacklogItem[] = []
  for (const control of controls) {
    const audit = auditControlUncertaintyEvidence(control)
    const influence = influenceById.get(control.id)
    const robust = robustById.get(control.id)
    const irls = irlsById.get(control.id)
    const check = checkById.get(control.id)
    const reasons: string[] = []

    let evidenceGapScore = evidenceGapByGrade[audit.grade]
    if (audit.grade === 'fallback') reasons.push('uncertainty still uses fallback calibration with no traceable evidence')
    else if (audit.grade === 'heuristic') reasons.push('uncertainty is heuristic/manual but has no traceable evidenceRef')
    else if (audit.grade === 'evidence-backed') reasons.push('traceable evidence exists but uncertainty claim is not yet reviewed')
    if (audit.issues.length) evidenceGapScore += Math.min(10, audit.issues.length * 5)

    let diagnosticScore = 0
    if (influence?.status === 'suspect') {
      diagnosticScore += 45
      reasons.push(`removing this fit point improves independent Holdout by ${influence.holdoutImprovementM.toFixed(1)}m`)
    }
    if (robust?.status === 'outlier') {
      diagnosticScore += 30
      reasons.push(`RANSAC outlier vote ${(robust.outlierVoteRate * 100).toFixed(0)}%`)
    } else if (robust?.status === 'ambiguous') {
      diagnosticScore += 10
      reasons.push(`RANSAC classification is ambiguous (${(robust.outlierVoteRate * 100).toFixed(0)}% outlier vote)`)
    }
    if (irls?.status === 'severe') {
      diagnosticScore += 30
      reasons.push(`IRLS severe downweighting (min weight ${irls.minWeight.toFixed(2)})`)
    } else if (irls?.status === 'downweighted') {
      diagnosticScore += 10
      reasons.push(`IRLS downweights this fit point (min weight ${irls.minWeight.toFixed(2)})`)
    }
    if (check?.interpretation === 'inconsistent') {
      diagnosticScore += 40 + Math.min(15, check.standardizedResidual * 2)
      reasons.push(`independent check is inconsistent at ${check.standardizedResidual.toFixed(2)}σ`)
    } else if (check?.interpretation === 'tension') {
      diagnosticScore += 20
      reasons.push(`independent check shows tension at ${check.standardizedResidual.toFixed(2)}σ`)
    }

    const score = Math.round((evidenceGapScore + diagnosticScore) * 100) / 100
    if (score <= 0) continue

    let recommendedAction: EvidenceBacklogAction
    if (check?.interpretation === 'inconsistent' || check?.interpretation === 'tension') recommendedAction = 'verify-check-evidence'
    else if (influence?.status === 'suspect' || robust?.status === 'outlier' || robust?.status === 'ambiguous' || irls?.status === 'severe' || irls?.status === 'downweighted') recommendedAction = 'review-control-and-source'
    else if (audit.grade === 'fallback') recommendedAction = 'calibrate-and-attach-evidence'
    else if (audit.grade === 'heuristic') recommendedAction = 'attach-evidence'
    else recommendedAction = 'review-uncertainty-claim'

    items.push({
      controlId: control.id,
      ...(control.label ? { label: control.label } : {}),
      role: control.role === 'check' ? 'check' : 'fit',
      auditGrade: audit.grade,
      score,
      evidenceGapScore,
      diagnosticScore,
      priority: priorityFor(score),
      recommendedAction,
      reasons,
    })
  }

  items.sort((a, b) => b.score - a.score || a.controlId.localeCompare(b.controlId))
  return {
    items,
    highCount: items.filter((item) => item.priority === 'high').length,
    mediumCount: items.filter((item) => item.priority === 'medium').length,
    lowCount: items.filter((item) => item.priority === 'low').length,
    fitTaskCount: items.filter((item) => item.role === 'fit').length,
    checkTaskCount: items.filter((item) => item.role === 'check').length,
    topControlIds: items.slice(0, 5).map((item) => item.controlId),
  }
}
