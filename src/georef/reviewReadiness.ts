import type { GeoreferenceAdvancedQaResult, GeoreferenceAreaComparison } from './types.ts'

export type GeoreferenceReviewReadinessVerdict = 'insufficient' | 'review' | 'fail' | 'strong'

export interface GeoreferenceReviewReadiness {
  verdict: GeoreferenceReviewReadinessVerdict
  reasons: string[]
}

interface Options {
  boundaryTraced: boolean
  officialAreaExpected: boolean
  areaComparison?: GeoreferenceAreaComparison
}

export function assessReviewReadiness(qa: GeoreferenceAdvancedQaResult, options: Options): GeoreferenceReviewReadiness {
  const reasons: string[] = []
  if (!qa.holdout || qa.holdout.count < 2) reasons.push('至少需要2个独立检查点')
  if (!qa.leaveOneOut.available) reasons.push(`LOO不可用：${qa.leaveOneOut.reason}`)
  if (!qa.spatialDistribution.available) reasons.push(`空间分布不可用：${qa.spatialDistribution.reason}`)
  if (options.boundaryTraced && options.officialAreaExpected && !options.areaComparison) reasons.push('存在官方面积，但尚未完成面积对比')
  if (reasons.length) return { verdict: 'insufficient', reasons }

  if (qa.holdout?.verdict === 'fail') reasons.push('独立检查点误差失败')
  if (qa.leaveOneOut.available && qa.leaveOneOut.verdict === 'fail') reasons.push('LOO残差失败')
  if (qa.spatialDistribution.available && qa.spatialDistribution.verdict === 'poor') reasons.push('控制点空间分布过差')
  if (options.areaComparison?.verdict === 'fail') reasons.push('边界面积与官方面积差异过大')
  if (reasons.length) return { verdict: 'fail', reasons }

  if (qa.holdout?.verdict === 'review') reasons.push('独立检查点误差需复核')
  if (qa.leaveOneOut.available && qa.leaveOneOut.verdict === 'review') reasons.push('LOO残差需复核')
  if (qa.spatialDistribution.available && qa.spatialDistribution.verdict === 'review') reasons.push('控制点空间分布一般')
  if (options.areaComparison?.verdict === 'review') reasons.push('边界面积差异需复核')
  if (reasons.length) return { verdict: 'review', reasons }

  return { verdict: 'strong', reasons: [] }
}
