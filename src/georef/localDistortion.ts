import { analyzeCheckErrorField, type CheckErrorVector } from './errorField.ts'
import { solveLeastSquares } from './linearAlgebra.ts'
import type { GeoreferenceSession, GeoreferenceTransformModel, PixelPoint } from './types.ts'

export type LocalDistortionPattern = 'stable' | 'structured-gradient' | 'localized-hotspot' | 'irregular'
export type LocalDistortionRegion = 'NW' | 'NE' | 'SW' | 'SE'
export type LocalDistortionSeverity = 'pass' | 'review' | 'fail'

export interface LocalDistortionGradient {
  eastDxM: number
  eastDyM: number
  northDxM: number
  northDyM: number
  divergenceM: number
  rotationM: number
  shearM: number
}

export interface LocalDistortionCell {
  row: number
  col: number
  centerPixel: PixelPoint
  eastM: number
  northM: number
  magnitudeM: number
  supportScore: number
  severity: LocalDistortionSeverity
  region: LocalDistortionRegion
}

export type LocalDistortionResult =
  | { available: false; reason: string }
  | {
      available: true
      checkCount: number
      pattern: LocalDistortionPattern
      meanResidualM: number
      maxResidualM: number
      systematicMagnitudeM: number
      localRmsM: number
      gradientExplainedFraction: number
      postFieldRmsM: number
      fieldVariationM: number
      gradient: LocalDistortionGradient
      gridCells: LocalDistortionCell[]
      hotspotContrast: number
      hotspotRegion?: LocalDistortionRegion
      hotspotCell?: LocalDistortionCell
    }

export interface LocalDistortionModelAnalysis {
  id: string
  label: string
  analysis: LocalDistortionResult
}

export type LocalDistortionRecommendation =
  | 'need-more-checks'
  | 'global-model-sufficient'
  | 'prefer-projective'
  | 'review-controls'
  | 'consider-piecewise'
  | 'inspect-local-distortion'

export interface LocalDistortionModelComparison {
  recommendation: LocalDistortionRecommendation
  bestModelId?: string
  bestMeanResidualM?: number
  nonStableModelCount: number
  persistentHotspotRegion?: LocalDistortionRegion
  reasons: string[]
}

const GRID_SIZE = 4
const EPSILON = 1e-9

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function median(values: number[]) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function normalizedPixel(pixel: PixelPoint, width: number, height: number) {
  return {
    x: pixel.x / width * 2 - 1,
    y: pixel.y / height * 2 - 1,
  }
}

function regionFor(pixel: PixelPoint, width: number, height: number): LocalDistortionRegion {
  const east = pixel.x >= width / 2
  const south = pixel.y >= height / 2
  if (!east && !south) return 'NW'
  if (east && !south) return 'NE'
  if (!east && south) return 'SW'
  return 'SE'
}

function severityFor(magnitudeM: number, session: GeoreferenceSession): LocalDistortionSeverity {
  if (magnitudeM <= session.qaThresholds.passRmseM) return 'pass'
  if (magnitudeM <= session.qaThresholds.reviewRmseM) return 'review'
  return 'fail'
}

function linearField(vectors: CheckErrorVector[], width: number, height: number) {
  const rows = vectors.map((vector) => {
    const normalized = normalizedPixel(vector.pixel, width, height)
    return [1, normalized.x, normalized.y]
  })
  const east = solveLeastSquares(rows, vectors.map((vector) => vector.eastM))
  const north = solveLeastSquares(rows, vectors.map((vector) => vector.northM))
  return { east, north }
}

function predictField(field: ReturnType<typeof linearField>, x: number, y: number) {
  return {
    eastM: field.east[0] + field.east[1] * x + field.east[2] * y,
    northM: field.north[0] + field.north[1] * x + field.north[2] * y,
  }
}

function maxPairwiseVectorDifference(points: Array<{ eastM: number; northM: number }>) {
  let max = 0
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      max = Math.max(max, Math.hypot(points[i].eastM - points[j].eastM, points[i].northM - points[j].northM))
    }
  }
  return max
}

