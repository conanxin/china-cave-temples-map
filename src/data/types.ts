export type RegionGroup = 'xinjiang' | 'qingzang' | 'north' | 'south'
export type HeritageBatch = 1 | 2 | 3 | 4 | 5 | '5-supplement' | 6 | 7 | 8
export type CoordinateConfidence = 'verified' | 'probable' | 'unresolved'
export type Religion = 'buddhist' | 'daoist' | 'mixed' | 'other'
export type SiteType = 'cave-temple' | 'cliff-carving' | 'giant-buddha' | 'mixed'
export type SubpointRole = 'core' | 'component' | 'entrance'
export type SpatialExtentKind = 'legal-protection' | 'construction-control' | 'published-site-extent' | 'world-heritage-property' | 'world-heritage-buffer'
export type SpatialGeometryStatus = 'verified' | 'text-only'
export type SpatialEvidenceTier = 'official-primary' | 'institutional-primary' | 'published-secondary'
export type SpatialDerivationMethod = 'official-vector' | 'official-coordinates' | 'georeferenced-official-map' | 'published-bounds' | 'text-only'
export type CoordinateReferenceSystem = 'WGS84' | 'GCJ-02' | 'unknown'

export type SpatialSourceAssetType = 'official-map-pdf' | 'official-nomination-pdf' | 'official-geodata-page' | 'official-protection-document' | 'official-legal-webpage' | 'official-case-webpage' | 'official-vector-dataset' | 'official-gis-platform'
export type SpatialSourceProcessingStatus = 'registered' | 'text-extracted' | 'georeference-needed' | 'service-discovery-needed' | 'vector-ready'
export type SpatialSourceAssetRole = 'coordinate-source' | 'boundary-source' | 'legal-source' | 'context-source'
export type SpatialSourceRetrievalStatus = 'not-attempted' | 'metadata-only' | 'download-blocked-environment' | 'materialized'
export type SpatialAcquisitionAttemptKind = 'arcgis-item-metadata' | 'arcgis-item-data' | 'pdf-download' | 'pdf-range-probe'
export type SpatialAcquisitionAttemptStatus = 'success' | 'blocked-environment' | 'not-found'
export type SpatialAcquisitionFailureClass = 'dns-resolution' | 'content-size-and-dns' | 'http-error' | 'unknown'
export type SpatialServiceProbeKind = 'experience-app' | 'feature-service' | 'map-service' | 'vector-tile-service' | 'unknown'
export type SpatialServiceGeometryType = 'point' | 'polyline' | 'polygon' | 'multipolygon' | 'mixed' | 'unknown'
export type SpatialServiceProbeVerdict = 'confirmed-current-app' | 'rejected-boundary-source' | 'candidate-boundary-service' | 'not-publicly-resolved'
export type SpatialServiceEvidence = 'official-primary' | 'service-metadata' | 'implementation-partner'
export type SpatialBoundaryRouteStatus = 'gis-primary' | 'pdf-fallback-active' | 'vector-ready'

export interface SpatialServiceProbe {
  id: string
  sourceAssetId: string
  title: string
  linkedSiteIds: number[]
  kind: SpatialServiceProbeKind
  geometryType: SpatialServiceGeometryType
  verdict: SpatialServiceProbeVerdict
  evidence: SpatialServiceEvidence
  observedAt: string
  url?: string
  publisher?: string
  serviceItemId?: string
  layerId?: number
  lastEditDate?: string
  notes?: string
  nextAction?: string
}




export interface SpatialAcquisitionAttempt {
  id: string
  sourceAssetId: string
  kind: SpatialAcquisitionAttemptKind
  url: string
  status: SpatialAcquisitionAttemptStatus
  observedAt: string
  failureClass?: SpatialAcquisitionFailureClass
  observedSizeBytes?: number
  notes?: string
  nextAction?: string
}


export type SpatialPdfExtractionStrategy = 'full-download' | 'http-range-targeted'
export type SpatialPdfRangeCapability = 'unknown' | 'range-supported' | 'range-unsupported' | 'blocked-environment'

