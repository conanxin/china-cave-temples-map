import test from 'node:test'
import assert from 'node:assert/strict'
import { getAmapPickerCenter } from './amapPicker.ts'
import type { CaveTempleSite } from '../data/types.ts'

const base: CaveTempleSite = {
  id: 1, code: '01', name: '测试', aliases: [], regionGroup: 'north', province: '省', prefecture: '市', county: '县',
  heritageBatch: 1, religion: 'buddhist', siteType: 'cave-temple', mainPeriods: [], siteExtent: 'single', coordinateConfidence: 'unresolved', amapQuery: '测试',
}

test('AMap picker prefers verified parent coordinate, then verified subpoint, then national default', () => {
  assert.deepEqual(getAmapPickerCenter({ ...base, coordinateConfidence: 'verified', lng: 110, lat: 35 }), [110, 35])
  assert.deepEqual(getAmapPickerCenter({ ...base, subpoints: [{ id: '1a', name: 'A', codeSuffix: 'A', role: 'core', lng: 111, lat: 36, coordinateConfidence: 'verified', source: 'x' }] }), [111, 36])
  assert.deepEqual(getAmapPickerCenter(base), [105.5, 35.8])
})
