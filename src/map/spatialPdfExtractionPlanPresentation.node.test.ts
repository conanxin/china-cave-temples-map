import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPdfTargetCommand, pdfExtractionStrategyLabel, pdfRangeCapabilityLabel } from './spatialPdfExtractionPlanPresentation.ts'

test('v0.14 labels targeted remote extraction plans clearly', () => {
  assert.equal(pdfExtractionStrategyLabel('http-range-targeted'), 'HTTP Range 定向抽页')
  assert.equal(pdfExtractionStrategyLabel('full-download'), '整卷下载后抽页')
  assert.equal(pdfRangeCapabilityLabel('blocked-environment'), '当前环境无法探测 Range')
  assert.equal(pdfRangeCapabilityLabel('range-supported'), '服务器支持 HTTP Range')
})


test('builds a site-specific extract-target command rather than reusing the global priority command', () => {
  assert.equal(
    buildPdfTargetCommand('nomination-1442-kizil-management', 'artifacts/unesco/nomination-1442/site-08'),
    'python scripts/unesco_pdf_pipeline.py extract-target scripts/unesco_1442_targets.json nomination-1442-kizil-management artifacts/unesco/nomination-1442/site-08 --max-fetch-bytes 268435456',
  )
})
