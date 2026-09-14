import { applyTransform, fitAffine, fitTransform } from './fitTransform.ts'
import { haversineMeters } from './qa.ts'
import { resolveControlUncertainty, summarizeControlUncertainty, type ControlUncertaintySummary, type ResolvedControlUncertainty } from './controlUncertainty.ts'
import { analyzeUncertainCheckPredictions } from './checkUncertainty.ts'
import type { SpatialCvModelId } from './spatialCrossValidation.ts'
import type { AffineModel, GeoreferenceControlPoint, GeoreferenceMethod, GeoreferenceSession, GroundPoint, PixelPoint } from './types.ts'

export interface MonteCarloOptions {
  trials?: number
  pixelSigmaPx?: number
  groundSigmaM?: number
  seed?: number
}

export interface MonteCarloModelSummary {
  id: SpatialCvModelId
  label: string
  parameterCount: number
  complexitySurchargePercent: number
  validTrials: number
  wins: number
  winRate: number
  meanHoldoutRmseM: number | null
  meanAdjustedScoreM: number | null
  evidenceValidTrials?: number
  evidenceWins?: number
  evidenceWinRate?: number
  meanNormalizedHoldout?: number | null
  meanEvidenceAdjustedScore?: number | null
}

export interface BoundaryVertexUncertainty {
  vertexIndex: number
  baseline: GroundPoint
  p50M: number
  p95M: number
  maxM: number
}

export interface BoundarySegmentUncertainty {
  startVertexIndex: number
  endVertexIndex: number
  p95M: number
  maxM: number
}

export interface MonteCarloBoundaryUncertainty {
  vertices: BoundaryVertexUncertainty[]
  segments: BoundarySegmentUncertainty[]
  meanP95M: number
  maxP95M: number
  maxObservedM: number
  mostUnstableSegment: BoundarySegmentUncertainty
}

export type MonteCarloRecommendation = 'global-stable' | 'piecewise-stable' | 'model-uncertain' | 'boundary-uncertain'

export type MonteCarloUncertaintyResult =
  | { available: false; reason: string }
  | {
      available: true
      trials: number
      successfulTrials: number
      seed: number
      pixelSigmaPx: number
      groundSigmaM: number
      uncertaintyMode: 'uniform' | 'evidence-profiled'
      controlProfiles: ResolvedControlUncertainty[]
      uncertaintySummary: ControlUncertaintySummary
      models: MonteCarloModelSummary[]
      winnerModelId: SpatialCvModelId
      winnerRate: number
      runnerUpModelId?: SpatialCvModelId
      runnerUpRate?: number
      evidenceWinnerModelId?: SpatialCvModelId
      evidenceWinnerRate?: number
      evidenceRunnerUpModelId?: SpatialCvModelId
      evidenceRunnerUpRate?: number
      boundary?: MonteCarloBoundaryUncertainty
      recommendation: MonteCarloRecommendation
      reasons: string[]
    }

interface RegionDefinition {
  id: string
  minX: number
  maxX: number
  minY: number
  maxY: number
}

interface PiecewiseModel {
  regions: RegionDefinition[]
  fits: Array<{ regionId: string; model: AffineModel }>
}

const DEFAULT_TRIALS = 200
const DEFAULT_PIXEL_SIGMA_PX = 1.5
const DEFAULT_GROUND_SIGMA_M = 10
const DEFAULT_SEED = 27027
const MODEL_IDS: SpatialCvModelId[] = ['affine', 'projective', 'piecewise-vertical-2', 'piecewise-horizontal-2', 'piecewise-quadrants-4']

function buildUniformProfiles(controls: GeoreferenceControlPoint[], pixelSigmaPx: number, groundSigmaM: number): ResolvedControlUncertainty[] {
  return controls.map((control) => ({
    controlId: control.id,
    pixelEvidence: control.uncertainty?.pixelEvidence ?? 'unknown',
    groundEvidence: control.uncertainty?.groundEvidence ?? (control.groundSource === 'amap-click' ? 'amap-poi' : 'unknown'),
    pixelSigmaPx,
    groundSigmaM,
    calibrationSource: 'explicit-sigma',
    rationale: [`uniform Monte Carlo override → σ=${pixelSigmaPx.toFixed(2)}px / ${groundSigmaM.toFixed(2)}m`],
  }))
}

