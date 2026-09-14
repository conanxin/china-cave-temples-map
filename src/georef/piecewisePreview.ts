import { wgs84ToGcj02 } from '../geo/wgs84ToGcj02.ts'
import { applyTransform, fitAffine, fitTransform } from './fitTransform.ts'
import { haversineMeters } from './qa.ts'
import { simulatePiecewiseRegistration, type PiecewiseLayout } from './piecewiseRegistration.ts'
import type { AffineModel, GeoreferenceSession, GeoreferenceTransformModel, GroundPoint, PixelPoint } from './types.ts'

export type PiecewisePreviewSeverity = 'pass' | 'review' | 'fail'

interface RegionDefinition {
  id: string
  minX: number
  maxX: number
  minY: number
  maxY: number
}

interface RegionFit {
  definition: RegionDefinition
  model: AffineModel
}

export interface PiecewisePreviewImageRegion extends RegionDefinition {
  orientationSign: -1 | 0 | 1
  globalOrientationSign: -1 | 0 | 1
  foldOverRisk: boolean
}

export interface PiecewiseSeamVector {
  id: string
  pixel: PixelPoint
  regionA: string
  regionB: string
  aGcj02: GroundPoint
  bGcj02: GroundPoint
  distanceM: number
  severity: PiecewisePreviewSeverity
}

export interface PiecewiseRegionOutline {
  id: string
  foldOverRisk: boolean
  path: GroundPoint[]
}

