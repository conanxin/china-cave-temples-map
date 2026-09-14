import test from 'node:test'
import assert from 'node:assert/strict'
import { sites } from '../../data/sites.ts'
import { matchesSearch } from './filterSites.ts'

test('search includes verified component names of composite heritage units', () => {
  const anyue = sites.find((site) => site.id === 28)
  const wenshu = sites.find((site) => site.id === 45)
  assert.ok(anyue)
  assert.ok(wenshu)
  assert.equal(matchesSearch(anyue, '圆觉洞'), true)
  assert.equal(matchesSearch(anyue, '孔雀洞'), true)
  assert.equal(matchesSearch(wenshu, '千佛洞'), true)
})
