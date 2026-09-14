import test from 'node:test'
import assert from 'node:assert/strict'
import { documentLocatorKindLabel, formatDocumentPageRange } from './spatialDocumentLocatorPresentation.ts'

test('document locator labels distinguish annex, management plan and map page hints', () => {
  assert.equal(documentLocatorKindLabel('site-annex'), '申遗站点附件')
  assert.equal(documentLocatorKindLabel('management-plan'), '管理规划页段')
  assert.equal(documentLocatorKindLabel('map-page-hint'), '地图页码线索')
  assert.equal(formatDocumentPageRange(4178, 4180), 'p.4178–4180')
  assert.equal(formatDocumentPageRange(2233, 2233), 'p.2233')
})
