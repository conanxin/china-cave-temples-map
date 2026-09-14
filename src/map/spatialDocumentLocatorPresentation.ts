import type { SpatialDocumentLocatorKind } from '../data/types.ts'

export function documentLocatorKindLabel(kind: SpatialDocumentLocatorKind) {
  if (kind === 'site-annex') return '申遗站点附件'
  if (kind === 'management-plan') return '管理规划页段'
  return '地图页码线索'
}

export function formatDocumentPageRange(startPage: number, endPage: number) {
  return startPage === endPage ? `p.${startPage}` : `p.${startPage}–${endPage}`
}
