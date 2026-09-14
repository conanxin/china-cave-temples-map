import test from 'node:test'
import assert from 'node:assert/strict'
import { sourceAssetRetrievalLabel, sourceAssetStatusLabel, sourceAssetTypeLabel } from './spatialSourceAssetPresentation.ts'

test('source asset labels distinguish remote map registration from processed evidence', () => {
  assert.equal(sourceAssetTypeLabel('official-map-pdf'), '官方地图 PDF')
  assert.equal(sourceAssetTypeLabel('official-nomination-pdf' as any), '官方申遗卷宗 PDF')
  assert.equal(sourceAssetTypeLabel('official-geodata-page'), '官方地理数据页')
  assert.equal(sourceAssetTypeLabel('official-gis-platform'), '官方 GIS 平台')
  assert.equal(sourceAssetStatusLabel('georeference-needed'), '待提取 / 配准')
  assert.equal(sourceAssetStatusLabel('text-extracted'), '文字证据已提取')
  assert.equal(sourceAssetStatusLabel('service-discovery-needed'), '待发现边界服务')
  assert.equal(sourceAssetStatusLabel('vector-ready'), '已有可用矢量')
})


test('source asset retrieval labels distinguish remote availability from local materialization', () => {
  assert.equal(sourceAssetRetrievalLabel('not-attempted'), '尚未尝试获取')
  assert.equal(sourceAssetRetrievalLabel('metadata-only'), '仅确认远程元数据')
  assert.equal(sourceAssetRetrievalLabel('download-blocked-environment'), '当前环境下载受阻')
  assert.equal(sourceAssetRetrievalLabel('materialized'), '原始文件已物化')
})
