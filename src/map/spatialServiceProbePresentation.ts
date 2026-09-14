import type { SpatialServiceEvidence, SpatialServiceGeometryType, SpatialServiceProbeKind, SpatialServiceProbeVerdict } from '../data/types.ts'

export function serviceKindLabel(kind: SpatialServiceProbeKind) {
  if (kind === 'experience-app') return 'ArcGIS Experience 应用'
  if (kind === 'feature-service') return 'ArcGIS Feature Service'
  if (kind === 'map-service') return 'ArcGIS Map Service'
  if (kind === 'vector-tile-service') return '矢量瓦片服务'
  return '服务类型待解析'
}

export function serviceGeometryLabel(type: SpatialServiceGeometryType) {
  if (type === 'point') return '点'
  if (type === 'polyline') return '折线'
  if (type === 'polygon') return 'Polygon'
  if (type === 'multipolygon') return 'MultiPolygon'
  if (type === 'mixed') return '混合 / 待拆解'
  return '几何类型未知'
}

export function serviceVerdictLabel(verdict: SpatialServiceProbeVerdict) {
  if (verdict === 'confirmed-current-app') return '当前官方应用已确认'
  if (verdict === 'rejected-boundary-source') return '已排除为边界源'
  if (verdict === 'candidate-boundary-service') return '边界服务候选'
  return '公开端点尚未解析'
}

export function serviceEvidenceLabel(evidence: SpatialServiceEvidence) {
  if (evidence === 'official-primary') return '官方一级证据'
  if (evidence === 'service-metadata') return '服务元数据'
  return '实施伙伴线索'
}
