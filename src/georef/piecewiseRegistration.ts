import { applyTransform, fitAffine, fitTransform } from './fitTransform.ts'
import { haversineMeters } from './qa.ts'
import type { AffineModel, GeoreferenceControlPoint, GeoreferenceQaVerdict, GeoreferenceSession, PixelPoint } from './types.ts'

export type PiecewiseLayout = 'vertical-2' | 'horizontal-2' | 'quadrants-4'
export type PiecewiseRecommendation = 'promising' | 'review' | 'reject'

interface RegionDefinition {
  id: string
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export interface PiecewiseRegionDiagnostic {
  id: string
  fitControlCount: number
  checkControlCount: number
  orientationSign: -1 | 0 | 1
}

export type PiecewiseCandidate =
  | { layout: PiecewiseLayout; available: false; reason: string }
  | {
      layout: PiecewiseLayout
      available: true
      regions: PiecewiseRegionDiagnostic[]
      baselineHoldoutRmseM: number
      holdoutRmseM: number
      holdoutMaxResidualM: number
      holdoutVerdict: GeoreferenceQaVerdict
      improvementPercent: number
      seamMeanM: number
      seamMaxM: number
      seamSampleCount: number
      foldOverRisk: boolean
      unvalidatedRegionCount: number
      recommendation: PiecewiseRecommendation
      reasons: string[]
    }

export type PiecewiseSimulationResult =
  | { available: false; reason: string }
  | {
      available: true
      baselineHoldoutRmseM: number
      candidates: PiecewiseCandidate[]
      bestLayout?: PiecewiseLayout
      recommendation: 'consider-piecewise' | 'review-piecewise' | 'global-preferred' | 'insufficient'
      reasons: string[]
    }

function regionDefinitions(layout: PiecewiseLayout, width: number, height: number): RegionDefinition[] {
  if (layout === 'vertical-2') return [
    { id: 'W', minX: 0, maxX: width / 2, minY: 0, maxY: height },
    { id: 'E', minX: width / 2, maxX: width, minY: 0, maxY: height },
  ]
  if (layout === 'horizontal-2') return [
    { id: 'N', minX: 0, maxX: width, minY: 0, maxY: height / 2 },
    { id: 'S', minX: 0, maxX: width, minY: height / 2, maxY: height },
  ]
  return [
    { id: 'NW', minX: 0, maxX: width / 2, minY: 0, maxY: height / 2 },
    { id: 'NE', minX: width / 2, maxX: width, minY: 0, maxY: height / 2 },
    { id: 'SW', minX: 0, maxX: width / 2, minY: height / 2, maxY: height },
    { id: 'SE', minX: width / 2, maxX: width, minY: height / 2, maxY: height },
  ]
}

function regionForPixel(regions: RegionDefinition[], pixel: PixelPoint) {
  const lastX = Math.max(...regions.map((region) => region.maxX))
  const lastY = Math.max(...regions.map((region) => region.maxY))
  return regions.find((region) => (
    pixel.x >= region.minX && (pixel.x < region.maxX || (region.maxX === lastX && pixel.x <= region.maxX))
    && pixel.y >= region.minY && (pixel.y < region.maxY || (region.maxY === lastY && pixel.y <= region.maxY))
  ))
}

function orientationSign(model: AffineModel): -1 | 0 | 1 {
  const [a, b, , d, e] = model.params
  const det = a * e - b * d
  if (Math.abs(det) < 1e-14) return 0
  return det > 0 ? 1 : -1
}

function verdict(rmseM: number, maxM: number, session: GeoreferenceSession): GeoreferenceQaVerdict {
  const t = session.qaThresholds
  if (rmseM <= t.passRmseM && maxM <= t.passMaxM) return 'pass'
  if (rmseM <= t.reviewRmseM && maxM <= t.reviewMaxM) return 'review'
  return 'fail'
}

function holdoutForModel(session: GeoreferenceSession, model = fitTransform(session.method, session.controls.filter((control) => control.role !== 'check'))) {
  const checks = session.controls.filter((control) => control.role === 'check')
  if (!checks.length) return { count: 0, rmseM: Number.NaN, maxM: Number.NaN }
  const residuals = checks.map((control) => haversineMeters(applyTransform(model, control.pixel), control.ground))
  return {
    count: checks.length,
    rmseM: Math.sqrt(residuals.reduce((sum, value) => sum + value * value, 0) / residuals.length),
    maxM: Math.max(...residuals),
  }
}

interface RegionFit {
  definition: RegionDefinition
  model: AffineModel
  fitControls: GeoreferenceControlPoint[]
  checkControls: GeoreferenceControlPoint[]
}

function seamSamples(layout: PiecewiseLayout, width: number, height: number) {
  const fractions = [0.1, 0.3, 0.5, 0.7, 0.9]
  const samples: Array<{ a: string; b: string; pixel: PixelPoint }> = []
  if (layout === 'vertical-2') {
    for (const f of fractions) samples.push({ a: 'W', b: 'E', pixel: { x: width / 2, y: height * f } })
  } else if (layout === 'horizontal-2') {
    for (const f of fractions) samples.push({ a: 'N', b: 'S', pixel: { x: width * f, y: height / 2 } })
  } else {
    for (const f of [0.15, 0.35]) samples.push({ a: 'NW', b: 'NE', pixel: { x: width / 2, y: height * f } })
    for (const f of [0.65, 0.85]) samples.push({ a: 'SW', b: 'SE', pixel: { x: width / 2, y: height * f } })
    for (const f of [0.15, 0.35]) samples.push({ a: 'NW', b: 'SW', pixel: { x: width * f, y: height / 2 } })
    for (const f of [0.65, 0.85]) samples.push({ a: 'NE', b: 'SE', pixel: { x: width * f, y: height / 2 } })
  }
  return samples
}

function evaluateCandidate(layout: PiecewiseLayout, session: GeoreferenceSession, baselineHoldoutRmseM: number): PiecewiseCandidate {
  const width = session.imageWidth
  const height = session.imageHeight
  if (!width || !height) return { layout, available: false, reason: 'piecewise simulation requires image width and height' }

  const regions = regionDefinitions(layout, width, height)
  const fits: RegionFit[] = []
  for (const definition of regions) {
    const fitControls = session.controls.filter((control) => control.role !== 'check' && regionForPixel(regions, control.pixel)?.id === definition.id)
    const checkControls = session.controls.filter((control) => control.role === 'check' && regionForPixel(regions, control.pixel)?.id === definition.id)
    if (fitControls.length < 3) return { layout, available: false, reason: `region ${definition.id} requires at least 3 fit points` }
    if (checkControls.length < 1) return { layout, available: false, reason: `region ${definition.id} requires at least 1 independent check point` }
    try {
      fits.push({ definition, model: fitAffine(fitControls), fitControls, checkControls })
    } catch (error) {
      return { layout, available: false, reason: `region ${definition.id} affine fit failed: ${error instanceof Error ? error.message : String(error)}` }
    }
  }

  const residuals: number[] = []
  for (const control of session.controls.filter((item) => item.role === 'check')) {
    const region = regionForPixel(regions, control.pixel)
    const fit = fits.find((item) => item.definition.id === region?.id)
    if (!fit) continue
    residuals.push(haversineMeters(applyTransform(fit.model, control.pixel), control.ground))
  }
  const holdoutRmseM = Math.sqrt(residuals.reduce((sum, value) => sum + value * value, 0) / residuals.length)
  const holdoutMaxResidualM = Math.max(...residuals)

  const seamResiduals = seamSamples(layout, width, height).map((sample) => {
    const a = fits.find((fit) => fit.definition.id === sample.a)!
    const b = fits.find((fit) => fit.definition.id === sample.b)!
    return haversineMeters(applyTransform(a.model, sample.pixel), applyTransform(b.model, sample.pixel))
  })
  const seamMeanM = seamResiduals.reduce((sum, value) => sum + value, 0) / seamResiduals.length
  const seamMaxM = Math.max(...seamResiduals)
  const orientations = fits.map((fit) => orientationSign(fit.model))
  const foldOverRisk = orientations.includes(0) || new Set(orientations).size > 1
  const improvementPercent = Number.isFinite(baselineHoldoutRmseM) && baselineHoldoutRmseM > 1e-9
    ? (baselineHoldoutRmseM - holdoutRmseM) / baselineHoldoutRmseM * 100
    : 0
  const holdoutVerdict = verdict(holdoutRmseM, holdoutMaxResidualM, session)
  const unvalidatedRegionCount = fits.filter((fit) => fit.checkControls.length === 0).length
  const reasons: string[] = []
  let recommendation: PiecewiseRecommendation = 'reject'
  if (foldOverRisk) reasons.push('orientation mismatch creates fold-over risk')
  if (seamMaxM > session.qaThresholds.reviewMaxM) reasons.push(`seam discontinuity ${seamMaxM.toFixed(1)}m exceeds review maximum`)
  if (holdoutVerdict === 'fail') reasons.push('piecewise holdout still fails independent checks')

  if (!foldOverRisk && seamMaxM <= session.qaThresholds.passMaxM && holdoutVerdict !== 'fail' && improvementPercent >= 25 && unvalidatedRegionCount === 0) {
    recommendation = 'promising'
    reasons.push(`independent holdout improves ${improvementPercent.toFixed(0)}% with continuous seams`)
  } else if (!foldOverRisk && seamMaxM <= session.qaThresholds.reviewMaxM && holdoutVerdict !== 'fail' && improvementPercent >= 10) {
    recommendation = 'review'
    reasons.push(`piecewise holdout improves ${improvementPercent.toFixed(0)}% but requires seam/manual review`)
  } else if (!reasons.length) {
    reasons.push('piecewise candidate does not materially outperform the global model')
  }

  return {
    layout,
    available: true,
    regions: fits.map((fit) => ({
      id: fit.definition.id,
      fitControlCount: fit.fitControls.length,
      checkControlCount: fit.checkControls.length,
      orientationSign: orientationSign(fit.model),
    })),
    baselineHoldoutRmseM,
    holdoutRmseM,
    holdoutMaxResidualM,
    holdoutVerdict,
    improvementPercent,
    seamMeanM,
    seamMaxM,
    seamSampleCount: seamResiduals.length,
    foldOverRisk,
    unvalidatedRegionCount,
    recommendation,
    reasons,
  }
}

export function simulatePiecewiseRegistration(session: GeoreferenceSession): PiecewiseSimulationResult {
  if (!session.imageWidth || !session.imageHeight) return { available: false, reason: 'piecewise simulation requires image width and height' }
  const checks = session.controls.filter((control) => control.role === 'check')
  const fitControls = session.controls.filter((control) => control.role !== 'check')
  if (checks.length < 2) return { available: false, reason: 'piecewise simulation requires at least 2 independent check points' }
  if (fitControls.length < 6) return { available: false, reason: 'piecewise simulation requires at least 6 fit points' }
  let baseline
  try { baseline = holdoutForModel(session) } catch (error) { return { available: false, reason: `global baseline fit failed: ${error instanceof Error ? error.message : String(error)}` } }
  const candidates = (['vertical-2', 'horizontal-2', 'quadrants-4'] as PiecewiseLayout[]).map((layout) => evaluateCandidate(layout, session, baseline.rmseM))
  const available = candidates.filter((candidate): candidate is Extract<PiecewiseCandidate, { available: true }> => candidate.available)
  const ranked = [...available].sort((a, b) => {
    const rank = { promising: 0, review: 1, reject: 2 }
    return rank[a.recommendation] - rank[b.recommendation] || a.holdoutRmseM - b.holdoutRmseM
  })
  const best = ranked[0]
  if (!best) return { available: true, baselineHoldoutRmseM: baseline.rmseM, candidates, recommendation: 'insufficient', reasons: ['no candidate layout has enough fit/check controls in every segment'] }
  const recommendation = best.recommendation === 'promising'
    ? 'consider-piecewise'
    : best.recommendation === 'review'
      ? 'review-piecewise'
      : 'global-preferred'
  return {
    available: true,
    baselineHoldoutRmseM: baseline.rmseM,
    candidates,
    ...(best.recommendation !== 'reject' ? { bestLayout: best.layout } : {}),
    recommendation,
    reasons: best.reasons,
  }
}
