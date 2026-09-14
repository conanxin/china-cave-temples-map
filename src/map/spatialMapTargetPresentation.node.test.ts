import test from 'node:test'
import assert from 'node:assert/strict'
import { georeferenceStatusLabel, mapPageStatusLabel } from './spatialMapTargetPresentation.ts'

test('map extraction target labels distinguish page discovery from georeferencing', () => {
  assert.equal(mapPageStatusLabel('page-location-needed'), '待定位图页')
  assert.equal(mapPageStatusLabel('page-located'), '已定位图页')
  assert.equal(mapPageStatusLabel('page-extracted'), '图页已提取')
  assert.equal(georeferenceStatusLabel('not-started'), '未开始配准')
  assert.equal(georeferenceStatusLabel('control-points-needed'), '待识别控制点')
  assert.equal(georeferenceStatusLabel('georeferenced'), '已完成配准')
})