function buildGrid(
  vectors: CheckErrorVector[],
  width: number,
  height: number,
  meanEastM: number,
  meanNorthM: number,
  session: GeoreferenceSession,
) {
  const gridCells: LocalDistortionCell[] = []
  for (let row = 0; row < GRID_SIZE; row += 1) {
    for (let col = 0; col < GRID_SIZE; col += 1) {
      const centerPixel = {
        x: (col + 0.5) / GRID_SIZE * width,
        y: (row + 0.5) / GRID_SIZE * height,
      }
      const center = normalizedPixel(centerPixel, width, height)
      let weightSum = 0
      let east = 0
      let north = 0
      let nearest = Number.POSITIVE_INFINITY
      for (const vector of vectors) {
        const point = normalizedPixel(vector.pixel, width, height)
        const dx = center.x - point.x
        const dy = center.y - point.y
        const distance = Math.hypot(dx, dy)
        nearest = Math.min(nearest, distance)
        const weight = 1 / (dx * dx + dy * dy + 0.04)
        weightSum += weight
        east += weight * (vector.eastM - meanEastM)
        north += weight * (vector.northM - meanNorthM)
      }
      const eastM = east / Math.max(weightSum, EPSILON)
      const northM = north / Math.max(weightSum, EPSILON)
      const magnitudeM = Math.hypot(eastM, northM)
      const supportScore = clamp(1 - nearest / 0.9, 0, 1)
      gridCells.push({
        row,
        col,
        centerPixel,
        eastM,
        northM,
        magnitudeM,
        supportScore,
        severity: severityFor(magnitudeM, session),
        region: regionFor(centerPixel, width, height),
      })
    }
  }
  return gridCells
}

export function analyzeLocalDistortion(
  session: GeoreferenceSession,
  model: GeoreferenceTransformModel,
): LocalDistortionResult {
  const checkCount = session.controls.filter((control) => control.role === 'check').length
  if (checkCount < 4) return { available: false, reason: 'local distortion analysis requires at least 4 independent check points' }
  if (!session.imageWidth || !session.imageHeight) return { available: false, reason: 'local distortion analysis requires image dimensions' }

  const errorField = analyzeCheckErrorField(session, model)
  if (!errorField.available) return { available: false, reason: errorField.reason }

  try {
    const field = linearField(errorField.vectors, session.imageWidth, session.imageHeight)
    const meanEastM = errorField.meanEastM
    const meanNorthM = errorField.meanNorthM
    const constantSse = errorField.vectors.reduce((sum, vector) => (
      sum + (vector.eastM - meanEastM) ** 2 + (vector.northM - meanNorthM) ** 2
    ), 0)
    const fieldSse = errorField.vectors.reduce((sum, vector) => {
      const normalized = normalizedPixel(vector.pixel, session.imageWidth!, session.imageHeight!)
      const predicted = predictField(field, normalized.x, normalized.y)
      return sum + (vector.eastM - predicted.eastM) ** 2 + (vector.northM - predicted.northM) ** 2
    }, 0)
    const gradientExplainedFraction = constantSse <= EPSILON ? 0 : clamp(1 - fieldSse / constantSse, 0, 1)
    const postFieldRmsM = Math.sqrt(fieldSse / errorField.vectors.length)
    const cornerVectors = [
      predictField(field, -1, -1),
      predictField(field, 1, -1),
      predictField(field, 1, 1),
      predictField(field, -1, 1),
    ]
    const fieldVariationM = maxPairwiseVectorDifference(cornerVectors)
    const gridCells = buildGrid(errorField.vectors, session.imageWidth, session.imageHeight, meanEastM, meanNorthM, session)
    const supported = gridCells.filter((cell) => cell.supportScore >= 0.25)
    const hotspotCell = [...supported].sort((a, b) => b.magnitudeM - a.magnitudeM)[0]
    const gridMedian = median(supported.map((cell) => cell.magnitudeM))
    const hotspotContrast = hotspotCell ? hotspotCell.magnitudeM / Math.max(gridMedian, 1) : 1

    const stableByQa = errorField.meanResidualM <= session.qaThresholds.passRmseM && errorField.maxResidualM <= session.qaThresholds.passMaxM
    const materialVariation = fieldVariationM >= Math.max(15, session.qaThresholds.passRmseM * 0.6)
    const localized = Boolean(hotspotCell)
      && (hotspotCell?.magnitudeM ?? 0) >= Math.max(20, session.qaThresholds.passRmseM * 0.8)
      && hotspotContrast >= 1.7
      && gradientExplainedFraction < 0.72

    let pattern: LocalDistortionPattern
    if (stableByQa && fieldVariationM < Math.max(15, session.qaThresholds.passRmseM * 0.6)) pattern = 'stable'
    else if (localized) pattern = 'localized-hotspot'
    else if (gradientExplainedFraction >= 0.55 && materialVariation) pattern = 'structured-gradient'
    else pattern = 'irregular'

    return {
      available: true,
      checkCount,
      pattern,
      meanResidualM: errorField.meanResidualM,
      maxResidualM: errorField.maxResidualM,
      systematicMagnitudeM: errorField.systematicMagnitudeM,
      localRmsM: errorField.localRmsM,
      gradientExplainedFraction,
      postFieldRmsM,
      fieldVariationM,
      gradient: {
        eastDxM: field.east[1],
        eastDyM: field.east[2],
        northDxM: field.north[1],
        northDyM: field.north[2],
        divergenceM: field.east[1] + field.north[2],
        rotationM: field.north[1] - field.east[2],
        shearM: Math.hypot(field.east[1] - field.north[2], field.east[2] + field.north[1]),
      },
      gridCells,
      hotspotContrast,
      ...(hotspotCell && hotspotContrast >= 1.4 ? { hotspotCell, hotspotRegion: hotspotCell.region } : {}),
    }
  } catch (error) {
    return { available: false, reason: `local distortion analysis failed: ${error instanceof Error ? error.message : String(error)}` }
  }
}

