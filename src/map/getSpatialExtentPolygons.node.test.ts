import test from 'node:test'
import assert from 'node:assert/strict'
import { getSpatialExtentPolygons } from './getSpatialExtentPolygons.ts'
import type { CaveTempleSite } from '../data/types.ts'

const base: Omit<CaveTempleSite, 'id' | 'code' | 'name' | 'coordinateConfidence'> = {
  aliases: [], regionGroup: 'north', province: '测试省', prefecture: '测试市', county: '测试县',
  heritageBatch: 1, religion: 'buddhist', siteType: 'cave-temple', mainPeriods: [], siteExtent: 'group', amapQuery: '测试',
}

test('renders only audited spatial extents that carry verified polygon geometry', () => {
  const sites: CaveTempleSite[] = [{
    ...base,
    id: 1,
    code: '01',
    name: '测试遗址',
    coordinateConfidence: 'unresolved',
    spatialExtents: [
      {
        id: 'published',
        label: '已发表遗址范围',
        kind: 'published-site-extent',
        geometryStatus: 'verified',
        description: '公开经纬范围。',
        source: '测试来源',
        geometry: {
          type: 'Polygon',
          coordinates: [[[110, 30], [111, 30], [111, 31], [110, 31], [110, 30]]],
        },
      },
      {
        id: 'legal-text',
        label: '法定保护范围',
        kind: 'legal-protection',
        geometryStatus: 'text-only',
        description: '只有四至文字，不能画假边界。',
        source: '测试来源',
      },
    ],
  }]

  assert.deepEqual(getSpatialExtentPolygons(sites), [{
    siteId: 1,
    code: '01',
    siteName: '测试遗址',
    extentId: 'published',
    label: '已发表遗址范围',
    kind: 'published-site-extent',
    path: [[110, 30], [111, 30], [111, 31], [110, 31], [110, 30]],
  }])
})

test('splits verified MultiPolygon geometry into independently renderable AMap polygons', () => {
  const sites: CaveTempleSite[] = [{
    ...base,
    id: 2,
    code: '02',
    name: '多区域遗址',
    coordinateConfidence: 'unresolved',
    spatialExtents: [{
      id: 'multi',
      label: '多区域法定范围',
      kind: 'legal-protection',
      geometryStatus: 'verified',
      description: '两个不相连的保护片区。',
      source: '测试来源',
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          [[[110, 30], [111, 30], [111, 31], [110, 31], [110, 30]]],
          [[[112, 32], [113, 32], [113, 33], [112, 33], [112, 32]]],
        ],
      },
    }],
  }]

  assert.deepEqual(getSpatialExtentPolygons(sites).map(({ extentId, path }) => [extentId, path]), [
    ['multi:1', [[110, 30], [111, 30], [111, 31], [110, 31], [110, 30]]],
    ['multi:2', [[112, 32], [113, 32], [113, 33], [112, 33], [112, 32]]],
  ])
})


test('does not render text-only World Heritage property or buffer evidence as fake polygons', () => {
  const sites: CaveTempleSite[] = [{
    ...base,
    id: 3,
    code: '03',
    name: '世界遗产石窟',
    coordinateConfidence: 'verified',
    lng: 110,
    lat: 30,
    spatialExtents: [
      {
        id: 'wh-property',
        label: '世界遗产遗产区',
        kind: 'world-heritage-property',
        geometryStatus: 'text-only',
        description: '只有 UNESCO 公布的面积和代表坐标，未取得边界几何。',
        source: 'UNESCO World Heritage Centre',
        areaHa: 100,
      },
      {
        id: 'wh-buffer',
        label: '世界遗产缓冲区',
        kind: 'world-heritage-buffer',
        geometryStatus: 'text-only',
        description: '只有面积证据。',
        source: 'UNESCO World Heritage Centre',
        areaHa: 200,
      },
    ],
  }]

  assert.deepEqual(getSpatialExtentPolygons(sites), [])
})
