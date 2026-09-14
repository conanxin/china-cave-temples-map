import type { SpatialDocumentLocator } from './types.ts'

const IIDOS_INDEX = 'https://iidos.cn/RoadApplication/info.aspx?itemid=10236'
const UCL_THESIS = 'https://discovery.ucl.ac.uk/id/eprint/10120562/8/Wang-S_10120562_thesis_sig_removed.pdf'

export const spatialDocumentLocators: SpatialDocumentLocator[] = [
  {
    id: 'nomination-1442-kizil-annex', sourceAssetId: 'unesco-1442-nomination-dossier', siteId: 8,
    officialReference: '1442-025', kind: 'site-annex', startPage: 2233, endPage: 2396,
    evidenceTier: 'institutional-primary', evidenceUrl: IIDOS_INDEX,
    label: 'Kizil Cave-Temple Complex — individual nominated-site annex',
    notes: 'Chinese National Silk Museum IIDOS index records Kizil at p.2233; next indexed component Subash starts at p.2397, so the extraction window is 2233–2396.',
  },
  {
    id: 'nomination-1442-kizil-management', sourceAssetId: 'unesco-1442-nomination-dossier', siteId: 8,
    officialReference: '1442-025', kind: 'management-plan', startPage: 3788, endPage: 3877,
    evidenceTier: 'institutional-primary', evidenceUrl: IIDOS_INDEX,
    label: 'Management Plan for Kizil Cave-Temple Complex',
    notes: 'IIDOS index records management plan start p.3788; next management-plan section begins p.3878.',
  },
  {
    id: 'nomination-1442-bingling-annex', sourceAssetId: 'unesco-1442-nomination-dossier', siteId: 6,
    officialReference: '1442-027', kind: 'site-annex', startPage: 2448, endPage: 2572,
    evidenceTier: 'institutional-primary', evidenceUrl: IIDOS_INDEX,
    label: 'Bingling Cave-Temple Complex — individual nominated-site annex',
    notes: 'IIDOS index records Bingling at p.2448 and Maijishan at p.2573.',
  },
  {
    id: 'nomination-1442-bingling-management', sourceAssetId: 'unesco-1442-nomination-dossier', siteId: 6,
    officialReference: '1442-027', kind: 'management-plan', startPage: 3967, endPage: 4086,
    evidenceTier: 'institutional-primary', evidenceUrl: IIDOS_INDEX,
    label: 'Management Plan for Bingling Cave-Temple Complex',
    notes: 'IIDOS index records management plan start p.3967; Maijishan management plan starts p.4087.',
  },
  {
    id: 'nomination-1442-maijishan-annex', sourceAssetId: 'unesco-1442-nomination-dossier', siteId: 5,
    officialReference: '1442-028', kind: 'site-annex', startPage: 2573, endPage: 2711,
    evidenceTier: 'institutional-primary', evidenceUrl: IIDOS_INDEX,
    label: 'Maijishan Cave-Temple Complex — individual nominated-site annex',
    notes: 'IIDOS index records Maijishan at p.2573 and Bin County at p.2712.',
  },
  {
    id: 'nomination-1442-maijishan-management', sourceAssetId: 'unesco-1442-nomination-dossier', siteId: 5,
    officialReference: '1442-028', kind: 'management-plan', startPage: 4087, endPage: 4243,
    evidenceTier: 'institutional-primary', evidenceUrl: IIDOS_INDEX,
    label: 'Management Plan for Maijishan Cave-Temple Complex',
    notes: 'IIDOS index records management plan start p.4087; Bin County plan starts p.4244.',
  },
  {
    id: 'nomination-1442-maijishan-buffer-map-hint', sourceAssetId: 'unesco-1442-nomination-dossier', siteId: 5,
    officialReference: '1442-028', kind: 'map-page-hint', startPage: 4178, endPage: 4180,
    evidenceTier: 'published-secondary', evidenceUrl: UCL_THESIS,
    label: 'Maijishan buffer-zone map page hint',
    notes: 'UCL thesis cites SACH et al. 2014 pp.4178–4180 for the three-tier Maijishan buffer zone and reproduces Figure 33. This narrows the nomination-dossier scan window only; it does not equal, identify, or locate a page in UNESCO Document 132728.',
  },
  {
    id: 'nomination-1442-bin-annex', sourceAssetId: 'unesco-1442-nomination-dossier', siteId: 27,
    officialReference: '1442-029', kind: 'site-annex', startPage: 2712, endPage: 2773,
    evidenceTier: 'institutional-primary', evidenceUrl: IIDOS_INDEX,
    label: 'Bin County Cave Temple — individual nominated-site annex',
    notes: 'IIDOS index records Bin County Cave Temple at p.2712; Great Wild Goose Pagoda begins p.2774.',
  },
  {
    id: 'nomination-1442-bin-management', sourceAssetId: 'unesco-1442-nomination-dossier', siteId: 27,
    officialReference: '1442-029', kind: 'management-plan', startPage: 4244, endPage: 4307,
    evidenceTier: 'institutional-primary', evidenceUrl: IIDOS_INDEX,
    label: 'Management Plan of Bin County Cave Temple',
    notes: 'IIDOS index records management plan start p.4244; Great Wild Goose Pagoda plan begins p.4308.',
  },
]

export function getSpatialDocumentLocatorsForSite(siteId: number) {
  return spatialDocumentLocators.filter((locator) => locator.siteId === siteId)
}
