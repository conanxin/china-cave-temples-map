import { applyTransform, fitAffine, fitTransform } from './fitTransform.ts'
import { haversineMeters } from './qa.ts'
import type { SpatialCvModelId } from './spatialCrossValidation.ts'
import type { AffineModel, GeoreferenceControlPoint, GeoreferenceMethod, GeoreferenceSession, GroundPoint, PixelPoint } from './types.ts'

export type SystematicStressScenarioId =
  | 'pixel-rotation'
  | 'pixel-anisotropic-scale'
  | 'ground-common-shift'
  | 'regional-ground-bias'
  | 'single-control-gross-error'
  | 'pixel-wave'

export type SystematicStressRecommendation = 'stable' | 'model-sensitive' | 'boundary-sensitive' | 'systematic-fragile'

export interface SystematicStressOptions {
  rotationDeg?: number
  anisotropicScaleFraction?: number
  commonGroundShiftM?: number
  regionalGroundBiasM?: number
  singleControlGrossErrorM?: number
  pixelWaveAmplitudePx?: number
}

export interface SystematicStressBoundaryResult {
  baseline: GroundPoint[]
  stressed: GroundPoint[]
  vertexShiftsM: number[]
  meanShiftM: number
  maxShiftM: number
  mostUnstableSegment: {
    startVertexIndex: number
    endVertexIndex: number
    scoreM: number
  }
}

export interface SystematicStressVariantResult {
  id: string
  label: string
  modelWinnerId: SpatialCvModelId
  modelWinnerChanged: boolean
  activeHoldoutRmseM: number
  holdoutIncreaseM: number
  boundary?: SystematicStressBoundaryResult
}

export interface SystematicStressScenarioResult {
  id: SystematicStressScenarioId
  label: string
  variants: SystematicStressVariantResult[]
  worstVariant: SystematicStressVariantResult
  maxHoldoutRmseM: number
  maxHoldoutIncreaseM: number
  maxBoundaryShiftM: number
  modelFlipCount: number
}