function summarizeResolvedProfiles(profiles: ResolvedControlUncertainty[]): ControlUncertaintySummary {
  if (!profiles.length) return {
    fitControlCount: 0,
    profiledControlCount: 0,
    fallbackControlCount: 0,
    pixelSigmaRangePx: [0, 0],
    groundSigmaRangeM: [0, 0],
    meanPixelSigmaPx: 0,
    meanGroundSigmaM: 0,
  }
  const pixel = profiles.map((item) => item.pixelSigmaPx)
  const ground = profiles.map((item) => item.groundSigmaM)
  const profiledControlCount = profiles.filter((item) => item.calibrationSource !== 'fallback').length
  return {
    fitControlCount: profiles.length,
    profiledControlCount,
    fallbackControlCount: profiles.length - profiledControlCount,
    pixelSigmaRangePx: [Math.min(...pixel), Math.max(...pixel)],
    groundSigmaRangeM: [Math.min(...ground), Math.max(...ground)],
    meanPixelSigmaPx: pixel.reduce((sum, value) => sum + value, 0) / pixel.length,
    meanGroundSigmaM: ground.reduce((sum, value) => sum + value, 0) / ground.length,
  }
}

function parameterCount(id: SpatialCvModelId) {
  if (id === 'affine') return 6
  if (id === 'projective') return 8
  if (id === 'piecewise-quadrants-4') return 24
  return 12
}

function modelLabel(id: SpatialCvModelId) {
  if (id === 'affine') return 'Global Affine'
  if (id === 'projective') return 'Global Projective'
  if (id === 'piecewise-vertical-2') return 'Piecewise 2×1'
  if (id === 'piecewise-horizontal-2') return 'Piecewise 1×2'
  return 'Piecewise 2×2'
}

function complexitySurchargePercent(id: SpatialCvModelId) {
  return Math.max(0, 5 * Math.log2(parameterCount(id) / 6))
}

function mulberry32(seed: number) {
  let state = seed >>> 0
  return () => {
    state += 0x6D2B79F5
    let value = state
    value = Math.imul(value ^ value >>> 15, value | 1)
    value ^= value + Math.imul(value ^ value >>> 7, value | 61)
    return ((value ^ value >>> 14) >>> 0) / 4294967296
  }
}

function gaussian(random: () => number) {
  let u = 0
  let v = 0
  while (u === 0) u = random()
  while (v === 0) v = random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

function perturbGround(point: GroundPoint, sigmaM: number, random: () => number): GroundPoint {
  if (sigmaM === 0) return { ...point }
  const eastM = gaussian(random) * sigmaM
  const northM = gaussian(random) * sigmaM
  const latRad = point.lat * Math.PI / 180
  const lat = point.lat + northM / 111_320
  const lng = point.lng + eastM / Math.max(1, 111_320 * Math.cos(latRad))
  return { lng, lat }
}

function perturbControl(control: GeoreferenceControlPoint, pixelSigmaPx: number, groundSigmaM: number, random: () => number): GeoreferenceControlPoint {
  return {
    ...control,
    pixel: pixelSigmaPx === 0 ? { ...control.pixel } : {
      x: control.pixel.x + gaussian(random) * pixelSigmaPx,
      y: control.pixel.y + gaussian(random) * pixelSigmaPx,
    },
    ground: perturbGround(control.ground, groundSigmaM, random),
  }
}

function regionDefinitions(id: SpatialCvModelId, width: number, height: number): RegionDefinition[] | undefined {
  if (id === 'piecewise-vertical-2') return [
    { id: 'W', minX: 0, maxX: width / 2, minY: 0, maxY: height },
    { id: 'E', minX: width / 2, maxX: width, minY: 0, maxY: height },
  ]
  if (id === 'piecewise-horizontal-2') return [
    { id: 'N', minX: 0, maxX: width, minY: 0, maxY: height / 2 },
    { id: 'S', minX: 0, maxX: width, minY: height / 2, maxY: height },
  ]
  if (id === 'piecewise-quadrants-4') return [
    { id: 'NW', minX: 0, maxX: width / 2, minY: 0, maxY: height / 2 },
    { id: 'NE', minX: width / 2, maxX: width, minY: 0, maxY: height / 2 },
    { id: 'SW', minX: 0, maxX: width / 2, minY: height / 2, maxY: height },
    { id: 'SE', minX: width / 2, maxX: width, minY: height / 2, maxY: height },
  ]
  return undefined
}

function regionForPixel(regions: RegionDefinition[], pixel: PixelPoint) {
  const lastX = Math.max(...regions.map((region) => region.maxX))
  const lastY = Math.max(...regions.map((region) => region.maxY))
  return regions.find((region) => pixel.x >= region.minX
    && (pixel.x < region.maxX || (region.maxX === lastX && pixel.x <= region.maxX))
    && pixel.y >= region.minY
    && (pixel.y < region.maxY || (region.maxY === lastY && pixel.y <= region.maxY)))
}

function fitCandidate(id: SpatialCvModelId, controls: GeoreferenceControlPoint[], width: number, height: number) {
  const regions = regionDefinitions(id, width, height)
  if (!regions) {
    const model = fitTransform(id as GeoreferenceMethod, controls)
    return { predict: (pixel: PixelPoint) => applyTransform(model, pixel) }
  }
  const piecewise: PiecewiseModel = { regions, fits: [] }
  for (const region of regions) {
    const local = controls.filter((control) => regionForPixel(regions, control.pixel)?.id === region.id)
    if (local.length < 3) throw new Error(`region ${region.id} requires at least 3 fit points`)
    piecewise.fits.push({ regionId: region.id, model: fitAffine(local) })
  }
  return {
    predict(pixel: PixelPoint) {
      const region = regionForPixel(piecewise.regions, pixel)
      const fit = piecewise.fits.find((item) => item.regionId === region?.id)
      if (!fit) throw new Error('piecewise region has no fitted model')
      return applyTransform(fit.model, pixel)
    },
  }
}

function rmse(values: number[]) {
  return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length)
}

