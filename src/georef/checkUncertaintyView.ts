import type { CheckResidualInterpretation, UncertainCheckDiagnostic } from './checkUncertainty.ts'

export function checkInterpretationDisplay(value: CheckResidualInterpretation) {
  if (value === 'compatible') return { label: '≤2σ compatible', tone: 'pass' as const }
  if (value === 'tension') return { label: '2–3σ tension', tone: 'review' as const }
  return { label: '>3σ inconsistent', tone: 'fail' as const }
}

export function sortUncertainChecks(checks: UncertainCheckDiagnostic[]) {
  const rank: Record<CheckResidualInterpretation, number> = { inconsistent: 0, tension: 1, compatible: 2 }
  return [...checks].sort((a, b) => rank[a.interpretation] - rank[b.interpretation] || b.standardizedResidual - a.standardizedResidual)
}
