import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spatialDocumentLocators } from './spatialDocumentLocators.ts'

interface ManifestTarget { id: string; siteId: number; officialReference: string; kind: string; startPage: number; endPage: number }

test('Python extraction manifest stays in lockstep with canonical document locators', () => {
  const manifest = JSON.parse(readFileSync(new URL('../../scripts/unesco_1442_targets.json', import.meta.url), 'utf8')) as { expectedSizeBytes: number; targets: ManifestTarget[] }
  assert.equal(manifest.expectedSizeBytes, 1_018_487_777)
  assert.deepEqual(
    manifest.targets.map((item) => [item.id, item.siteId, item.officialReference, item.kind, item.startPage, item.endPage]),
    spatialDocumentLocators.map((item) => [item.id, item.siteId, item.officialReference, item.kind, item.startPage, item.endPage]),
  )
})
