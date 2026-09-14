import test from 'node:test'
import assert from 'node:assert/strict'
import { getSpatialSourceAssetsForSite, spatialSourceAssets } from './spatialSourceAssets.ts'

test('source asset registry has unique ids and traceable URLs', () => {
  assert.equal(new Set(spatialSourceAssets.map((asset) => asset.id)).size, spatialSourceAssets.length)
  for (const asset of spatialSourceAssets) {
    assert.match(asset.url, /^https:\/\//)
    assert.ok(asset.publisher.length > 0)
    assert.ok(asset.roles.length > 0)
    assert.ok(asset.linkedSiteIds.length > 0)
  }
})

test('registers the official UNESCO 1442 maps PDF as a pending boundary source for all four wall-map cave components', () => {
  const asset = spatialSourceAssets.find((item) => item.id === 'unesco-1442-maps-2014')
  assert.ok(asset)
  assert.equal(asset?.type, 'official-map-pdf')
  assert.equal(asset?.evidenceTier, 'official-primary')
  assert.equal(asset?.processingStatus, 'georeference-needed')
  assert.equal(asset?.officialReference, 'UNESCO WHC Document 132728')
  assert.deepEqual(asset?.linkedSiteIds, [5, 6, 8, 27])
  assert.equal(asset?.directDownloadUrl, 'https://whc.unesco.org/document/132728')
  assert.equal(asset?.retrievalStatus, 'download-blocked-environment')
  assert.equal(asset?.observedSizeBytes, 40_574_291)
  assert.match(asset?.retrievalNote ?? '', /40,574,291|40574291/)
})

test('site lookup returns only assets linked to that site', () => {
  const maijishan = getSpatialSourceAssetsForSite(5)
  assert.ok(maijishan.some((asset) => asset.id === 'unesco-1442-maps-2014'))
  assert.ok(maijishan.some((asset) => asset.id === 'unesco-1442-geodata'))
  assert.ok(maijishan.every((asset) => asset.linkedSiteIds.includes(5)))

  const qianfoya = getSpatialSourceAssetsForSite(26)
  assert.ok(qianfoya.some((asset) => asset.id === 'shandong-2022-protection-boundaries'))
  assert.ok(qianfoya.every((asset) => asset.linkedSiteIds.includes(26)))
})

import { sites } from './sites.ts'

test('every source-asset extent link resolves to a real extent on one of its linked sites', () => {
  for (const asset of spatialSourceAssets) {
    const linkedSites = sites.filter((site) => asset.linkedSiteIds.includes(site.id))
    const extentIds = new Set(linkedSites.flatMap((site) => (site.spatialExtents ?? []).map((extent) => extent.id)))
    for (const extentId of asset.linkedExtentIds) {
      assert.ok(extentIds.has(extentId), `${asset.id}: dangling linked extent ${extentId}`)
    }
  }
})

test('official map PDFs cannot claim vector-ready until a usable vector or georeferenced geometry exists', () => {
  for (const asset of spatialSourceAssets.filter((item) => item.type === 'official-map-pdf')) {
    assert.notEqual(asset.processingStatus, 'vector-ready')
    assert.ok(asset.nextAction?.length)
  }
})
