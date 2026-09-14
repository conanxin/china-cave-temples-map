import test from 'node:test'
import assert from 'node:assert/strict'
import { getGroupRelationLines } from './getGroupRelationLines.ts'
import type { CaveTempleSite } from '../data/types.ts'

const base: Omit<CaveTempleSite, 'id' | 'code' | 'name' | 'coordinateConfidence'> = {
  aliases: [], regionGroup: 'north', province: '测试省', prefecture: '测试市', county: '测试县',
  heritageBatch: 1, religion: 'buddhist', siteType: 'cave-temple', mainPeriods: [], siteExtent: 'group', amapQuery: '测试',
}

test('relation lines are produced only for group sites with at least two verified display points', () => {
  const sites: CaveTempleSite[] = [
    {
      ...base, id: 1, code: '01', name: '两点遗址群', coordinateConfidence: 'unresolved',
      subpoints: [
        { id: '1a', name: 'A', codeSuffix: 'A', role: 'component', lng: 110, lat: 30, coordinateConfidence: 'verified', source: 'x' },
        { id: '1b', name: 'B', codeSuffix: 'B', role: 'component', lng: 111, lat: 31, coordinateConfidence: 'verified', source: 'x' },
      ],
    },
    {
      ...base, id: 2, code: '02', name: '一点遗址群', coordinateConfidence: 'unresolved',
      subpoints: [
        { id: '2a', name: 'A', codeSuffix: 'A', role: 'component', lng: 112, lat: 32, coordinateConfidence: 'verified', source: 'x' },
      ],
    },
    { ...base, id: 3, code: '03', name: '单体', siteExtent: 'single', coordinateConfidence: 'verified', lng: 113, lat: 33 },
  ]

  assert.deepEqual(getGroupRelationLines(sites), [
    { siteId: 1, code: '01', name: '两点遗址群', path: [[110, 30], [111, 31]] },
  ])
})

test('a verified parent representative point can participate in a group relation line with verified subpoints', () => {
  const sites: CaveTempleSite[] = [{
    ...base, id: 1, code: '01', name: '有父级代表点', coordinateConfidence: 'verified', lng: 110, lat: 30,
    subpoints: [
      { id: '1a', name: 'A', codeSuffix: 'A', role: 'component', lng: 111, lat: 31, coordinateConfidence: 'verified', source: 'x' },
    ],
  }]
  assert.deepEqual(getGroupRelationLines(sites)[0]?.path, [[110, 30], [111, 31]])
})
