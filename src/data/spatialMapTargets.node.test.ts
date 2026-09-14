import test from 'node:test'
import assert from 'node:assert/strict'
import { sites } from './sites.ts'
import { spatialSourceAssetById, spatialSourceAssets } from './spatialSourceAssets.ts'
import { getSpatialMapTargetsForSite, spatialMapTargets } from './spatialMapTargets.ts'

const silkRoadCaveTargets = [
  [5, '1442-028', ['05-wh-property', '05-wh-buffer']],
  [6, '1442-027', ['06-wh-property', '06-wh-buffer']],
  [8, '1442-025', ['08-wh-property', '08-wh-buffer']],
  [27, '1442-029', ['27-wh-property', '27-wh-buffer']],
] as const

test('registers one extraction target per UNESCO cave component in the 2014 official map atlas', () => {
  assert.equal(spatialMapTargets.length, 4)
  for (const [siteId, ref, extentIds] of silkRoadCaveTargets) {
    const targets = getSpatialMapTargetsForSite(siteId)
    assert.equal(targets.length, 1)
    const target = targets[0]
    assert.equal(target.sourceAssetId, 'unesco-1442-maps-2014')
    assert.equal(target.officialReference, ref)
    assert.deepEqual(target.linkedExtentIds, extentIds)
    assert.equal(target.pageStatus, 'page-location-needed')
    assert.equal(target.georeferenceStatus, 'not-started')
    assert.equal(target.pageNumber, undefined)
  }
})

test('all extraction targets resolve to real source assets, sites and extents', () => {
  const extentIds = new Set(sites.flatMap((site) => (site.spatialExtents ?? []).map((extent) => extent.id)))
  for (const target of spatialMapTargets) {
    assert.ok(spatialSourceAssetById.has(target.sourceAssetId), `${target.id}: missing source asset`)
    assert.ok(sites.some((site) => site.id === target.siteId), `${target.id}: missing site`)
    for (const extentId of target.linkedExtentIds) assert.ok(extentIds.has(extentId), `${target.id}: missing extent ${extentId}`)
  }
})

test('registers UNESCO Sites Navigator as an official GIS boundary source that still needs service discovery', () => {
  const navigator = spatialSourceAssets.find((asset) => asset.id === 'unesco-sites-navigator')
  assert.ok(navigator)
  assert.equal(navigator?.type, 'official-gis-platform')
  assert.equal(navigator?.evidenceTier, 'official-primary')
  assert.equal(navigator?.processingStatus, 'service-discovery-needed')
  assert.deepEqual(navigator?.linkedSiteIds, [5, 6, 8, 27])
  assert.match(navigator?.url ?? '', /experience\.arcgis\.com\/experience\/4f1652275d1f4656964b64a20a7346d3/)
})
