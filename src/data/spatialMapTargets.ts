import type { SpatialMapTarget } from './types.ts'

export const spatialMapTargets: SpatialMapTarget[] = [
  {
    id: 'unesco-1442-028-map',
    sourceAssetId: 'unesco-1442-maps-2014',
    siteId: 5,
    officialReference: '1442-028',
    linkedExtentIds: ['05-wh-property', '05-wh-buffer'],
    pageStatus: 'page-location-needed',
    georeferenceStatus: 'not-started',
    mapTitle: 'Maijishan Cave-Temple Complex',
    notes: '目标是从 UNESCO Document 132728 中定位麦积山组成遗产的正式 inscribed property / buffer map。当前尚未取得可核验页码。',
    nextAction: '定位图页；记录图号、比例尺、坐标格网和图例；只有控制点充分时才进入配准。',
  },
  {
    id: 'unesco-1442-027-map',
    sourceAssetId: 'unesco-1442-maps-2014',
    siteId: 6,
    officialReference: '1442-027',
    linkedExtentIds: ['06-wh-property', '06-wh-buffer'],
    pageStatus: 'page-location-needed',
    georeferenceStatus: 'not-started',
    mapTitle: 'Bingling Cave-Temple Complex',
    notes: '目标是提取炳灵寺世界遗产区与缓冲区的官方图页，而不是依据面积或代表点反推边界。',
    nextAction: '定位图页并检查是否存在坐标格网、角点坐标或足够稳定的地物控制点。',
  },
  {
    id: 'unesco-1442-025-map',
    sourceAssetId: 'unesco-1442-maps-2014',
    siteId: 8,
    officialReference: '1442-025',
    linkedExtentIds: ['08-wh-property', '08-wh-buffer'],
    pageStatus: 'page-location-needed',
    georeferenceStatus: 'not-started',
    mapTitle: 'Kizil Cave-Temple Complex',
    notes: '克孜尔已有 UNESCO 官方代表坐标和面积证据，但世界遗产区 / 缓冲区边界仍须从官方图页或官方 GIS 获取。',
    nextAction: '优先定位克孜尔图页；与 UNESCO Sites Navigator 中同一组成遗产的官方边界可用性进行交叉检查。',
  },
  {
    id: 'unesco-1442-029-map',
    sourceAssetId: 'unesco-1442-maps-2014',
    siteId: 27,
    officialReference: '1442-029',
    linkedExtentIds: ['27-wh-property', '27-wh-buffer'],
    pageStatus: 'page-location-needed',
    georeferenceStatus: 'not-started',
    mapTitle: 'Bin County Cave Temple',
    notes: '目标是定位彬县大佛寺组成遗产的官方 property / buffer 图页。',
    nextAction: '定位图页，记录比例尺和控制点条件；避免用景区边界替代世界遗产边界。',
  },
]

export function getSpatialMapTargetsForSite(siteId: number) {
  return spatialMapTargets.filter((target) => target.siteId === siteId)
}

export const spatialMapTargetById = new Map(spatialMapTargets.map((target) => [target.id, target]))
