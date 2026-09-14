import type { EvidenceBacklogAction, EvidenceBacklogPriority } from './evidenceResearchBacklog.ts'

export function evidenceBacklogPriorityDisplay(priority: EvidenceBacklogPriority): { label: string; tone: 'pass' | 'review' | 'fail' } {
  if (priority === 'high') return { label: '高优先', tone: 'fail' }
  if (priority === 'medium') return { label: '中优先', tone: 'review' }
  return { label: '低优先', tone: 'pass' }
}

export function evidenceBacklogActionLabel(action: EvidenceBacklogAction) {
  if (action === 'calibrate-and-attach-evidence') return '校准 σ 并补原始证据'
  if (action === 'attach-evidence') return '补 evidenceRef / 来源'
  if (action === 'review-uncertainty-claim') return '人工复核 uncertainty claim'
  if (action === 'review-control-and-source') return '复核控制点与来源'
  return '核验 check 证据与对应关系'
}
