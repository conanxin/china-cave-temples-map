import type { SpatialDerivationMethod, SpatialEvidenceTier, SpatialExtentKind } from '../data/types.ts'

export function extentKindLabel(kind: SpatialExtentKind) {
  if (kind === 'legal-protection') return '法定保护范围'
  if (kind === 'construction-control') return '建设控制地带'
  if (kind === 'world-heritage-property') return '世界遗产遗产区'
  if (kind === 'world-heritage-buffer') return '世界遗产缓冲区'
  return '已发表遗址分布范围'
}

export function evidenceTierLabel(tier?: SpatialEvidenceTier) {
  if (tier === 'official-primary') return '官方一级来源'
  if (tier === 'institutional-primary') return '机构一级来源'
  if (tier === 'published-secondary') return '公开二手来源'
  return '来源等级未标注'
}


export function derivationLabel(method?: SpatialDerivationMethod) {
  if (method === 'official-vector') return '官方矢量'
  if (method === 'official-coordinates') return '官方坐标 / 面积证据'
  if (method === 'georeferenced-official-map') return '官方图纸配准'
  if (method === 'published-bounds') return '已发表经纬界限'
  if (method === 'text-only') return '文字证据'
  return '推导方式未标注'
}

export function spatialExtentStyle(kind: SpatialExtentKind) {
  if (kind === 'legal-protection') return { strokeColor: '#722e29', fillColor: '#722e29', fillOpacity: 0.1, strokeStyle: 'solid' as const }
  if (kind === 'construction-control') return { strokeColor: '#a2783a', fillColor: '#a2783a', fillOpacity: 0.07, strokeStyle: 'dashed' as const }
  if (kind === 'world-heritage-property') return { strokeColor: '#5d466f', fillColor: '#5d466f', fillOpacity: 0.09, strokeStyle: 'solid' as const }
  if (kind === 'world-heritage-buffer') return { strokeColor: '#8b7897', fillColor: '#8b7897', fillOpacity: 0.055, strokeStyle: 'dashed' as const }
  return { strokeColor: '#4d6875', fillColor: '#4d6875', fillOpacity: 0.08, strokeStyle: 'dashed' as const }
}
