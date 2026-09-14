import test from 'node:test'
import assert from 'node:assert/strict'
import { spatialSourceAssetById } from './spatialSourceAssets.ts'
import { spatialBoundaryRoutes } from './spatialBoundaryRoutes.ts'
import { spatialServiceProbes } from './spatialServiceProbes.ts'

const expected = [
  [5, '1442-028'],
  [6, '1442-027'],
  [8, '1442-025'],
  [27, '1442-029'],
] as const

test('activates official-map fallback for all four cave components while public UNESCO polygon service remains unresolved', () => {
  assert.equal(spatialBoundaryRoutes.length, 4)
  for (const [siteId, officialReference] of expected) {
    const route = spatialBoundaryRoutes.find((item) => item.siteId === siteId)
    assert.ok(route, `missing route for site ${siteId}`)
    assert.equal(route?.officialReference, officialReference)
    assert.equal(route?.status, 'pdf-fallback-active')
    assert.equal(route?.primarySourceAssetId, 'unesco-sites-navigator')
    assert.equal(route?.fallbackSourceAssetId, 'unesco-1442-maps-2014')
    assert.ok(spatialSourceAssetById.has(route!.primarySourceAssetId))
    assert.ok(spatialSourceAssetById.has(route!.fallbackSourceAssetId))
    assert.match(route?.reason ?? '', /公开.*Polygon.*未解析/)
  }
})

test('fallback cannot be active if a public candidate boundary service exists', () => {
  const candidates = spatialServiceProbes.filter((probe) => probe.verdict === 'candidate-boundary-service')
  assert.equal(candidates.length, 0)
  assert.ok(spatialBoundaryRoutes.every((route) => route.status === 'pdf-fallback-active'))
})