export type PiecewisePreviewResult =
  | { available: false; layout: PiecewiseLayout; reason: string }
  | {
      available: true
      layout: PiecewiseLayout
      boundaryGcj02: GroundPoint[]
      regionOutlinesGcj02: PiecewiseRegionOutline[]
      seamVectors: PiecewiseSeamVector[]
      seamMeanM: number
      seamMaxM: number
      imageRegions: PiecewisePreviewImageRegion[]
      foldOverRegionIds: string[]
      globalDivergence: { meanM: number; maxM: number }
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

function seamSamples(layout: PiecewiseLayout, width: number, height: number) {
  const fractions = [0.1, 0.3, 0.5, 0.7, 0.9]
  const samples: Array<{ id: string; a: string; b: string; pixel: PixelPoint }> = []
  if (layout === 'vertical-2') {
    for (const f of fractions) samples.push({ id: `W-E-${f}`, a: 'W', b: 'E', pixel: { x: width / 2, y: height * f } })
  } else if (layout === 'horizontal-2') {
    for (const f of fractions) samples.push({ id: `N-S-${f}`, a: 'N', b: 'S', pixel: { x: width * f, y: height / 2 } })
  } else {
    for (const f of [0.15, 0.35]) samples.push({ id: `NW-NE-${f}`, a: 'NW', b: 'NE', pixel: { x: width / 2, y: height * f } })
    for (const f of [0.65, 0.85]) samples.push({ id: `SW-SE-${f}`, a: 'SW', b: 'SE', pixel: { x: width / 2, y: height * f } })
    for (const f of [0.15, 0.35]) samples.push({ id: `NW-SW-${f}`, a: 'NW', b: 'SW', pixel: { x: width * f, y: height / 2 } })
    for (const f of [0.65, 0.85]) samples.push({ id: `NE-SE-${f}`, a: 'NE', b: 'SE', pixel: { x: width * f, y: height / 2 } })
  }
  return samples
}

function toGcj02(point: GroundPoint): GroundPoint {
  const [lng, lat] = wgs84ToGcj02(point.lng, point.lat)
  return { lng, lat }
}

function closeGroundPath(path: GroundPoint[]) {
  if (!path.length) return path
  const first = path[0]
  const last = path.at(-1)
  if (!last || first.lng !== last.lng || first.lat !== last.lat) path.push({ ...first })
  return path
}

function orientationAt(model: GeoreferenceTransformModel, pixel: PixelPoint): -1 | 0 | 1 {
  const p = applyTransform(model, pixel)
  const px = applyTransform(model, { x: pixel.x + 1, y: pixel.y })
  const py = applyTransform(model, { x: pixel.x, y: pixel.y + 1 })
  const det = (px.lng - p.lng) * (py.lat - p.lat) - (px.lat - p.lat) * (py.lng - p.lng)
  if (Math.abs(det) < 1e-16) return 0
  return det > 0 ? 1 : -1
}

function severity(distanceM: number, session: GeoreferenceSession): PiecewisePreviewSeverity {
  if (distanceM <= session.qaThresholds.passMaxM) return 'pass'
  if (distanceM <= session.qaThresholds.reviewMaxM) return 'review'
  return 'fail'
}

function regionCorners(region: RegionDefinition): PixelPoint[] {
  return [
    { x: region.minX, y: region.minY },
    { x: region.maxX, y: region.minY },
    { x: region.maxX, y: region.maxY },
    { x: region.minX, y: region.maxY },
  ]
}

export function buildPiecewisePreview(session: GeoreferenceSession, layout: PiecewiseLayout): PiecewisePreviewResult {
  const simulation = simulatePiecewiseRegistration(session)
  if (!simulation.available) return { available: false, layout, reason: simulation.reason }
  const candidate = simulation.candidates.find((item) => item.layout === layout)
  if (!candidate || !candidate.available) return { available: false, layout, reason: candidate && !candidate.available ? candidate.reason : `candidate ${layout} unavailable` }
  if (!session.imageWidth || !session.imageHeight) return { available: false, layout, reason: 'piecewise preview requires image width and height' }

  const regions = regionDefinitions(layout, session.imageWidth, session.imageHeight)
  const fits: RegionFit[] = []
  for (const definition of regions) {
    const controls = session.controls.filter((control) => control.role !== 'check' && regionForPixel(regions, control.pixel)?.id === definition.id)
    if (controls.length < 3) return { available: false, layout, reason: `region ${definition.id} requires at least 3 fit points` }
    try {
      fits.push({ definition, model: fitAffine(controls) })
    } catch (error) {
      return { available: false, layout, reason: `region ${definition.id} affine fit failed: ${error instanceof Error ? error.message : String(error)}` }
    }
  }

  let globalModel: GeoreferenceTransformModel
  try {
    globalModel = fitTransform(session.method, session.controls.filter((control) => control.role !== 'check'))
  } catch (error) {
    return { available: false, layout, reason: `global model fit failed: ${error instanceof Error ? error.message : String(error)}` }
  }

  const imageRegions: PiecewisePreviewImageRegion[] = fits.map(({ definition, model }) => {
    const center = { x: (definition.minX + definition.maxX) / 2, y: (definition.minY + definition.maxY) / 2 }
    const localSign = orientationAt(model, center)
    const globalSign = orientationAt(globalModel, center)
    return {
      ...definition,
      orientationSign: localSign,
      globalOrientationSign: globalSign,
      foldOverRisk: localSign === 0 || globalSign === 0 || localSign !== globalSign,
    }
  })
  const foldOverRegionIds = imageRegions.filter((region) => region.foldOverRisk).map((region) => region.id)

  const transformByRegion = (pixel: PixelPoint) => {
    const region = regionForPixel(regions, pixel)
    const fit = fits.find((item) => item.definition.id === region?.id)
    if (!fit) throw new Error(`No piecewise model for pixel ${pixel.x},${pixel.y}`)
    return applyTransform(fit.model, pixel)
  }

  const boundaryWgs84 = session.boundaryPixels.map(transformByRegion)
  const boundaryGcj02 = closeGroundPath(boundaryWgs84.map(toGcj02))
  const divergences = session.boundaryPixels.map((pixel) => haversineMeters(transformByRegion(pixel), applyTransform(globalModel, pixel)))
  const globalDivergence = {
    meanM: divergences.length ? divergences.reduce((sum, value) => sum + value, 0) / divergences.length : 0,
    maxM: divergences.length ? Math.max(...divergences) : 0,
  }

  const seamVectors: PiecewiseSeamVector[] = seamSamples(layout, session.imageWidth, session.imageHeight).map((sample) => {
    const a = fits.find((fit) => fit.definition.id === sample.a)!
    const b = fits.find((fit) => fit.definition.id === sample.b)!
    const aWgs84 = applyTransform(a.model, sample.pixel)
    const bWgs84 = applyTransform(b.model, sample.pixel)
    const distanceM = haversineMeters(aWgs84, bWgs84)
    return {
      id: sample.id,
      pixel: sample.pixel,
      regionA: sample.a,
      regionB: sample.b,
      aGcj02: toGcj02(aWgs84),
      bGcj02: toGcj02(bWgs84),
      distanceM,
      severity: severity(distanceM, session),
    }
  })

  const seamMeanM = seamVectors.length ? seamVectors.reduce((sum, item) => sum + item.distanceM, 0) / seamVectors.length : 0
  const seamMaxM = seamVectors.length ? Math.max(...seamVectors.map((item) => item.distanceM)) : 0
  const riskById = new Map(imageRegions.map((region) => [region.id, region.foldOverRisk]))
  const regionOutlinesGcj02 = fits.map(({ definition, model }) => ({
    id: definition.id,
    foldOverRisk: riskById.get(definition.id) ?? false,
    path: closeGroundPath(regionCorners(definition).map((pixel) => toGcj02(applyTransform(model, pixel)))),
  }))

  return {
    available: true,
    layout,
    boundaryGcj02,
    regionOutlinesGcj02,
    seamVectors,
    seamMeanM,
    seamMaxM,
    imageRegions,
    foldOverRegionIds,
    globalDivergence,
  }
}
