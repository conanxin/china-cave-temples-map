import type { IrlsGeoreferenceResult, IrlsWeightStatus } from './robustIrls.ts'

export interface CombinedIrlsPointDiagnostic {
  controlId: string
  label?: string
  huberWeight: number
  tukeyWeight: number
  minWeight: number
  status: IrlsWeightStatus
  huberResidualM: number
  tukeyResidualM: number
}

function classify(weight: number): IrlsWeightStatus {
  if (weight < 0.35) return 'severe'
  if (weight < 0.8) return 'downweighted'
  return 'full'
}

export function combineIrlsPointDiagnostics(result: IrlsGeoreferenceResult): CombinedIrlsPointDiagnostic[] {
  if (!result.available) return []
  const huberById = new Map(result.huber.points.map((point) => [point.controlId, point]))
  const tukeyById = new Map(result.tukey.points.map((point) => [point.controlId, point]))
  const ids = new Set([...huberById.keys(), ...tukeyById.keys()])
  return [...ids].map((controlId) => {
    const huber = huberById.get(controlId)
    const tukey = tukeyById.get(controlId)
    const huberWeight = huber?.weight ?? 1
    const tukeyWeight = tukey?.weight ?? 1
    const minWeight = Math.min(huberWeight, tukeyWeight)
    return {
      controlId,
      ...(huber?.label ?? tukey?.label ? { label: huber?.label ?? tukey?.label } : {}),
      huberWeight,
      tukeyWeight,
      minWeight,
      status: classify(minWeight),
      huberResidualM: huber?.residualM ?? 0,
      tukeyResidualM: tukey?.residualM ?? 0,
    }
  }).sort((a, b) => a.minWeight - b.minWeight || a.controlId.localeCompare(b.controlId))
}

export function irlsCombinedDisplay(weight: number) {
  if (weight < 0.35) return { label: `IRLS ${weight.toFixed(2)} · 复查`, tone: 'severe' as const, action: 'review' as const }
  if (weight < 0.8) return { label: `IRLS ${weight.toFixed(2)}`, tone: 'downweighted' as const, action: 'review' as const }
  return { label: 'IRLS FULL', tone: 'full' as const, action: 'none' as const }
}