function quantile(values: number[], q: number) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const position = (sorted.length - 1) * q
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) return sorted[lower]
  const weight = position - lower
  return sorted[lower] * (1 - weight) + sorted[upper] * weight
}

function summarizeBoundary(baseline: GroundPoint[], samplesByVertex: GroundPoint[][]): MonteCarloBoundaryUncertainty {
  const vertices = baseline.map((point, index) => {
    const distances = samplesByVertex[index].map((sample) => haversineMeters(point, sample))
    return {
      vertexIndex: index,
      baseline: point,
      p50M: quantile(distances, 0.5),
      p95M: quantile(distances, 0.95),
      maxM: distances.length ? Math.max(...distances) : 0,
    }
  })
  const segments: BoundarySegmentUncertainty[] = vertices.map((vertex, index) => {
    const next = vertices[(index + 1) % vertices.length]
    return {
      startVertexIndex: index,
      endVertexIndex: (index + 1) % vertices.length,
      p95M: (vertex.p95M + next.p95M) / 2,
      maxM: Math.max(vertex.maxM, next.maxM),
    }
  })
  const mostUnstableSegment = [...segments].sort((a, b) => b.p95M - a.p95M || b.maxM - a.maxM)[0]
  return {
    vertices,
    segments,
    meanP95M: vertices.reduce((sum, vertex) => sum + vertex.p95M, 0) / vertices.length,
    maxP95M: Math.max(...vertices.map((vertex) => vertex.p95M)),
    maxObservedM: Math.max(...vertices.map((vertex) => vertex.maxM)),
    mostUnstableSegment,
  }
}

