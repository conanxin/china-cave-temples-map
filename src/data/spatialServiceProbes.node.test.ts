import test from 'node:test'
import assert from 'node:assert/strict'
import { spatialSourceAssetById } from './spatialSourceAssets.ts'
import { getSpatialServiceProbesForSite, spatialServiceProbes } from './spatialServiceProbes.ts'

test('tracks UNESCO current Sites Navigator app from the official launch link', () => {
  const probe = spatialServiceProbes.find((item) => item.id === 'unesco-navigator-current-app')
  assert.ok(probe)
  assert.equal(probe?.sourceAssetId, 'unesco-sites-navigator')
  assert.equal(probe?.kind, 'experience-app')
  assert.equal(probe?.geometryType, 'unknown')
  assert.equal(probe?.verdict, 'confirmed-current-app')
  assert.equal(probe?.evidence, 'official-primary')
  assert.match(probe?.url ?? '', /experience\.arcgis\.com\/experience\/4f1652275d1f4656964b64a20a7346d3/)

  const asset = spatialSourceAssetById.get('unesco-sites-navigator')
  assert.match(asset?.url ?? '', /4f1652275d1f4656964b64a20a7346d3/)
  assert.doesNotMatch(asset?.url ?? '', /e3ea9ba6b3484c6dbfeeae10031f964e/)
})

test('rejects the known public UNESCO_0 ArcGIS point layer as a boundary source', () => {
  const probe = spatialServiceProbes.find((item) => item.id === 'unesco-public-points-2021')
  assert.ok(probe)
  assert.equal(probe?.kind, 'feature-service')
  assert.equal(probe?.geometryType, 'point')
  assert.equal(probe?.verdict, 'rejected-boundary-source')
  assert.equal(probe?.serviceItemId, '0c055055666d4c18ac82d5a49a5fab4a')
  assert.equal(probe?.layerId, 0)
  assert.match(probe?.notes ?? '', /esriGeometryPoint/)
})

test('does not promote implementation-partner architecture clues into a public boundary service', () => {
  const probe = spatialServiceProbes.find((item) => item.id === 'unesco-harmonized-layer-clue')
  assert.ok(probe)
  assert.equal(probe?.evidence, 'implementation-partner')
  assert.equal(probe?.verdict, 'not-publicly-resolved')
  assert.equal(probe?.geometryType, 'mixed')
  assert.equal(probe?.url, undefined)
})

test('candidate boundary services must be public polygon or multipolygon endpoints', () => {
  for (const probe of spatialServiceProbes.filter((item) => item.verdict === 'candidate-boundary-service')) {
    assert.ok(probe.url, `${probe.id}: candidate must have a public URL`)
    assert.ok(['polygon', 'multipolygon'].includes(probe.geometryType), `${probe.id}: non-polygon candidate`)
  }
})

test('all service probes resolve to a real source asset and site lookups stay scoped', () => {
  for (const probe of spatialServiceProbes) {
    assert.ok(spatialSourceAssetById.has(probe.sourceAssetId), `${probe.id}: missing source asset`)
  }
  const kizil = getSpatialServiceProbesForSite(8)
  assert.ok(kizil.some((probe) => probe.id === 'unesco-navigator-current-app'))
  assert.ok(kizil.every((probe) => probe.linkedSiteIds.includes(8)))
})

test('rejects accessible public polygon services whose coverage excludes the cultural cave components', () => {
  const probe = spatialServiceProbes.find((item) => item.id === 'wwf-natural-mixed-world-heritage-polygons')
  assert.ok(probe)
  assert.equal(probe?.kind, 'map-service')
  assert.equal(probe?.geometryType, 'polygon')
  assert.equal(probe?.verdict, 'rejected-boundary-source')
  assert.equal(probe?.evidence, 'service-metadata')
  assert.match(probe?.notes ?? '', /Natural and Mixed World Heritage Sites/)
  assert.match(probe?.nextAction ?? '', /不得用于.*文化石窟/)
})

test('rejects EEA Maratlas legacy World Heritage leaves because the published geometry is point', () => {
  const probe = spatialServiceProbes.find((item) => item.id === 'eea-maratlas-world-heritage-points')
  assert.ok(probe)
  assert.equal(probe?.kind, 'map-service')
  assert.equal(probe?.geometryType, 'point')
  assert.equal(probe?.verdict, 'rejected-boundary-source')
  assert.equal(probe?.evidence, 'service-metadata')
  assert.match(probe?.notes ?? '', /esriGeometryPoint/)
})
