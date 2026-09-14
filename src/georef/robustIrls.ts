import { solveLeastSquares } from './linearAlgebra.ts'
import { applyTransform, fitTransform } from './fitTransform.ts'
import { evaluateFit, haversineMeters } from './qa.ts'
import type {
  AffineModel,
  GeoreferenceControlPoint,
  GeoreferenceSession,
  GeoreferenceTransformModel,
  GroundPoint,
  ProjectiveModel,
} from './types.ts'

export type IrlsEstimator = 'huber' | 'tukey'
export type IrlsWeightStatus = 'full' | 'downweighted' | 'severe'
export type IrlsRecommendation = 'agree' | 'review-downweighted' | 'irls-improves' | 'least-squares' | 'insufficient'

export interface IrlsPointDiagnostic {
  controlId: string
  label?: string
  weight: number
  status: IrlsWeightStatus
  residualM: number
}

export interface IrlsEstimatorResult {
  estimator: IrlsEstimator
  tuningConstant: number
  iterations: number
  converged: boolean
  scaleM: number
  model: GeoreferenceTransformModel
  points: IrlsPointDiagnostic[]
  holdout: ReturnType<typeof evaluateFit>
  boundaryDivergence: { meanM: number; maxM: number }
  downweightedCount: number
  severeCount: number
}

export type IrlsGeoreferenceResult =
  | { available: false; reason: string }
  | {
      available: true
      method: GeoreferenceSession['method']
      fitControlCount: number
      checkControlCount: number
      baselineHoldout: ReturnType<typeof evaluateFit>
      huber: IrlsEstimatorResult
      tukey: IrlsEstimatorResult
      recommendation: IrlsRecommendation
      reasons: string[]
    }

const HUBER_K = 1.345
const TUKEY_C = 4.685
const MAX_ITERATIONS = 30
const WEIGHT_TOLERANCE = 1e-4
const MIN_WEIGHT = 1e-6
const MATERIAL_IMPROVEMENT_METERS = 5
const MATERIAL_IMPROVEMENT_RATIO = 0.75

function median(values: number[]) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function robustScaleMeters(residuals: number[]) {
  if (!residuals.length) return 1e-6
  const center = median(residuals)
  const mad = median(residuals.map((value) => Math.abs(value - center)))
  const madScale = 1.4826 * mad
  if (madScale > 1e-3) return madScale
  const medianScale = 1.4826 * median(residuals)
  return Math.max(medianScale, 1e-6)
}

function weightFor(estimator: IrlsEstimator, residualM: number, scaleM: number) {
  const constant = estimator === 'huber' ? HUBER_K : TUKEY_C
  const denominator = Math.max(scaleM * constant, 1e-9)
  const u = Math.abs(residualM) / denominator
  if (estimator === 'huber') return u <= 1 ? 1 : Math.max(MIN_WEIGHT, 1 / u)
  if (u >= 1) return MIN_WEIGHT
  const term = 1 - u * u
  return Math.max(MIN_WEIGHT, term * term)
}

function weightedRows(
  method: GeoreferenceSession['method'],
  controls: GeoreferenceControlPoint[],
  weights: number[],
) {
  const rows: number[][] = []
  const values: number[] = []
  controls.forEach((control, index) => {
    const factor = Math.sqrt(Math.max(weights[index] ?? 0, MIN_WEIGHT))
    const { x, y } = control.pixel
    const { lng, lat } = control.ground
    if (method === 'affine') {
      rows.push([x * factor, y * factor, factor, 0, 0, 0])
      values.push(lng * factor)
      rows.push([0, 0, 0, x * factor, y * factor, factor])
      values.push(lat * factor)
      return
    }
    rows.push([x * factor, y * factor, factor, 0, 0, 0, -x * lng * factor, -y * lng * factor])
    values.push(lng * factor)
    rows.push([0, 0, 0, x * factor, y * factor, factor, -x * lat * factor, -y * lat * factor])
    values.push(lat * factor)
  })
  return { rows, values }
}

function fitWeightedTransform(
  method: GeoreferenceSession['method'],
  controls: GeoreferenceControlPoint[],
  weights: number[],
): GeoreferenceTransformModel {
  const minimum = method === 'affine' ? 3 : 4
  if (controls.length < minimum) throw new Error(`${method} weighted fit requires at least ${minimum} control points`)
  const effective = weights.filter((weight) => weight > 1e-4).length
  if (effective < minimum) throw new Error(`${method} IRLS retained fewer than ${minimum} effective control points`)
  const { rows, values } = weightedRows(method, controls, weights)
  const params = solveLeastSquares(rows, values)
  return method === 'affine'
    ? { kind: 'affine', params: params as AffineModel['params'] }
    : { kind: 'projective', params: params as ProjectiveModel['params'] }
}

function residualsFor(model: GeoreferenceTransformModel, controls: GeoreferenceControlPoint[]) {
  return controls.map((control) => haversineMeters(applyTransform(model, control.pixel), control.ground))
}

function boundaryPoints(session: GeoreferenceSession, model: GeoreferenceTransformModel): GroundPoint[] {
  return session.boundaryPixels.map((pixel) => applyTransform(model, pixel))
}

function boundaryDivergence(a: GroundPoint[], b: GroundPoint[]) {
  if (!a.length || a.length !== b.length) return { meanM: 0, maxM: 0 }
  const distances = a.map((point, index) => haversineMeters(point, b[index]))
  return { meanM: distances.reduce((sum, value) => sum + value, 0) / distances.length, maxM: Math.max(...distances) }
}

