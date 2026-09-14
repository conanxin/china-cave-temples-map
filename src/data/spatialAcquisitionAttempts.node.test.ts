import test from 'node:test'
import assert from 'node:assert/strict'
import { spatialSourceAssetById } from './spatialSourceAssets.ts'
import { spatialAcquisitionAttempts } from './spatialAcquisitionAttempts.ts'

test('records the blocked ArcGIS Experience item and data discovery attempts separately', () => {
  const item = spatialAcquisitionAttempts.find((attempt) => attempt.id === 'arcgis-current-experience-item-json')
  const data = spatialAcquisitionAttempts.find((attempt) => attempt.id === 'arcgis-current-experience-data-json')
  assert.ok(item)
  assert.ok(data)
  assert.equal(item?.sourceAssetId, 'unesco-sites-navigator')
  assert.equal(data?.sourceAssetId, 'unesco-sites-navigator')
  assert.equal(item?.status, 'blocked-environment')
  assert.equal(data?.status, 'blocked-environment')
  assert.equal(item?.failureClass, 'dns-resolution')
  assert.equal(data?.failureClass, 'dns-resolution')
  assert.match(item?.url ?? '', /4f1652275d1f4656964b64a20a7346d3\?f=pjson/)
  assert.match(data?.url ?? '', /4f1652275d1f4656964b64a20a7346d3\/data\?f=pjson/)
})

test('records the UNESCO 132728 binary as known-available but blocked by the current retrieval environment', () => {
  const attempt = spatialAcquisitionAttempts.find((item) => item.id === 'unesco-132728-pdf-download')
  assert.ok(attempt)
  assert.equal(attempt?.sourceAssetId, 'unesco-1442-maps-2014')
  assert.equal(attempt?.kind, 'pdf-download')
  assert.equal(attempt?.status, 'blocked-environment')
  assert.equal(attempt?.failureClass, 'content-size-and-dns')
  assert.equal(attempt?.observedSizeBytes, 40_574_291)
  assert.match(attempt?.notes ?? '', /远程源存在/)
})

test('all acquisition attempts resolve to a registered source asset', () => {
  for (const attempt of spatialAcquisitionAttempts) {
    assert.ok(spatialSourceAssetById.has(attempt.sourceAssetId), `${attempt.id}: missing source asset`)
  }
})

test('v0.13 records a fresh 132728 retrieval attempt and points to the resumable pipeline', () => {
  const attempt = spatialAcquisitionAttempts.find((item) => item.id === 'unesco-132728-pdf-download-v013')
  assert.ok(attempt)
  assert.equal(attempt?.sourceAssetId, 'unesco-1442-maps-2014')
  assert.equal(attempt?.kind, 'pdf-download')
  assert.equal(attempt?.status, 'blocked-environment')
  assert.equal(attempt?.failureClass, 'content-size-and-dns')
  assert.equal(attempt?.observedSizeBytes, 40_574_291)
  assert.match(attempt?.nextAction ?? '', /unesco_pdf_pipeline\.py fetch/)
  assert.match(attempt?.nextAction ?? '', /--expected-size 40574291/)
})

test('v0.14 records the failed live HTTP Range probe for the 1GB nomination dossier', () => {
  const attempt = spatialAcquisitionAttempts.find((item) => item.id === 'unesco-1442-nomination-range-probe-v014')
  assert.ok(attempt)
  assert.equal(attempt?.sourceAssetId, 'unesco-1442-nomination-dossier')
  assert.equal(attempt?.kind, 'pdf-range-probe')
  assert.equal(attempt?.status, 'blocked-environment')
  assert.equal(attempt?.failureClass, 'dns-resolution')
  assert.equal(attempt?.observedSizeBytes, 1_018_487_777)
  assert.match(attempt?.nextAction ?? '', /probe-remote/)
})