export function compareLocalDistortionAnalyses(
  entries: LocalDistortionModelAnalysis[],
  passRmseM: number,
): LocalDistortionModelComparison {
  const available = entries.filter((entry): entry is LocalDistortionModelAnalysis & { analysis: Extract<LocalDistortionResult, { available: true }> } => entry.analysis.available)
  if (!available.length) return { recommendation: 'need-more-checks', nonStableModelCount: 0, reasons: ['no model has enough independent check points for local-distortion analysis'] }

  const best = [...available].sort((a, b) => a.analysis.meanResidualM - b.analysis.meanResidualM)[0]
  const current = available.find((entry) => entry.id === 'current') ?? available[0]
  const affine = available.find((entry) => entry.id === 'affine')
  const projective = available.find((entry) => entry.id === 'projective')
  const robustLike = available.filter((entry) => ['robust', 'huber', 'tukey'].includes(entry.id))
  const nonStable = available.filter((entry) => entry.analysis.pattern !== 'stable')

  const hotspotCounts = new Map<LocalDistortionRegion, number>()
  for (const entry of nonStable) {
    if (!entry.analysis.hotspotRegion) continue
    hotspotCounts.set(entry.analysis.hotspotRegion, (hotspotCounts.get(entry.analysis.hotspotRegion) ?? 0) + 1)
  }
  const persistent = [...hotspotCounts.entries()].sort((a, b) => b[1] - a[1])[0]
  const persistentHotspotRegion = persistent && persistent[1] >= Math.max(3, Math.ceil(nonStable.length * 0.6)) ? persistent[0] : undefined

  const base = {
    bestModelId: best.id,
    bestMeanResidualM: best.analysis.meanResidualM,
    nonStableModelCount: nonStable.length,
    ...(persistentHotspotRegion ? { persistentHotspotRegion } : {}),
  }

  if (current.analysis.pattern === 'stable' && current.analysis.meanResidualM <= passRmseM) {
    return { ...base, recommendation: 'global-model-sufficient', reasons: ['current global model is stable on independent check points'] }
  }

  if (affine && projective && projective.analysis.pattern === 'stable' && projective.analysis.meanResidualM <= Math.min(passRmseM, affine.analysis.meanResidualM * 0.75)) {
    return { ...base, recommendation: 'prefer-projective', reasons: ['projective materially reduces the spatial residual field relative to affine'] }
  }

  const bestRobust = [...robustLike].sort((a, b) => a.analysis.meanResidualM - b.analysis.meanResidualM)[0]
  if (bestRobust && bestRobust.analysis.pattern === 'stable' && bestRobust.analysis.meanResidualM <= Math.min(passRmseM, current.analysis.meanResidualM * 0.75)) {
    return { ...base, recommendation: 'review-controls', reasons: [`${bestRobust.label} resolves the distortion while least-squares does not; review fit-point quality before considering a local model`] }
  }

  if (available.length >= 3 && nonStable.length >= 3 && persistentHotspotRegion && best.analysis.meanResidualM > passRmseM) {
    return { ...base, recommendation: 'consider-piecewise', reasons: [`local distortion persists around ${persistentHotspotRegion} across ${nonStable.length} global/robust models; consider segmented registration after manual review`] }
  }

  return { ...base, recommendation: 'inspect-local-distortion', reasons: ['spatial residual evidence is mixed; add independent check points or inspect the hotspot before increasing model complexity'] }
}