function classifyWeight(weight: number): IrlsWeightStatus {
  if (weight < 0.35) return 'severe'
  if (weight < 0.8) return 'downweighted'
  return 'full'
}

function runEstimator(
  estimator: IrlsEstimator,
  session: GeoreferenceSession,
  fitControls: GeoreferenceControlPoint[],
  checkControls: GeoreferenceControlPoint[],
  baselineModel: GeoreferenceTransformModel,
): IrlsEstimatorResult {
  let model = baselineModel
  let weights = Array(fitControls.length).fill(1) as number[]
  let scaleM = 1e-6
  let converged = false
  let iterations = 0

  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration += 1) {
    const residuals = residualsFor(model, fitControls)
    scaleM = robustScaleMeters(residuals)
    const nextWeights = residuals.map((residual) => weightFor(estimator, residual, scaleM))
    const nextModel = fitWeightedTransform(session.method, fitControls, nextWeights)
    const maxWeightChange = Math.max(...nextWeights.map((weight, index) => Math.abs(weight - weights[index])))
    model = nextModel
    weights = nextWeights
    iterations = iteration
    if (maxWeightChange <= WEIGHT_TOLERANCE) {
      converged = true
      break
    }
  }

  const finalResiduals = residualsFor(model, fitControls)
  scaleM = robustScaleMeters(finalResiduals)
  weights = finalResiduals.map((residual) => weightFor(estimator, residual, scaleM))
  const points = fitControls.map((control, index) => ({
    controlId: control.id,
    ...(control.label ? { label: control.label } : {}),
    weight: weights[index],
    status: classifyWeight(weights[index]),
    residualM: finalResiduals[index],
  }))
  const baselineBoundary = boundaryPoints(session, baselineModel)
  const estimatorBoundary = boundaryPoints(session, model)
  return {
    estimator,
    tuningConstant: estimator === 'huber' ? HUBER_K : TUKEY_C,
    iterations,
    converged,
    scaleM,
    model,
    points,
    holdout: evaluateFit(model, checkControls, session.qaThresholds),
    boundaryDivergence: boundaryDivergence(baselineBoundary, estimatorBoundary),
    downweightedCount: points.filter((point) => point.status !== 'full').length,
    severeCount: points.filter((point) => point.status === 'severe').length,
  }
}

function recommend(
  baselineRmseM: number,
  huber: IrlsEstimatorResult,
  tukey: IrlsEstimatorResult,
): { recommendation: IrlsRecommendation; reasons: string[] } {
  const best = huber.holdout.rmseM <= tukey.holdout.rmseM ? huber : tukey
  const improvementM = baselineRmseM - best.holdout.rmseM
  const materiallyBetter = improvementM >= MATERIAL_IMPROVEMENT_METERS && best.holdout.rmseM <= baselineRmseM * MATERIAL_IMPROVEMENT_RATIO
  const hasSevere = huber.severeCount > 0 || tukey.severeCount > 0
  if (hasSevere && materiallyBetter) return { recommendation: 'review-downweighted', reasons: [`${best.estimator} IRLS improves independent holdout RMSE by ${improvementM.toFixed(1)}m while strongly downweighting one or more fit points`] }
  if (materiallyBetter) return { recommendation: 'irls-improves', reasons: [`${best.estimator} IRLS improves independent holdout RMSE by ${improvementM.toFixed(1)}m`] }
  if (best.holdout.rmseM > baselineRmseM * 1.25 && best.holdout.rmseM - baselineRmseM >= MATERIAL_IMPROVEMENT_METERS) return { recommendation: 'least-squares', reasons: ['IRLS does not improve independent holdout performance; keep least-squares as the primary model'] }
  return { recommendation: 'agree', reasons: ['IRLS and least-squares have similar independent holdout performance'] }
}

export function analyzeIrlsGeoreference(session: GeoreferenceSession): IrlsGeoreferenceResult {
  const fitControls = session.controls.filter((control) => control.role !== 'check')
  const checkControls = session.controls.filter((control) => control.role === 'check')
  const minimumFit = session.method === 'affine' ? 5 : 6
  if (fitControls.length < minimumFit) return { available: false, reason: `IRLS diagnosis requires at least ${minimumFit} fit points for ${session.method}` }
  if (checkControls.length < 2) return { available: false, reason: 'IRLS diagnosis requires at least 2 independent check points' }
  try {
    const baselineModel = fitTransform(session.method, fitControls)
    const baselineHoldout = evaluateFit(baselineModel, checkControls, session.qaThresholds)
    const huber = runEstimator('huber', session, fitControls, checkControls, baselineModel)
    const tukey = runEstimator('tukey', session, fitControls, checkControls, baselineModel)
    const recommendation = recommend(baselineHoldout.rmseM, huber, tukey)
    return {
      available: true,
      method: session.method,
      fitControlCount: fitControls.length,
      checkControlCount: checkControls.length,
      baselineHoldout,
      huber,
      tukey,
      recommendation: recommendation.recommendation,
      reasons: recommendation.reasons,
    }
  } catch (error) {
    return { available: false, reason: `IRLS diagnosis failed: ${error instanceof Error ? error.message : String(error)}` }
  }
}
