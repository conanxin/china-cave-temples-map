export interface PixelPoint {
  x: number
  y: number
}

export interface GroundPoint {
  lng: number
  lat: number
}

export type GeoreferenceControlRole = 'fit' | 'check'
export type GeoreferenceGroundSource = 'manual' | 'amap-click'
export type GeoreferenceGroundSourceCrs = 'WGS84' | 'GCJ-02'

export type GeoreferencePixelEvidence = 'exact-corner' | 'clear-feature' | 'fuzzy-feature' | 'approximate-zone' | 'unknown'
export type GeoreferenceGroundEvidence = 'official-survey-gis' | 'field-gps' | 'official-coordinate' | 'amap-poi' | 'manual-crosscheck' | 'osm-wikidata' | 'unknown'
export type GeoreferenceCalibrationBasis = 'metadata' | 'measured' | 'heuristic' | 'manual-override'
export type GeoreferenceUncertaintyReviewStatus = 'unreviewed' | 'reviewed'

export interface GeoreferenceControlUncertainty {
  pixelEvidence?: GeoreferencePixelEvidence
  groundEvidence?: GeoreferenceGroundEvidence
  pixelSigmaPx?: number
  groundSigmaM?: number
  evidenceRef?: string
  evidenceDate?: string
  calibrationBasis?: GeoreferenceCalibrationBasis
  reviewStatus?: GeoreferenceUncertaintyReviewStatus
  reviewedAt?: string
  note?: string
}

export interface GeoreferenceControlPoint {
  id: string
  label?: string
  role?: GeoreferenceControlRole
  pixel: PixelPoint
  ground: GroundPoint
  groundSource?: GeoreferenceGroundSource
  groundSourceCrs?: GeoreferenceGroundSourceCrs
  groundSourceOriginal?: GroundPoint
  uncertainty?: GeoreferenceControlUncertainty
}

export type GeoreferenceMethod = 'affine' | 'projective'

export interface AffineModel {
  kind: 'affine'
  params: [number, number, number, number, number, number]
}

export interface ProjectiveModel {
  kind: 'projective'
  params: [number, number, number, number, number, number, number, number]
}

export type GeoreferenceTransformModel = AffineModel | ProjectiveModel

export interface GeoreferenceQaThresholds {
  passRmseM: number
  passMaxM: number
  reviewRmseM: number
  reviewMaxM: number
}

export type GeoreferenceQaVerdict = 'pass' | 'review' | 'fail'

export interface GeoreferenceResidual {
  controlId: string
  predicted: GroundPoint
  deltaLng: number
  deltaLat: number
  residualM: number
}

export interface GeoreferenceFitResult {
  model: GeoreferenceTransformModel
  residuals: GeoreferenceResidual[]
  rmseM: number
  maxResidualM: number
  verdict: GeoreferenceQaVerdict
  thresholds: GeoreferenceQaThresholds
}

export interface GeoreferenceSession {
  schemaVersion: 1
  id: string
  targetId?: string
  siteId?: number
  boundaryExtentId?: string
  imageName?: string
  imageWidth?: number
  imageHeight?: number
  method: GeoreferenceMethod
  controls: GeoreferenceControlPoint[]
  boundaryPixels: PixelPoint[]
  qaThresholds: GeoreferenceQaThresholds
  createdAt: string
  updatedAt: string
}

export interface GeoreferenceHoldoutQa {
  count: number
  residuals: GeoreferenceResidual[]
  rmseM: number
  maxResidualM: number
  verdict: GeoreferenceQaVerdict
}

export type GeoreferenceLeaveOneOut =
  | { available: false; reason: string }
  | {
      available: true
      residuals: GeoreferenceResidual[]
      rmseM: number
      maxResidualM: number
      verdict: GeoreferenceQaVerdict
    }

export type GeoreferenceSpatialDistribution =
  | { available: false; reason: string }
  | {
      available: true
      score: number
      xSpanRatio: number
      ySpanRatio: number
      hullAreaRatio: number
      verdict: 'good' | 'review' | 'poor'
    }

export interface GeoreferenceAdvancedQaResult {
  fit: GeoreferenceFitResult & { fitControlCount: number; checkControlCount: number }
  holdout?: GeoreferenceHoldoutQa
  leaveOneOut: GeoreferenceLeaveOneOut
  spatialDistribution: GeoreferenceSpatialDistribution
}

export interface GeoreferenceAreaComparison {
  computedAreaHa: number
  officialAreaHa: number
  differenceHa: number
  differencePercent: number
  verdict: GeoreferenceQaVerdict
}
