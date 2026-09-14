import type {
  GeoreferenceControlPoint,
  GeoreferenceGroundEvidence,
  GeoreferencePixelEvidence,
} from './types.ts'

export const DEFAULT_PIXEL_SIGMA_PX = 1.5
export const DEFAULT_GROUND_SIGMA_M = 10

export const PIXEL_EVIDENCE_SIGMA_PX: Record<GeoreferencePixelEvidence, number> = {
  'exact-corner': 0.7,
  'clear-feature': 1.2,
  'fuzzy-feature': 3,
  'approximate-zone': 5,
  unknown: DEFAULT_PIXEL_SIGMA_PX,
}

export const GROUND_EVIDENCE_SIGMA_M: Record<GeoreferenceGroundEvidence, number> = {
  'official-survey-gis': 2,
  'field-gps': 5,
  'official-coordinate': 8,
  'amap-poi': 10,
  'manual-crosscheck': 12,
  'osm-wikidata': 15,
  unknown: DEFAULT_GROUND_SIGMA_M,
}

export type ControlUncertaintyCalibrationSource = 'explicit-sigma' | 'explicit-evidence' | 'inferred' | 'fallback'

export interface ResolvedControlUncertainty {
  controlId: string
  pixelEvidence: GeoreferencePixelEvidence
  groundEvidence: GeoreferenceGroundEvidence
  pixelSigmaPx: number
  groundSigmaM: number
  calibrationSource: ControlUncertaintyCalibrationSource
  rationale: string[]
}

export interface ControlUncertaintySummary {
  fitControlCount: number
  profiledControlCount: number
  fallbackControlCount: number
  pixelSigmaRangePx: [number, number]
  groundSigmaRangeM: [number, number]
  meanPixelSigmaPx: number
  meanGroundSigmaM: number
}

function inferGroundEvidence(control: GeoreferenceControlPoint): GeoreferenceGroundEvidence {
  if (control.groundSource === 'amap-click') return 'amap-poi'
  return 'unknown'
}

export function resolveControlUncertainty(control: GeoreferenceControlPoint): ResolvedControlUncertainty {
  const explicit = control.uncertainty
  const pixelEvidence = explicit?.pixelEvidence ?? 'unknown'
  const inferredGround = inferGroundEvidence(control)
  const groundEvidence = explicit?.groundEvidence ?? inferredGround
  const pixelSigmaPx = explicit?.pixelSigmaPx ?? PIXEL_EVIDENCE_SIGMA_PX[pixelEvidence]
  const groundSigmaM = explicit?.groundSigmaM ?? GROUND_EVIDENCE_SIGMA_M[groundEvidence]

  let calibrationSource: ControlUncertaintyCalibrationSource
  if (explicit?.pixelSigmaPx != null || explicit?.groundSigmaM != null) calibrationSource = 'explicit-sigma'
  else if (explicit?.pixelEvidence != null || explicit?.groundEvidence != null) calibrationSource = 'explicit-evidence'
  else if (inferredGround !== 'unknown') calibrationSource = 'inferred'
  else calibrationSource = 'fallback'

  const rationale: string[] = [
    `pixel ${pixelEvidence} → σ=${pixelSigmaPx.toFixed(2)}px`,
    `ground ${groundEvidence} → σ=${groundSigmaM.toFixed(2)}m`,
  ]
  if (control.groundSource === 'amap-click' && !explicit?.groundEvidence) rationale.push('ground evidence inferred from AMap-linked control')
  if (explicit?.note?.trim()) rationale.push(explicit.note.trim())

  return {
    controlId: control.id,
    pixelEvidence,
    groundEvidence,
    pixelSigmaPx,
    groundSigmaM,
    calibrationSource,
    rationale,
  }
}

export function summarizeControlUncertainty(controls: GeoreferenceControlPoint[]): ControlUncertaintySummary {
  const fitControls = controls.filter((control) => control.role !== 'check')
  const resolved = fitControls.map(resolveControlUncertainty)
  const pixelValues = resolved.map((item) => item.pixelSigmaPx)
  const groundValues = resolved.map((item) => item.groundSigmaM)
  const profiledControlCount = resolved.filter((item) => item.calibrationSource !== 'fallback').length
  if (!resolved.length) {
    return {
      fitControlCount: 0,
      profiledControlCount: 0,
      fallbackControlCount: 0,
      pixelSigmaRangePx: [0, 0],
      groundSigmaRangeM: [0, 0],
      meanPixelSigmaPx: 0,
      meanGroundSigmaM: 0,
    }
  }
  return {
    fitControlCount: resolved.length,
    profiledControlCount,
    fallbackControlCount: resolved.length - profiledControlCount,
    pixelSigmaRangePx: [Math.min(...pixelValues), Math.max(...pixelValues)],
    groundSigmaRangeM: [Math.min(...groundValues), Math.max(...groundValues)],
    meanPixelSigmaPx: pixelValues.reduce((sum, value) => sum + value, 0) / pixelValues.length,
    meanGroundSigmaM: groundValues.reduce((sum, value) => sum + value, 0) / groundValues.length,
  }
}
