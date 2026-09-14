import test from 'node:test'
import assert from 'node:assert/strict'
import { spatialDocumentLocators } from './spatialDocumentLocators.ts'
import { spatialPdfExtractionPlans, getSpatialPdfExtractionPlansForSite } from './spatialPdfExtractionPlans.ts'
import { spatialSourceAssetById } from './spatialSourceAssets.ts'

test('v0.14 defines a targeted HTTP Range extraction plan for the 1GB UNESCO nomination dossier', () => {
  const plan = spatialPdfExtractionPlans.find((item) => item.id === 'unesco-1442-nomination-http-range')
  assert.ok(plan)
  assert.equal(plan?.sourceAssetId, 'unesco-1442-nomination-dossier')
  assert.equal(plan?.strategy, 'http-range-targeted')
  assert.equal(plan?.expectedSizeBytes, 1_018_487_777)
  assert.equal(plan?.rangeCapability, 'blocked-environment')
  assert.equal(plan?.priorityLocatorId, 'nomination-1442-maijishan-buffer-map-hint')
  assert.match(plan?.commandTemplate ?? '', /extract-remote/)
  assert.match(plan?.commandTemplate ?? '', /4178,4179,4180/)
})

test('every extraction plan resolves to real source assets and locator ids', () => {
  const locatorIds = new Set(spatialDocumentLocators.map((item) => item.id))
  for (const plan of spatialPdfExtractionPlans) {
    assert.ok(spatialSourceAssetById.has(plan.sourceAssetId), `${plan.id}: missing source asset`)
    for (const locatorId of plan.targetLocatorIds) {
      assert.ok(locatorIds.has(locatorId), `${plan.id}: missing locator ${locatorId}`)
    }
    if (plan.priorityLocatorId) assert.ok(locatorIds.has(plan.priorityLocatorId))
  }
})

test('the nomination extraction plan is discoverable from all four target cave sites', () => {
  for (const siteId of [5, 6, 8, 27]) {
    const plans = getSpatialPdfExtractionPlansForSite(siteId)
    assert.ok(plans.some((plan) => plan.id === 'unesco-1442-nomination-http-range'), `site ${siteId}`)
  }
})
