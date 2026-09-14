import type { SpatialMapGeoreferenceStatus, SpatialMapPageStatus } from '../data/types.ts'

export function mapPageStatusLabel(status: SpatialMapPageStatus) {
  if (status === 'page-location-needed') return '待定位图页'
  if (status === 'page-located') return '已定位图页'
  return '图页已提取'
}

export function georeferenceStatusLabel(status: SpatialMapGeoreferenceStatus) {
  if (status === 'not-started') return '未开始配准'
  if (status === 'control-points-needed') return '待识别控制点'
  return '已完成配准'
}
