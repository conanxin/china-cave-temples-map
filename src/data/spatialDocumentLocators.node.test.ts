import test from 'node:test'
import assert from 'node:assert/strict'
import { sites } from './sites.ts'
import { spatialSourceAssetById } from './spatialSourceAssets.ts'
import { getSpatialDocumentLocatorsForSite, spatialDocumentLocators } from './spatialDocumentLocators.ts'

test('registers nomination dossier page windows for all four UNESCO cave components', () => {
  const expected = new Map<number, Array<[string, number, number]>>([
    [8, [['site-annex', 2233, 2396], ['management-plan', 3788, 3877]]],
    [6, [['site-annex', 2448, 2572], ['management-plan', 3967, 4086]]],
    [5, [['site-annex', 2573, 2711], ['management-plan', 4087, 4243], ['map-page-hint', 4178, 4180]]],
    [27, [['site-annex', 2712, 2773], ['management-plan', 4244, 4307]]],
  ])
  for (const [siteId, rows] of expected) {
    const locators = getSpatialDocumentLocatorsForSite(siteId)
    assert.equal(locators.length, rows.length)
    assert.deepEqual(locators.map((l) => [l.kind, l.startPage, l.endPage]), rows)
  }
})

test('document locators resolve to a real official nomination asset and valid site', () => {
  for (const locator of spatialDocumentLocators) {
    assert.ok(spatialSourceAssetById.has(locator.sourceAssetId), `${locator.id}: source asset missing`)
    assert.ok(sites.some((site) => site.id === locator.siteId), `${locator.id}: site missing`)
    assert.ok(locator.startPage >= 1)
    assert.ok(locator.endPage >= locator.startPage)
    assert.match(locator.evidenceUrl, /^https:\/\//)
  }
})

test('Maijishan buffer map hint is explicitly secondary evidence, not an extracted official map page', () => {
  const hint = spatialDocumentLocators.find((locator) => locator.id === 'nomination-1442-maijishan-buffer-map-hint')
  assert.ok(hint)
  assert.equal(hint?.kind, 'map-page-hint')
  assert.equal(hint?.evidenceTier, 'published-secondary')
  assert.match(hint?.notes ?? '', /4178.*4180/)
  assert.match(hint?.notes ?? '', /不等于.*132728|not.*132728/i)
})
