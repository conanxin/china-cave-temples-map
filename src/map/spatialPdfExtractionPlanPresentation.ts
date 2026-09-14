import type { SpatialPdfExtractionStrategy, SpatialPdfRangeCapability } from '../data/types.ts'

export function pdfExtractionStrategyLabel(strategy: SpatialPdfExtractionStrategy) {
  return strategy === 'http-range-targeted' ? 'HTTP Range 定向抽页' : '整卷下载后抽页'
}

export function pdfRangeCapabilityLabel(status: SpatialPdfRangeCapability) {
  if (status === 'range-supported') return '服务器支持 HTTP Range'
  if (status === 'range-unsupported') return '服务器不支持 HTTP Range'
  if (status === 'blocked-environment') return '当前环境无法探测 Range'
  return 'Range 能力尚未探测'
}


export function buildPdfTargetCommand(targetId: string, outputDir: string) {
  return `python scripts/unesco_pdf_pipeline.py extract-target scripts/unesco_1442_targets.json ${targetId} ${outputDir} --max-fetch-bytes 268435456`
}
