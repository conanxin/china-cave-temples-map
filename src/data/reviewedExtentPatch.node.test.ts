import test from 'node:test'
import assert from 'node:assert/strict'
import { applyReviewedExtentPatches } from './reviewedExtentPatch.ts'
import type { CaveTempleSite } from './types.ts'
import type { CanonicalExtentPatch } from '../georef/canonicalExtentPatch.ts'

const sites: CaveTempleSite[] = [{
  id: 5, code: '05', name: '测试石窟', aliases: [], regionGroup: 'north', province: '测试省', prefecture: '测试市', county: '测试县', heritageBatch: 1,
  religion: 'buddhist', siteType: 'cave-temple', mainPeriods: [], siteExtent: 'group', coordinateConfidence: 'unresolved', amapQuery: '测试',
  spatialExtents: [{ id: '05-property', label: '世界遗产区', kind: 'world-heritage-property', geometryStatus: 'text-only', description: '待图件', source: 'UNESCO' }],
}]

function patch(status: 'draft-unreviewed' | 'human-approved'): CanonicalExtentPatch {
  return {
    schemaVersion: 1, patchId: 'patch-1', siteId: 5, siteCode: '05', extentId: '05-property', sourceSessionId: 'session-1', createdAt: '2026-09-13T00:00:00Z',
    reviewStatus: status, sourceMapTargetId: 'map-1', geometryWgs84: { type: 'Polygon', coordinates: [[[100,30],[101,30],[101,31],[100,30]]] },
    geometryGcj02: { type: 'Polygon', coordinates: [[[100.1,30.1],[101.1,30.1],[101.1,31.1],[100.1,30.1]]] },
    qa: { readiness: 'strong', fitRmseM: 1, fitMaxResidualM: 2, fitControlCount: 6, checkControlCount: 2, amapLinkedControlCount: 1, holdoutVerdict: 'pass', holdoutRmseM: 3, looVerdict: 'pass', looRmseM: 4, spatialDistributionScore: 80, spatialDistributionVerdict: 'good', areaVerdict: 'pass', areaDifferencePercent: 1 },
    ...(status === 'human-approved' ? { confirmation: { token: 'APPROVE 05 05-property', confirmedAt: '2026-09-13T01:00:00Z' } } : {}),
  }
}

test('applies only human-approved canonical patches to the matching extent', () => {
  const updated = applyReviewedExtentPatches(sites, [patch('human-approved')])
  const extent = updated[0].spatialExtents![0]
  assert.equal(extent.geometryStatus, 'verified')
  assert.equal(extent.derivation, 'georeferenced-official-map')
  assert.equal(extent.targetCrs, 'GCJ-02')
  assert.deepEqual(extent.geometry, patch('human-approved').geometryGcj02)
  assert.match(extent.verificationNote ?? '', /patch-1/)
})

test('rejects draft patches, missing targets, and overwrite of an already verified extent', () => {
  assert.throws(() => applyReviewedExtentPatches(sites, [patch('draft-unreviewed')]), /human-approved/)
  const missing = { ...patch('human-approved'), extentId: 'missing' }
  assert.throws(() => applyReviewedExtentPatches(sites, [missing]), /extent not found/)
  const verified = structuredClone(sites)
  verified[0].spatialExtents![0].geometryStatus = 'verified'
  verified[0].spatialExtents![0].geometry = patch('human-approved').geometryGcj02
  assert.throws(() => applyReviewedExtentPatches(verified, [patch('human-approved')]), /already verified/)
})