export interface SpatialPdfExtractionPlan {
  id: string
  sourceAssetId: string
  linkedSiteIds: number[]
  targetLocatorIds: string[]
  priorityLocatorId?: string
  strategy: SpatialPdfExtractionStrategy
  remoteUrl: string
  expectedSizeBytes?: number
  rangeCapability: SpatialPdfRangeCapability
  commandTemplate?: string
  notes?: string
  nextAction?: string
}

export type SpatialDocumentLocatorKind = 'site-annex' | 'management-plan' | 'map-page-hint'

export interface SpatialDocumentLocator {
  id: string
  sourceAssetId: string
  siteId: number
  officialReference: string
  kind: SpatialDocumentLocatorKind
  startPage: number
  endPage: number
  evidenceTier: SpatialEvidenceTier
  evidenceUrl: string
  label: string
  notes?: string
}

export interface SpatialBoundaryRoute {
  id: string
  siteId: number
  officialReference: string
  primarySourceAssetId: string
  fallbackSourceAssetId: string
  status: SpatialBoundaryRouteStatus
  reason: string
  observedAt: string
  nextAction: string
}

export interface SpatialSourceAsset {
  id: string
  title: string
  publisher: string
  url: string
  type: SpatialSourceAssetType
  evidenceTier: SpatialEvidenceTier
  processingStatus: SpatialSourceProcessingStatus
  roles: SpatialSourceAssetRole[]
  linkedSiteIds: number[]
  linkedExtentIds: string[]
  sourceDate?: string
  officialReference?: string
  mimeType?: string
  observedSizeBytes?: number
  directDownloadUrl?: string
  retrievalStatus?: SpatialSourceRetrievalStatus
  retrievalNote?: string
  notes?: string
  nextAction?: string
}


export type SpatialMapPageStatus = 'page-location-needed' | 'page-located' | 'page-extracted'
export type SpatialMapGeoreferenceStatus = 'not-started' | 'control-points-needed' | 'georeferenced'

export interface SpatialMapTarget {
  id: string
  sourceAssetId: string
  siteId: number
  officialReference: string
  linkedExtentIds: string[]
  pageStatus: SpatialMapPageStatus
  georeferenceStatus: SpatialMapGeoreferenceStatus
  pageNumber?: number
  pageLabel?: string
  mapTitle?: string
  scaleText?: string
  crsHint?: string
  notes?: string
  nextAction?: string
}

export interface PolygonGeometry {
  type: 'Polygon'
  coordinates: [number, number][][]
}

export interface MultiPolygonGeometry {
  type: 'MultiPolygon'
  coordinates: [number, number][][][]
}

export interface SiteSpatialExtent {
  id: string
  label: string
  kind: SpatialExtentKind
  componentId?: string
  geometryStatus: SpatialGeometryStatus
  description: string
  source: string
  sourceUrl?: string
  evidenceTier?: SpatialEvidenceTier
  derivation?: SpatialDerivationMethod
  sourceDate?: string
  areaHa?: number
  sourceCrs?: CoordinateReferenceSystem
  targetCrs?: CoordinateReferenceSystem
  officialReference?: string
  verificationNote?: string
  geometry?: PolygonGeometry | MultiPolygonGeometry
}

export interface SiteSubpoint {
  id: string
  name: string
  codeSuffix: string
  role: SubpointRole
  lng: number
  lat: number
  coordinateConfidence: CoordinateConfidence
  source: string
  verificationNote?: string
}

export interface CaveTempleSite {
  id: number
  code: string
  name: string
  aliases: string[]
  regionGroup: RegionGroup
  province: string
  prefecture: string
  county: string
  locality?: string
  heritageBatch: HeritageBatch
  religion: Religion
  siteType: SiteType
  mainPeriods: string[]
  siteExtent: 'single' | 'group'
  lng?: number
  lat?: number
  coordinateConfidence: CoordinateConfidence
  coordinateSource?: string
  verificationNote?: string
  subpoints?: SiteSubpoint[]
  spatialExtents?: SiteSpatialExtent[]
  amapQuery: string
  notes?: string
}

export interface SiteFilters {
  query: string
  regions: RegionGroup[]
  batches: HeritageBatch[]
  types: SiteType[]
  religions: Religion[]
  verifiedOnly: boolean
}
