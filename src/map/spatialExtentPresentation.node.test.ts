import test from 'node:test'
import assert from 'node:assert/strict'
import { derivationLabel, evidenceTierLabel, extentKindLabel, spatialExtentStyle } from './spatialExtentPresentation.ts'

test('labels World Heritage and provenance evidence without conflating it with domestic legal protection', () => {
  assert.equal(extentKindLabel('world-heritage-property'), '世界遗产遗产区')
  assert.equal(extentKindLabel('world-heritage-buffer'), '世界遗产缓冲区')
  assert.equal(extentKindLabel('legal-protection'), '法定保护范围')
  assert.equal(evidenceTierLabel('official-primary'), '官方一级来源')
  assert.equal(evidenceTierLabel('published-secondary'), '公开二手来源')
  assert.equal(derivationLabel('official-coordinates'), '官方坐标 / 面积证据')
  assert.equal(derivationLabel('text-only'), '文字证据')
})

test('assigns distinct map styles to World Heritage property and buffer polygons', () => {
  const property = spatialExtentStyle('world-heritage-property')
  const buffer = spatialExtentStyle('world-heritage-buffer')
  assert.notEqual(property.strokeColor, buffer.strokeColor)
  assert.equal(property.strokeStyle, 'solid')
  assert.equal(buffer.strokeStyle, 'dashed')
})
