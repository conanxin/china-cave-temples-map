import type { SpatialPdfExtractionPlan } from './types.ts'

const NOMINATION_LOCATORS = [
  'nomination-1442-kizil-annex',
  'nomination-1442-kizil-management',
  'nomination-1442-bingling-annex',
  'nomination-1442-bingling-management',
  'nomination-1442-maijishan-annex',
  'nomination-1442-maijishan-management',
  'nomination-1442-maijishan-buffer-map-hint',
  'nomination-1442-bin-annex',
  'nomination-1442-bin-management',
]

export const spatialPdfExtractionPlans: SpatialPdfExtractionPlan[] = [
  {
    id: 'unesco-1442-nomination-http-range',
    sourceAssetId: 'unesco-1442-nomination-dossier',
    linkedSiteIds: [5, 6, 8, 27],
    targetLocatorIds: NOMINATION_LOCATORS,
    priorityLocatorId: 'nomination-1442-maijishan-buffer-map-hint',
    strategy: 'http-range-targeted',
    remoteUrl: 'https://whc.unesco.org/uploads/nominations/1442.pdf',
    expectedSizeBytes: 1_018_487_777,
    rangeCapability: 'blocked-environment',
    commandTemplate: 'python scripts/unesco_pdf_pipeline.py extract-remote https://whc.unesco.org/uploads/nominations/1442.pdf 4178,4179,4180 artifacts/unesco/nomination-1442/maijishan-buffer --expected-size 1018487777 --max-fetch-bytes 268435456',
    notes: 'UNESCO 原始申遗卷宗约 1.018 GB。v0.14 新增 seekable HTTP Range reader，可让 pypdf 在支持 byte-range 的服务器上按需随机读取对象并只写出目标页，避免整卷下载。当前 container 对 whc.unesco.org 仍受 DNS 解析阻断，因此 Range 支持尚未在 UNESCO 远端实测成功；本地 Range 模拟服务器已覆盖探测与定向页抽取。',
    nextAction: '在可访问 UNESCO 的环境先运行 probe-remote；若 acceptRanges=true，优先抽取麦积山 p.4178–4180，再按 IIDOS 记录的管理规划页段逐站缩小地图页。',
  },
]

export function getSpatialPdfExtractionPlansForSite(siteId: number) {
  return spatialPdfExtractionPlans.filter((plan) => plan.linkedSiteIds.includes(siteId))
}