export function analyzeMonteCarloUncertainty(session: GeoreferenceSession, options: MonteCarloOptions = {}): MonteCarloUncertaintyResult {
  const trials = Math.max(1, Math.floor(options.trials ?? DEFAULT_TRIALS))
  const seed = Math.floor(options.seed ?? DEFAULT_SEED)
  if (!session.imageWidth || !session.imageHeight) return { available: false, reason: 'Monte Carlo uncertainty requires image width and height' }
  const fitControls = session.controls.filter((control) => control.role !== 'check')
  const checkControls = session.controls.filter((control) => control.role === 'check')
  const uniformMode = options.pixelSigmaPx != null || options.groundSigmaM != null
  const uncertaintyMode = uniformMode ? 'uniform' as const : 'evidence-profiled' as const
  const uniformPixelSigmaPx = Math.max(0, options.pixelSigmaPx ?? DEFAULT_PIXEL_SIGMA_PX)
  const uniformGroundSigmaM = Math.max(0, options.groundSigmaM ?? DEFAULT_GROUND_SIGMA_M)
  const controlProfiles = uniformMode
    ? buildUniformProfiles(fitControls, uniformPixelSigmaPx, uniformGroundSigmaM)
    : fitControls.map(resolveControlUncertainty)
  const uncertaintySummary = uniformMode ? summarizeResolvedProfiles(controlProfiles) : summarizeControlUncertainty(fitControls)
  const pixelSigmaPx = uncertaintySummary.meanPixelSigmaPx
  const groundSigmaM = uncertaintySummary.meanGroundSigmaM
  const profileById = new Map(controlProfiles.map((profile) => [profile.controlId, profile]))
  const minimum = session.method === 'projective' ? 4 : 3
  if (fitControls.length < minimum) return { available: false, reason: `Monte Carlo uncertainty requires at least ${minimum} fit points` }
  if (checkControls.length < 2) return { available: false, reason: 'Monte Carlo model comparison requires at least 2 independent check points' }

  const random = mulberry32(seed)
  const accumulators = new Map<SpatialCvModelId, { valid: number; wins: number; holdoutSum: number; adjustedSum: number; evidenceValid: number; evidenceWins: number; normalizedSum: number; evidenceAdjustedSum: number }>()
  for (const id of MODEL_IDS) accumulators.set(id, { valid: 0, wins: 0, holdoutSum: 0, adjustedSum: 0, evidenceValid: 0, evidenceWins: 0, normalizedSum: 0, evidenceAdjustedSum: 0 })

  let baselineBoundary: GroundPoint[] | undefined
  let boundarySamples: GroundPoint[][] | undefined
  if (session.boundaryPixels.length >= 3) {
    try {
      const baselineModel = fitTransform(session.method, fitControls)
      baselineBoundary = session.boundaryPixels.map((pixel) => applyTransform(baselineModel, pixel))
      boundarySamples = session.boundaryPixels.map(() => [])
    } catch {
      baselineBoundary = undefined
      boundarySamples = undefined
    }
  }

  let successfulTrials = 0
  for (let trial = 0; trial < trials; trial += 1) {
    const perturbed = fitControls.map((control) => {
      const profile = profileById.get(control.id)
      return perturbControl(control, profile?.pixelSigmaPx ?? pixelSigmaPx, profile?.groundSigmaM ?? groundSigmaM, random)
    })
    const trialScores: Array<{ id: SpatialCvModelId; score: number }> = []
    const trialEvidenceScores: Array<{ id: SpatialCvModelId; score: number }> = []
    for (const id of MODEL_IDS) {
      try {
        const fitted = fitCandidate(id, perturbed, session.imageWidth, session.imageHeight)
        const residuals = checkControls.map((control) => haversineMeters(fitted.predict(control.pixel), control.ground))
        const holdoutRmseM = rmse(residuals)
        const score = holdoutRmseM * (1 + complexitySurchargePercent(id) / 100)
        const accumulator = accumulators.get(id)!
        accumulator.valid += 1
        accumulator.holdoutSum += holdoutRmseM
        accumulator.adjustedSum += score
        trialScores.push({ id, score })
        const evidence = analyzeUncertainCheckPredictions(session, fitted.predict)
        if (evidence.available) {
          const evidenceScore = evidence.normalizedRms * (1 + complexitySurchargePercent(id) / 100)
          accumulator.evidenceValid += 1
          accumulator.normalizedSum += evidence.normalizedRms
          accumulator.evidenceAdjustedSum += evidenceScore
          trialEvidenceScores.push({ id, score: evidenceScore })
        }
      } catch {
        // Candidate unavailable in this perturbation trial; keep explicit valid-trial count.
      }
    }
    trialScores.sort((a, b) => a.score - b.score)
    if (trialScores[0]) accumulators.get(trialScores[0].id)!.wins += 1
    trialEvidenceScores.sort((a, b) => a.score - b.score)
    if (trialEvidenceScores[0]) accumulators.get(trialEvidenceScores[0].id)!.evidenceWins += 1

    if (baselineBoundary && boundarySamples) {
      try {
        const activeModel = fitTransform(session.method, perturbed)
        session.boundaryPixels.forEach((pixel, index) => boundarySamples![index].push(applyTransform(activeModel, pixel)))
        successfulTrials += 1
      } catch {
        // Active model failed; this trial contributes to model comparison only.
      }
    } else {
      successfulTrials += 1
    }
  }

  const models: MonteCarloModelSummary[] = MODEL_IDS.map((id) => {
    const accumulator = accumulators.get(id)!
    return {
      id,
      label: modelLabel(id),
      parameterCount: parameterCount(id),
      complexitySurchargePercent: complexitySurchargePercent(id),
      validTrials: accumulator.valid,
      wins: accumulator.wins,
      winRate: trials ? accumulator.wins / trials : 0,
      meanHoldoutRmseM: accumulator.valid ? accumulator.holdoutSum / accumulator.valid : null,
      meanAdjustedScoreM: accumulator.valid ? accumulator.adjustedSum / accumulator.valid : null,
      evidenceValidTrials: accumulator.evidenceValid,
      evidenceWins: accumulator.evidenceWins,
      evidenceWinRate: trials ? accumulator.evidenceWins / trials : 0,
      meanNormalizedHoldout: accumulator.evidenceValid ? accumulator.normalizedSum / accumulator.evidenceValid : null,
      meanEvidenceAdjustedScore: accumulator.evidenceValid ? accumulator.evidenceAdjustedSum / accumulator.evidenceValid : null,
    }
  })
  const ranked = [...models].sort((a, b) => b.wins - a.wins || (a.meanAdjustedScoreM ?? Number.POSITIVE_INFINITY) - (b.meanAdjustedScoreM ?? Number.POSITIVE_INFINITY))
  const winner = ranked[0]
  if (!winner || winner.validTrials === 0) return { available: false, reason: 'no model survived any Monte Carlo perturbation trial' }
  const runnerUp = ranked[1]
  const evidenceRanked = [...models].filter((model) => (model.evidenceValidTrials ?? 0) > 0).sort((a, b) => (b.evidenceWins ?? 0) - (a.evidenceWins ?? 0) || (a.meanEvidenceAdjustedScore ?? Number.POSITIVE_INFINITY) - (b.meanEvidenceAdjustedScore ?? Number.POSITIVE_INFINITY))
  const evidenceWinner = evidenceRanked[0]
  const evidenceRunnerUp = evidenceRanked[1]
  const boundary = baselineBoundary && boundarySamples && successfulTrials ? summarizeBoundary(baselineBoundary, boundarySamples) : undefined
  const winnerRate = winner.winRate
  const reasons: string[] = []
  let recommendation: MonteCarloRecommendation
  if (boundary && boundary.maxP95M > session.qaThresholds.reviewMaxM) {
    recommendation = 'boundary-uncertain'
    reasons.push(`boundary P95 reaches ${boundary.maxP95M.toFixed(1)}m, above the review maximum`)
  } else if (winnerRate < 0.6 || (runnerUp && winnerRate - runnerUp.winRate < 0.2)) {
    recommendation = 'model-uncertain'
    reasons.push(`top model wins only ${(winnerRate * 100).toFixed(0)}% of perturbation trials`)
  } else if (winner.id.startsWith('piecewise-')) {
    recommendation = 'piecewise-stable'
    reasons.push(`${winner.label} wins ${(winnerRate * 100).toFixed(0)}% of perturbation trials after complexity adjustment`)
  } else {
    recommendation = 'global-stable'
    reasons.push(`${winner.label} wins ${(winnerRate * 100).toFixed(0)}% of perturbation trials after complexity adjustment`)
  }
  if (boundary) reasons.push(`active ${session.method} boundary mean/max P95 ${boundary.meanP95M.toFixed(1)}/${boundary.maxP95M.toFixed(1)}m`)

  return {
    available: true,
    trials,
    successfulTrials,
    seed,
    pixelSigmaPx,
    groundSigmaM,
    uncertaintyMode,
    controlProfiles,
    uncertaintySummary,
    models,
    winnerModelId: winner.id,
    winnerRate,
    ...(runnerUp ? { runnerUpModelId: runnerUp.id, runnerUpRate: runnerUp.winRate } : {}),
    ...(evidenceWinner ? { evidenceWinnerModelId: evidenceWinner.id, evidenceWinnerRate: evidenceWinner.evidenceWinRate ?? 0 } : {}),
    ...(evidenceRunnerUp ? { evidenceRunnerUpModelId: evidenceRunnerUp.id, evidenceRunnerUpRate: evidenceRunnerUp.evidenceWinRate ?? 0 } : {}),
    ...(boundary ? { boundary } : {}),
    recommendation,
    reasons,
  }
}