export type SystematicStressResult =
  | { available: false; reason: string }
  | {
      available: true
      baselineWinnerModelId: SpatialCvModelId
      baselineActiveHoldoutRmseM: number
      scenarios: SystematicStressScenarioResult[]
      dominantScenarioId: SystematicStressScenarioId
      maxHoldoutIncreaseM: number
      maxBoundaryShiftM: number
      modelFlipCount: number
      recommendation: SystematicStressRecommendation
      reasons: string[]
      options: Required<SystematicStressOptions>
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

const DEFAULTS: Required<SystematicStressOptions> = {
  rotationDeg: 0.25,
  anisotropicScaleFraction: 0.0035,
  commonGroundShiftM: 10,
  regionalGroundBiasM: 15,
  singleControlGrossErrorM: 40,
  pixelWaveAmplitudePx: 2,
}

const MODEL_IDS: SpatialCvModelId[] = ['affine', 'projective', 'piecewise-vertical-2', 'piecewise-horizontal-2', 'piecewise-quadrants-4']

function parameterCount(id: SpatialCvModelId) {
  if (id === 'affine') return 6
  if (id === 'projective') return 8
  if (id === 'piecewise-quadrants-4') return 24
  return 12
}

function complexitySurchargePercent(id: SpatialCvModelId) {
  return Math.max(0, 5 * Math.log2(parameterCount(id) / 6))
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

function shiftGround(point: GroundPoint, eastM: number, northM: number): GroundPoint {
  if (eastM === 0 && northM === 0) return { ...point }
  const latRad = point.lat * Math.PI / 180
  return {
    lng: point.lng + eastM / Math.max(1, 111_320 * Math.cos(latRad)),
    lat: point.lat + northM / 111_320,
  }
}

function rotatePixel(point: PixelPoint, center: PixelPoint, degrees: number): PixelPoint {
  if (degrees === 0) return { ...point }
  const radians = degrees * Math.PI / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const dx = point.x - center.x
  const dy = point.y - center.y
  return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos }
}

function scalePixel(point: PixelPoint, center: PixelPoint, scaleX: number, scaleY: number): PixelPoint {
  return { x: center.x + (point.x - center.x) * scaleX, y: center.y + (point.y - center.y) * scaleY }
}

function activeHoldout(session: GeoreferenceSession, fitControls: GeoreferenceControlPoint[], checkControls: GeoreferenceControlPoint[]) {
  const model = fitTransform(session.method, fitControls)
  const residuals = checkControls.map((control) => haversineMeters(applyTransform(model, control.pixel), control.ground))
  return { model, rmseM: rmse(residuals) }
}

function winnerModel(fitControls: GeoreferenceControlPoint[], checkControls: GeoreferenceControlPoint[], width: number, height: number): SpatialCvModelId {
  const scores: Array<{ id: SpatialCvModelId; score: number }> = []
  for (const id of MODEL_IDS) {
    try {
      const candidate = fitCandidate(id, fitControls, width, height)
      const residuals = checkControls.map((control) => haversineMeters(candidate.predict(control.pixel), control.ground))
      scores.push({ id, score: rmse(residuals) * (1 + complexitySurchargePercent(id) / 100) })
    } catch {
      // unavailable candidate is excluded explicitly
    }
  }
  scores.sort((a, b) => {
    const difference = a.score - b.score
    return Math.abs(difference) < 0.01 ? parameterCount(a.id) - parameterCount(b.id) : difference
  })
  if (!scores[0]) throw new Error('no candidate model can be evaluated')
  return scores[0].id
}

function summarizeBoundary(baseline: GroundPoint[], stressed: GroundPoint[]): SystematicStressBoundaryResult {
  const vertexShiftsM = baseline.map((point, index) => haversineMeters(point, stressed[index]))
  const segments = vertexShiftsM.map((value, index) => {
    const next = vertexShiftsM[(index + 1) % vertexShiftsM.length]
    return { startVertexIndex: index, endVertexIndex: (index + 1) % vertexShiftsM.length, scoreM: (value + next) / 2 }
  })
  const mostUnstableSegment = [...segments].sort((a, b) => b.scoreM - a.scoreM)[0]
  return {
    baseline,
    stressed,
    vertexShiftsM,
    meanShiftM: vertexShiftsM.reduce((sum, value) => sum + value, 0) / vertexShiftsM.length,
    maxShiftM: Math.max(...vertexShiftsM),
    mostUnstableSegment,
  }
}

interface VariantDefinition {
  id: string
  label: string
  transform: (control: GeoreferenceControlPoint) => GeoreferenceControlPoint
}

function buildScenarioDefinitions(width: number, height: number, fitControls: GeoreferenceControlPoint[], options: Required<SystematicStressOptions>): Array<{ id: SystematicStressScenarioId; label: string; variants: VariantDefinition[] }> {
  const center = { x: width / 2, y: height / 2 }
  const cloneWithPixel = (control: GeoreferenceControlPoint, pixel: PixelPoint) => ({ ...control, pixel })
  const cloneWithGround = (control: GeoreferenceControlPoint, ground: GroundPoint) => ({ ...control, ground })
  const rotation = Math.abs(options.rotationDeg)
  const scale = Math.abs(options.anisotropicScaleFraction)
  const common = Math.abs(options.commonGroundShiftM)
  const regional = Math.abs(options.regionalGroundBiasM)
  const gross = Math.abs(options.singleControlGrossErrorM)
  const wave = Math.abs(options.pixelWaveAmplitudePx)
  return [
    {
      id: 'pixel-rotation',
      label: '控制点像素整体旋转',
      variants: [
        { id: 'rotation-positive', label: `+${rotation}°`, transform: (control) => cloneWithPixel(control, rotatePixel(control.pixel, center, rotation)) },
        { id: 'rotation-negative', label: `-${rotation}°`, transform: (control) => cloneWithPixel(control, rotatePixel(control.pixel, center, -rotation)) },
      ],
    },
    {
      id: 'pixel-anisotropic-scale',
      label: 'X/Y 各向异性比例尺',
      variants: [
        { id: 'scale-x-positive', label: `X +${(scale * 100).toFixed(2)}%`, transform: (control) => cloneWithPixel(control, scalePixel(control.pixel, center, 1 + scale, 1)) },
        { id: 'scale-x-negative', label: `X -${(scale * 100).toFixed(2)}%`, transform: (control) => cloneWithPixel(control, scalePixel(control.pixel, center, 1 - scale, 1)) },
        { id: 'scale-y-positive', label: `Y +${(scale * 100).toFixed(2)}%`, transform: (control) => cloneWithPixel(control, scalePixel(control.pixel, center, 1, 1 + scale)) },
        { id: 'scale-y-negative', label: `Y -${(scale * 100).toFixed(2)}%`, transform: (control) => cloneWithPixel(control, scalePixel(control.pixel, center, 1, 1 - scale)) },
      ],
    },
    {
      id: 'ground-common-shift',
      label: '地面控制点共同平移',
      variants: [
        { id: 'common-east', label: `全体向东 ${common}m`, transform: (control) => cloneWithGround(control, shiftGround(control.ground, common, 0)) },
        { id: 'common-west', label: `全体向西 ${common}m`, transform: (control) => cloneWithGround(control, shiftGround(control.ground, -common, 0)) },
        { id: 'common-north', label: `全体向北 ${common}m`, transform: (control) => cloneWithGround(control, shiftGround(control.ground, 0, common)) },
        { id: 'common-south', label: `全体向南 ${common}m`, transform: (control) => cloneWithGround(control, shiftGround(control.ground, 0, -common)) },
      ],
    },
    {
      id: 'regional-ground-bias',
      label: '区域相关地面偏移',
      variants: [
        { id: 'west-half-east', label: `西半幅向东 ${regional}m`, transform: (control) => control.pixel.x < width / 2 ? cloneWithGround(control, shiftGround(control.ground, regional, 0)) : { ...control } },
        { id: 'west-half-west', label: `西半幅向西 ${regional}m`, transform: (control) => control.pixel.x < width / 2 ? cloneWithGround(control, shiftGround(control.ground, -regional, 0)) : { ...control } },
        { id: 'north-half-north', label: `北半幅向北 ${regional}m`, transform: (control) => control.pixel.y < height / 2 ? cloneWithGround(control, shiftGround(control.ground, 0, regional)) : { ...control } },
        { id: 'north-half-south', label: `北半幅向南 ${regional}m`, transform: (control) => control.pixel.y < height / 2 ? cloneWithGround(control, shiftGround(control.ground, 0, -regional)) : { ...control } },
      ],
    },
    {
      id: 'single-control-gross-error',
      label: '单个控制点 Gross Error',
      variants: fitControls.map((target) => {
        const dx = target.pixel.x - center.x
        const dy = center.y - target.pixel.y
        const length = Math.hypot(dx, dy) || 1
        const eastM = gross * dx / length
        const northM = gross * dy / length
        return {
          id: `gross-${target.id}`,
          label: `${target.label ?? target.id} 单点偏移 ${gross}m`,
          transform: (control: GeoreferenceControlPoint) => control.id === target.id
            ? cloneWithGround(control, shiftGround(control.ground, eastM, northM))
            : { ...control },
        }
      }),
    },
    {
      id: 'pixel-wave',
      label: '图像局部波浪形变',
      variants: [
        { id: 'wave-y-positive', label: `Y波浪 +${wave}px`, transform: (control) => cloneWithPixel(control, { x: control.pixel.x, y: control.pixel.y + wave * Math.sin(2 * Math.PI * control.pixel.x / width) }) },
        { id: 'wave-y-negative', label: `Y波浪 -${wave}px`, transform: (control) => cloneWithPixel(control, { x: control.pixel.x, y: control.pixel.y - wave * Math.sin(2 * Math.PI * control.pixel.x / width) }) },
        { id: 'wave-x-positive', label: `X波浪 +${wave}px`, transform: (control) => cloneWithPixel(control, { x: control.pixel.x + wave * Math.sin(2 * Math.PI * control.pixel.y / height), y: control.pixel.y }) },
        { id: 'wave-x-negative', label: `X波浪 -${wave}px`, transform: (control) => cloneWithPixel(control, { x: control.pixel.x - wave * Math.sin(2 * Math.PI * control.pixel.y / height), y: control.pixel.y }) },
      ],
    },
  ]
}

export function analyzeSystematicStress(session: GeoreferenceSession, provided: SystematicStressOptions = {}): SystematicStressResult {
  const options: Required<SystematicStressOptions> = { ...DEFAULTS, ...provided }
  if (!session.imageWidth || !session.imageHeight) return { available: false, reason: 'systematic stress requires image width and height' }
  const fitControls = session.controls.filter((control) => control.role !== 'check')
  const checkControls = session.controls.filter((control) => control.role === 'check')
  const minimum = session.method === 'projective' ? 4 : 3
  if (fitControls.length < minimum) return { available: false, reason: `systematic stress requires at least ${minimum} fit points` }
  if (checkControls.length < 2) return { available: false, reason: 'systematic stress requires at least 2 independent check points' }

  let baselineActive
  let baselineWinnerModelId: SpatialCvModelId
  try {
    baselineActive = activeHoldout(session, fitControls, checkControls)
    baselineWinnerModelId = winnerModel(fitControls, checkControls, session.imageWidth, session.imageHeight)
  } catch (error) {
    return { available: false, reason: `baseline systematic stress fit failed: ${error instanceof Error ? error.message : String(error)}` }
  }
  const baselineBoundary = session.boundaryPixels.length >= 3
    ? session.boundaryPixels.map((pixel) => applyTransform(baselineActive.model, pixel))
    : undefined

  const scenarioDefinitions = buildScenarioDefinitions(session.imageWidth, session.imageHeight, fitControls, options)
  const scenarios: SystematicStressScenarioResult[] = scenarioDefinitions.map((scenario) => {
    const variants: SystematicStressVariantResult[] = scenario.variants.map((variant) => {
      const stressedFit = fitControls.map((control) => variant.transform(control))
      const active = activeHoldout(session, stressedFit, checkControls)
      const winner = winnerModel(stressedFit, checkControls, session.imageWidth!, session.imageHeight!)
      const stressedBoundary = baselineBoundary ? session.boundaryPixels.map((pixel) => applyTransform(active.model, pixel)) : undefined
      return {
        id: variant.id,
        label: variant.label,
        modelWinnerId: winner,
        modelWinnerChanged: winner !== baselineWinnerModelId,
        activeHoldoutRmseM: active.rmseM,
        holdoutIncreaseM: Math.max(0, active.rmseM - baselineActive.rmseM),
        ...(baselineBoundary && stressedBoundary ? { boundary: summarizeBoundary(baselineBoundary, stressedBoundary) } : {}),
      }
    })
    const worstVariant = [...variants].sort((a, b) => {
      const aScore = Math.max(a.boundary?.maxShiftM ?? 0, a.holdoutIncreaseM)
      const bScore = Math.max(b.boundary?.maxShiftM ?? 0, b.holdoutIncreaseM)
      return bScore - aScore
    })[0]
    return {
      id: scenario.id,
      label: scenario.label,
      variants,
      worstVariant,
      maxHoldoutRmseM: Math.max(...variants.map((variant) => variant.activeHoldoutRmseM)),
      maxHoldoutIncreaseM: Math.max(...variants.map((variant) => variant.holdoutIncreaseM)),
      maxBoundaryShiftM: Math.max(0, ...variants.map((variant) => variant.boundary?.maxShiftM ?? 0)),
      modelFlipCount: variants.filter((variant) => variant.modelWinnerChanged).length,
    }
  })

  const dominant = [...scenarios].sort((a, b) => Math.max(b.maxBoundaryShiftM, b.maxHoldoutIncreaseM) - Math.max(a.maxBoundaryShiftM, a.maxHoldoutIncreaseM))[0]
  const maxHoldoutIncreaseM = Math.max(...scenarios.map((scenario) => scenario.maxHoldoutIncreaseM))
  const maxHoldoutRmseM = Math.max(...scenarios.map((scenario) => scenario.maxHoldoutRmseM))
  const maxBoundaryShiftM = Math.max(...scenarios.map((scenario) => scenario.maxBoundaryShiftM))
  const modelFlipCount = scenarios.reduce((sum, scenario) => sum + scenario.modelFlipCount, 0)
  const reasons: string[] = []
  let recommendation: SystematicStressRecommendation = 'stable'
  if (maxBoundaryShiftM > session.qaThresholds.reviewMaxM || maxHoldoutRmseM > session.qaThresholds.reviewRmseM) {
    recommendation = 'systematic-fragile'
    reasons.push(`worst systematic scenario reaches holdout ${maxHoldoutRmseM.toFixed(1)}m / boundary ${maxBoundaryShiftM.toFixed(1)}m`)
  } else if (maxBoundaryShiftM > session.qaThresholds.passMaxM) {
    recommendation = 'boundary-sensitive'
    reasons.push(`systematic stress moves the boundary by up to ${maxBoundaryShiftM.toFixed(1)}m`)
  } else if (modelFlipCount > 0) {
    recommendation = 'model-sensitive'
    reasons.push(`${modelFlipCount} systematic variants change the complexity-adjusted model winner`)
  } else {
    reasons.push('tested systematic scenarios remain within the current research QA envelope')
  }
  reasons.push(`dominant scenario: ${dominant.label}`)

  return {
    available: true,
    baselineWinnerModelId,
    baselineActiveHoldoutRmseM: baselineActive.rmseM,
    scenarios,
    dominantScenarioId: dominant.id,
    maxHoldoutIncreaseM,
    maxBoundaryShiftM,
    modelFlipCount,
    recommendation,
    reasons,
    options,
  }
}
