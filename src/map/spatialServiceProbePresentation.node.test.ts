import test from 'node:test'
import assert from 'node:assert/strict'
import { serviceEvidenceLabel, serviceGeometryLabel, serviceKindLabel, serviceVerdictLabel } from './spatialServiceProbePresentation.ts'

test('service discovery labels keep app confirmation, geometry and rejection semantics distinct', () => {
  assert.equal(serviceKindLabel('experience-app'), 'ArcGIS Experience 应用')
  assert.equal(serviceKindLabel('feature-service'), 'ArcGIS Feature Service')
  assert.equal(serviceGeometryLabel('point'), '点')
  assert.equal(serviceGeometryLabel('polygon'), 'Polygon')
  assert.equal(serviceVerdictLabel('confirmed-current-app'), '当前官方应用已确认')
  assert.equal(serviceVerdictLabel('rejected-boundary-source'), '已排除为边界源')
  assert.equal(serviceVerdictLabel('not-publicly-resolved'), '公开端点尚未解析')
  assert.equal(serviceEvidenceLabel('official-primary'), '官方一级证据')
  assert.equal(serviceEvidenceLabel('service-metadata'), '服务元数据')
})
