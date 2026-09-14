import { applyTransform, fitTransform } from './fitTransform.ts'
import { evaluateFit, haversineMeters } from './qa.ts'
import type {
  GeoreferenceControlPoint,
  GeoreferenceSession,
  GeoreferenceTransformModel,
  GroundPoint,
} from './types.ts'

export type RobustPointStatus = 'inlier' | 'outlier' | 'ambiguous'
export type RobustRecommendation = 'agree' | 'review-outliers' | 'robust-improves' | 'least-squares' | 'insufficient'

export interface RobustPointDiagnostic {
  controlId: string
  label?: string
  status: RobustPointStatus
  outlierVoteRate: number
  robustResidualM: number
}

export interface RobustBoundaryDivergence {
  meanM: number
  maxM: number
}

export type RobustGeoreferenceResult =
  | { available: false; reason: string }
  | {
      available: true
      method: GeoreferenceSession['method']
      thresholdM: number
      trialCount: number
      validTrialCount: number
      bestInlierCount: number
      robustModel: GeoreferenceTransformModel
      robustInlierControlIds: string[]
      outlierControlIds: string[]
      outlierCount: number
      points: RobustPointDiagnostic[]
      baselineHoldout: ReturnType<typeof evaluateFit>
      robustHoldout: ReturnType<typeof evaluateFit>
      boundaryDivergence: RobustBoundaryDivergence
      recommendation: RobustRecommendation
      reasons: string[]
    }

interface Candidate {
  model: GeoreferenceTransformModel
  inlierIds: string[]
  residualById: Map<string, number>
  inlierMedianM: number
}

const MAX_TRIALS = 512
const OUTLIER_VOTE_THRESHOLD = 0.6
const INLIER_VOTE_THRESHOLD = 0.4
const MATERIAL_IMPROVEMENT_RATIO = 0.75
const MATERIAL_IMPROVEMENT_METERS = 5

