import type { FitPointInfluenceStatus } from './controlInfluence.ts'
import type { RobustPointStatus } from './robustRansac.ts'
import type { IrlsWeightStatus } from './robustIrls.ts'

export type ControlReviewPriority = 'high' | 'review' | 'none'

export function combineControlReviewPriority(input: {
  influence?: FitPointInfluenceStatus
  ransac?: RobustPointStatus
  irls?: IrlsWeightStatus
}) {
  const evidenceCount = Number(input.influence === 'suspect') + Number(input.ransac === 'outlier') + Number(input.irls === 'severe')
  if (evidenceCount >= 3) return { priority: 'high' as const, label: '高优先复查', evidenceCount, action: 'review' as const }
  if (evidenceCount >= 2) return { priority: 'review' as const, label: '复查', evidenceCount, action: 'review' as const }
  return { priority: 'none' as const, label: '—', evidenceCount, action: 'none' as const }
}
