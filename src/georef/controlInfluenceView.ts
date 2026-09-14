import type { FitPointInfluenceRecord, FitPointInfluenceStatus } from './controlInfluence.ts'

const priority: Record<FitPointInfluenceStatus, number> = {
  suspect: 0,
  supportive: 1,
  neutral: 2,
}

export function sortInfluenceRecords(records: FitPointInfluenceRecord[]) {
  return [...records].sort((a, b) => {
    const byStatus = priority[a.status] - priority[b.status]
    if (byStatus !== 0) return byStatus
    if (a.status === 'suspect') return b.holdoutImprovementM - a.holdoutImprovementM
    if (a.status === 'supportive') return a.holdoutImprovementM - b.holdoutImprovementM
    return b.boundaryMaxShiftM - a.boundaryMaxShiftM
  })
}

export function influenceTone(status: FitPointInfluenceStatus) {
  if (status === 'suspect') return { tone: 'fail' as const, label: 'SUSPECT · 复查' }
  if (status === 'supportive') return { tone: 'pass' as const, label: 'SUPPORTIVE' }
  return { tone: 'idle' as const, label: 'NEUTRAL' }
}
