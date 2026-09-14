import type { SpatialSourceAssetType, SpatialSourceProcessingStatus, SpatialSourceRetrievalStatus } from '../data/types.ts'

export function sourceAssetTypeLabel(type: SpatialSourceAssetType) {
  if (type === 'official-map-pdf') return '官方地图 PDF'
  if (type === 'official-nomination-pdf') return '官方申遗卷宗 PDF'
  if (type === 'official-geodata-page') return '官方地理数据页'
  if (type === 'official-protection-document') return '官方保护规划 / 范围文件'
  if (type === 'official-gis-platform') return '官方 GIS 平台'
  if (type === 'official-legal-webpage') return '官方法规网页'
  if (type === 'official-case-webpage') return '官方案例网页'
  return '官方矢量数据'
}

export function sourceAssetStatusLabel(status: SpatialSourceProcessingStatus) {
  if (status === 'registered') return '已登记'
  if (status === 'text-extracted') return '文字证据已提取'
  if (status === 'georeference-needed') return '待提取 / 配准'
  if (status === 'service-discovery-needed') return '待发现边界服务'
  return '已有可用矢量'
}


export function sourceAssetRetrievalLabel(status: SpatialSourceRetrievalStatus) {
  if (status === 'not-attempted') return '尚未尝试获取'
  if (status === 'metadata-only') return '仅确认远程元数据'
  if (status === 'download-blocked-environment') return '当前环境下载受阻'
  return '原始文件已物化'
}
