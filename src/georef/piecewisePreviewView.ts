import type { GeoreferenceQaThresholds } from './types.ts'
import type { PiecewiseLayout, PiecewiseSimulationResult } from './piecewiseRegistration.ts'

export function choosePiecewisePreviewLayout(result: PiecewiseSimulationResult, requested?: PiecewiseLayout): PiecewiseLayout | undefined {
  if (!result.available) return undefined
  if (requested) {
    const candidate = result.candidates.find((item) => item.layout === requested)
    if (candidate?.available) return requested
  }
  if (result.bestLayout) {
    const candidate = result.candidates.find((item) => item.layout === result.bestLayout)
    if (candidate?.available) return result.bestLayout
  }
  return result.candidates.find((item) => item.available)?.layout
}

export function piecewisePreviewTone(
  preview: { foldOverCount: number; seamMaxM: number },
  thresholds: Pick<GeoreferenceQaThresholds, 'passMaxM' | 'reviewMaxM'>,
): 'pass' | 'review' | 'fail' {
  if (preview.foldOverCount > 0) return 'fail'
  if (preview.seamMaxM > thresholds.reviewMaxM) return 'fail'
  if (preview.seamMaxM > thresholds.passMaxM) return 'review'
  return 'pass'
}
