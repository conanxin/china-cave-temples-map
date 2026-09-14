import test from 'node:test'
import assert from 'node:assert/strict'
import { boundaryRouteStatusLabel } from './spatialBoundaryRoutePresentation.ts'

test('labels boundary acquisition route states for the research UI', () => {
  assert.equal(boundaryRouteStatusLabel('gis-primary'), '优先 GIS 路线')
  assert.equal(boundaryRouteStatusLabel('pdf-fallback-active'), '官方地图回退已启用')
  assert.equal(boundaryRouteStatusLabel('vector-ready'), '已有可发布矢量')
})