function median(values: number[]) {
  if (!values.length) return Number.POSITIVE_INFINITY
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function combinations<T>(items: T[], size: number, cap = MAX_TRIALS) {
  const result: T[][] = []
  const current: T[] = []
  function visit(start: number) {
    if (result.length >= cap) return
    if (current.length === size) {
      result.push([...current])
      return
    }
    for (let index = start; index < items.length && result.length < cap; index += 1) {
      current.push(items[index])
      visit(index + 1)
      current.pop()
    }
  }
  visit(0)
  return result
}

function residualFor(model: GeoreferenceTransformModel, control: GeoreferenceControlPoint) {
  return haversineMeters(applyTransform(model, control.pixel), control.ground)
}

function buildCandidates(
  method: GeoreferenceSession['method'],
  controls: GeoreferenceControlPoint[],
  thresholdM: number,
) {
  const sampleSize = method === 'affine' ? 3 : 4
  const samples = combinations(controls, sampleSize)
  const candidates: Candidate[] = []
  for (const sample of samples) {
    try {
      const model = fitTransform(method, sample)
      const residualById = new Map(controls.map((control) => [control.id, residualFor(model, control)]))
      const inlierIds = controls.filter((control) => (residualById.get(control.id) ?? Number.POSITIVE_INFINITY) <= thresholdM).map((control) => control.id)
      if (inlierIds.length < sampleSize) continue
      const inlierMedianM = median(inlierIds.map((id) => residualById.get(id) ?? Number.POSITIVE_INFINITY))
      candidates.push({ model, inlierIds, residualById, inlierMedianM })
    } catch {
      // Singular minimal samples are expected in RANSAC; skip them.
    }
  }
  return { candidates, trialCount: samples.length }
}

function boundaryPoints(session: GeoreferenceSession, model: GeoreferenceTransformModel): GroundPoint[] {
  return session.boundaryPixels.map((pixel) => applyTransform(model, pixel))
}

function boundaryDivergence(a: GroundPoint[], b: GroundPoint[]): RobustBoundaryDivergence {
  if (!a.length || a.length !== b.length) return { meanM: 0, maxM: 0 }
  const distances = a.map((point, index) => haversineMeters(point, b[index]))
  return {
    meanM: distances.reduce((sum, value) => sum + value, 0) / distances.length,
    maxM: Math.max(...distances),
  }
}

function recommend(
  baselineRmseM: number,
  robustRmseM: number,
  outlierCount: number,
): { recommendation: RobustRecommendation; reasons: string[] } {
  const improvementM = baselineRmseM - robustRmseM
  const materiallyBetter = improvementM >= MATERIAL_IMPROVEMENT_METERS && robustRmseM <= baselineRmseM * MATERIAL_IMPROVEMENT_RATIO
  if (outlierCount > 0 && materiallyBetter) {
    return { recommendation: 'review-outliers', reasons: [`robust consensus excludes ${outlierCount} fit point(s) and improves independent holdout RMSE by ${improvementM.toFixed(1)}m`] }
  }
  if (materiallyBetter) {
    return { recommendation: 'robust-improves', reasons: [`robust fit improves independent holdout RMSE by ${improvementM.toFixed(1)}m without a stable outlier vote`] }
  }
  if (baselineRmseM + MATERIAL_IMPROVEMENT_METERS < robustRmseM) {
    return { recommendation: 'least-squares', reasons: ['least-squares performs materially better on independent check points'] }
  }
  return { recommendation: 'agree', reasons: ['least-squares and robust consensus agree within the project material-change threshold'] }
}

export function analyzeRobustGeoreference(session: GeoreferenceSession): RobustGeoreferenceResult {
  const fitControls = session.controls.filter((control) => control.role !== 'check')
  const checkControls = session.controls.filter((control) => control.role === 'check')
  const sampleSize = session.method === 'affine' ? 3 : 4
  const minimumFitCount = sampleSize + 2
  if (fitControls.length < minimumFitCount) return { available: false, reason: `robust diagnosis requires at least ${minimumFitCount} fit points for ${session.method}` }
  if (checkControls.length < 2) return { available: false, reason: 'robust diagnosis requires at least 2 independent check points' }

  const thresholdM = Math.max(10, session.qaThresholds.passMaxM)
  try {
    const baselineModel = fitTransform(session.method, fitControls)
    const baselineHoldout = evaluateFit(baselineModel, checkControls, session.qaThresholds)
    const { candidates, trialCount } = buildCandidates(session.method, fitControls, thresholdM)
    if (!candidates.length) return { available: false, reason: 'RANSAC produced no valid minimal-sample models' }

    const bestInlierCount = Math.max(...candidates.map((candidate) => candidate.inlierIds.length))
    const elite = candidates
      .filter((candidate) => candidate.inlierIds.length === bestInlierCount)
      .sort((a, b) => a.inlierMedianM - b.inlierMedianM)
    if (!elite.length) return { available: false, reason: 'RANSAC produced no elite consensus model' }

    const votes = new Map<string, number>()
    for (const control of fitControls) {
      const outlierVotes = elite.reduce((sum, candidate) => sum + (candidate.inlierIds.includes(control.id) ? 0 : 1), 0)
      votes.set(control.id, outlierVotes / elite.length)
    }

    let robustControls = fitControls.filter((control) => (votes.get(control.id) ?? 1) <= 0.5)
    if (robustControls.length < sampleSize) {
      const best = elite[0]
      robustControls = fitControls.filter((control) => best.inlierIds.includes(control.id))
    }
    const robustModel = fitTransform(session.method, robustControls)
    const robustHoldout = evaluateFit(robustModel, checkControls, session.qaThresholds)
    const points: RobustPointDiagnostic[] = fitControls.map((control) => {
      const outlierVoteRate = votes.get(control.id) ?? 1
      return {
        controlId: control.id,
        ...(control.label ? { label: control.label } : {}),
        status: outlierVoteRate >= OUTLIER_VOTE_THRESHOLD ? 'outlier' : outlierVoteRate <= INLIER_VOTE_THRESHOLD ? 'inlier' : 'ambiguous',
        outlierVoteRate,
        robustResidualM: residualFor(robustModel, control),
      }
    })
    const outlierControlIds = points.filter((point) => point.status === 'outlier').map((point) => point.controlId)
    const divergence = boundaryDivergence(boundaryPoints(session, baselineModel), boundaryPoints(session, robustModel))
    const recommendation = recommend(baselineHoldout.rmseM, robustHoldout.rmseM, outlierControlIds.length)

    return {
      available: true,
      method: session.method,
      thresholdM,
      trialCount,
      validTrialCount: candidates.length,
      bestInlierCount,
      robustModel,
      robustInlierControlIds: robustControls.map((control) => control.id),
      outlierControlIds,
      outlierCount: outlierControlIds.length,
      points,
      baselineHoldout,
      robustHoldout,
      boundaryDivergence: divergence,
      recommendation: recommendation.recommendation,
      reasons: recommendation.reasons,
    }
  } catch (error) {
    return { available: false, reason: `robust diagnosis failed: ${error instanceof Error ? error.message : String(error)}` }
  }
}
