import test from 'node:test'
import assert from 'node:assert/strict'
import { sites } from './sites.ts'

const expectedVerifiedIds = [
  1, 2, 3, 4, 5, 6, 8, 10, 11, 12, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 27, 29, 30, 31, 34, 35, 36, 39, 40, 41, 44, 46, 47, 55, 56, 61, 81, 90,
]

test('contains the complete canonical 01–112 sequence with unique names', () => {
  assert.equal(sites.length, 112)
  assert.deepEqual(sites.map((site) => site.id), Array.from({ length: 112 }, (_, index) => index + 1))
  assert.equal(new Set(sites.map((site) => site.name)).size, 112)
})

test('publishes only the manually audited coordinate set for this milestone', () => {
  const verified = sites.filter((site) => site.coordinateConfidence === 'verified')
  assert.deepEqual(verified.map((site) => site.id), expectedVerifiedIds)

  const coordinateKeys = new Set<string>()
  for (const site of verified) {
    assert.equal(typeof site.lng, 'number', `${site.code} ${site.name}: missing lng`)
    assert.equal(typeof site.lat, 'number', `${site.code} ${site.name}: missing lat`)
    assert.ok(site.lng! >= 73 && site.lng! <= 135, `${site.code} ${site.name}: lng outside China-wide bounds`)
    assert.ok(site.lat! >= 18 && site.lat! <= 54, `${site.code} ${site.name}: lat outside China-wide bounds`)
    assert.ok(site.coordinateSource && (site.coordinateSource.includes('高德地图') || site.coordinateSource.includes('WGS84')), `${site.code} ${site.name}: missing audited source`)
    assert.ok(site.verificationNote && site.verificationNote.length >= 8, `${site.code} ${site.name}: missing verification note`)

    const key = `${site.lng!.toFixed(6)},${site.lat!.toFixed(6)}`
    assert.ok(!coordinateKeys.has(key), `${site.code} ${site.name}: duplicate verified coordinate ${key}`)
    coordinateKeys.add(key)
  }
})

test('keeps current administrative location for 小南海石窟', () => {
  const site = sites.find((item) => item.id === 39)
  assert.equal(site?.county, '龙安区')
  assert.match(site?.amapQuery ?? '', /龙安区/)
})


test('records verified component points without pretending a multi-site unit has one exact coordinate', () => {
  const mati = sites.find((site) => site.id === 32)
  assert.equal(mati?.coordinateConfidence, 'unresolved')
  assert.equal(mati?.lng, undefined)
  assert.deepEqual(mati?.subpoints?.map((point) => [point.id, point.name, point.coordinateConfidence]), [
    ['32-north', '马蹄寺北寺石窟', 'verified'],
  ])

  const shuilianDaxiang = sites.find((site) => site.id === 43)
  assert.equal(shuilianDaxiang?.coordinateConfidence, 'unresolved')
  assert.equal(shuilianDaxiang?.lng, undefined)
  assert.deepEqual(shuilianDaxiang?.subpoints?.map((point) => [point.id, point.name, point.coordinateConfidence]), [
    ['43-shuilian', '水帘洞石窟群', 'verified'],
    ['43-daxiang', '大像山-大佛', 'verified'],
  ])

  const wenshu = sites.find((site) => site.id === 45)
  assert.equal(wenshu?.coordinateConfidence, 'unresolved')
  assert.deepEqual(wenshu?.subpoints?.map((point) => [point.id, point.name, point.coordinateConfidence]), [
    ['45-guanyin', '文殊山石窟观音堂', 'verified'],
    ['45-qianfo', '文殊山千佛洞', 'verified'],
  ])
})


test('expands composite heritage units with audited component markers instead of fake parent centroids', () => {
  const anyue = sites.find((site) => site.id === 28)
  assert.equal(anyue?.coordinateConfidence, 'unresolved')
  assert.equal(anyue?.lng, undefined)
  assert.deepEqual(anyue?.subpoints?.map((point) => [point.id, point.name, point.coordinateConfidence, point.lng, point.lat]), [
    ['28-yuanjue', '圆觉洞', 'verified', 105.346751, 30.087028],
    ['28-kongque', '孔雀洞', 'verified', 105.659446, 29.860819],
  ])

  const wenshu = sites.find((site) => site.id === 45)
  assert.deepEqual(wenshu?.subpoints?.map((point) => [point.id, point.name, point.coordinateConfidence, point.lng, point.lat]), [
    ['45-guanyin', '文殊山石窟观音堂', 'verified', 98.352430, 39.654440],
    ['45-qianfo', '文殊山千佛洞', 'verified', 98.349260, 39.656349],
  ])
})


test('models major composite cave-temple units as groups instead of fake single points', () => {
  const xiangtang = sites.find((site) => site.id === 7)
  assert.equal(xiangtang?.siteExtent, 'group')
  assert.equal(xiangtang?.coordinateConfidence, 'unresolved')
  assert.equal(xiangtang?.lng, undefined)
  assert.equal(xiangtang?.lat, undefined)
  assert.deepEqual(xiangtang?.subpoints?.map((point) => [point.id, point.name, point.codeSuffix, point.coordinateConfidence, point.lng, point.lat]), [
    ['07-north', '北响堂山石窟', 'A', 'verified', 114.161145, 36.533757],
    ['07-south', '南响堂山石窟', 'B', 'verified', 114.196564, 36.426963],
  ])

  const qianfoya = sites.find((site) => site.id === 26)
  assert.equal(qianfoya?.siteExtent, 'group')
  assert.match(qianfoya?.notes ?? '', /龙虎塔/)
  assert.match(qianfoya?.notes ?? '', /九顶塔/)

  const lingquan = sites.find((site) => site.id === 33)
  assert.equal(lingquan?.siteExtent, 'group')
  assert.match(lingquan?.notes ?? '', /宝山/)
  assert.match(lingquan?.notes ?? '', /岚峰山/)
  assert.match(lingquan?.notes ?? '', /马鞍山/)
})

test('v0.6 resolves documented Qiuci cave coordinates without confusing nearby monuments', () => {
  const simsim = sites.find((site) => site.id === 31)
  assert.equal(simsim?.siteExtent, 'group')
  assert.equal(simsim?.coordinateConfidence, 'verified')
  assert.equal(simsim?.lng, 83.166138)
  assert.equal(simsim?.lat, 41.867358)
  assert.match(simsim?.coordinateSource ?? '', /WGS84.*GCJ-02/)
  assert.match(simsim?.verificationNote ?? '', /83°08′31″.*83°09′55″/)

  const kizilgaha = sites.find((site) => site.id === 46)
  assert.equal(kizilgaha?.siteExtent, 'group')
  assert.equal(kizilgaha?.coordinateConfidence, 'verified')
  assert.equal(kizilgaha?.lng, 82.905564)
  assert.equal(kizilgaha?.lat, 41.799507)
  assert.match(kizilgaha?.verificationNote ?? '', /烽燧/)
  assert.match(kizilgaha?.verificationNote ?? '', /82°54′06″.*82°54′15″/)
})

test('v0.6 expands Jinan Qianfoya into the three protected components', () => {
  const qianfoya = sites.find((site) => site.id === 26)
  assert.equal(qianfoya?.coordinateConfidence, 'unresolved')
  assert.deepEqual(qianfoya?.subpoints?.map((point) => [point.id, point.name, point.codeSuffix, point.coordinateConfidence]), [
    ['26-qianfoya', '千佛崖石窟', 'A', 'verified'],
    ['26-longhu', '龙虎塔', 'B', 'verified'],
    ['26-jiuding', '九顶塔', 'C', 'verified'],
  ])
})

test('v0.6 gives Lingquan a verified site-level reference point without pretending it is either named main cave', () => {
  const lingquan = sites.find((site) => site.id === 33)
  assert.equal(lingquan?.coordinateConfidence, 'unresolved')
  assert.deepEqual(lingquan?.subpoints?.map((point) => [point.id, point.name, point.codeSuffix, point.coordinateConfidence]), [
    ['33-core', '灵泉寺石窟核心区参考点', 'A', 'verified'],
  ])
  assert.match(lingquan?.subpoints?.[0]?.verificationNote ?? '', /不等同于大住圣窟或大留圣窟/)
})

test('v0.7 stores legal protection evidence for Qianfoya without inventing polygon geometry', () => {
  const qianfoya = sites.find((site) => site.id === 26)
  const legal = qianfoya?.spatialExtents?.filter((extent) => extent.kind === 'legal-protection') ?? []
  assert.equal(legal.length, 2)
  assert.deepEqual(legal.map((extent) => [extent.id, extent.geometryStatus, extent.componentId]), [
    ['26-qianfoya-legal', 'text-only', '26-qianfoya'],
    ['26-jiuding-legal', 'text-only', '26-jiuding'],
  ])
  assert.ok(legal.every((extent) => extent.geometry == null))
  assert.match(legal[0]?.description ?? '', /殿堂遗址西侧山脚/)
  assert.match(legal[1]?.description ?? '', /方形砖石地面边缘/)
})

test('v0.7 publishes coordinate-bounded archaeological extents for Sumsim and Kizilgaha as non-legal polygons', () => {
  for (const id of [31, 46]) {
    const site = sites.find((item) => item.id === id)
    const extent = site?.spatialExtents?.find((item) => item.kind === 'published-site-extent')
    assert.equal(extent?.geometryStatus, 'verified')
    assert.equal(extent?.geometry?.type, 'Polygon')
    assert.match(extent?.sourceUrl ?? '', /^https:\/\//, `${site.name} verified extent must preserve a traceable source URL`)
    const ring = extent?.geometry?.coordinates[0] ?? []
    assert.equal(ring.length, 5)
    assert.deepEqual(ring[0], ring[ring.length - 1])
    assert.match(extent?.description ?? '', /不是法定保护范围/)

    const lngs = ring.map(([lng]) => lng)
    const lats = ring.map(([, lat]) => lat)
    assert.ok(site?.lng != null && site.lng >= Math.min(...lngs) && site.lng <= Math.max(...lngs))
    assert.ok(site?.lat != null && site.lat >= Math.min(...lats) && site.lat <= Math.max(...lats))
  }
})


test('v0.8 uses official UNESCO representative coordinates for Bingling and Kizil without claiming boundary geometry', () => {
  const bingling = sites.find((site) => site.id === 6)
  assert.equal(bingling?.siteExtent, 'group')
  assert.equal(bingling?.coordinateConfidence, 'verified')
  assert.equal(bingling?.lng, 103.049050)
  assert.equal(bingling?.lat, 35.807717)
  assert.match(bingling?.coordinateSource ?? '', /UNESCO.*WGS84.*GCJ-02/)

  const binglingProperty = bingling?.spatialExtents?.find((extent) => extent.kind === 'world-heritage-property')
  const binglingBuffer = bingling?.spatialExtents?.find((extent) => extent.kind === 'world-heritage-buffer')
  assert.equal(binglingProperty?.areaHa, 132.62)
  assert.equal(binglingBuffer?.areaHa, 2044.37)
  assert.equal(binglingProperty?.geometryStatus, 'text-only')
  assert.equal(binglingProperty?.geometry, undefined)
  assert.equal(binglingBuffer?.geometryStatus, 'text-only')

  const kizil = sites.find((site) => site.id === 8)
  assert.equal(kizil?.siteExtent, 'group')
  assert.equal(kizil?.coordinateConfidence, 'verified')
  assert.equal(kizil?.lng, 82.508386)
  assert.equal(kizil?.lat, 41.785148)
  assert.match(kizil?.coordinateSource ?? '', /UNESCO.*WGS84.*GCJ-02/)
  assert.match(kizil?.notes ?? '', /4个石窟区/)

  const kizilProperty = kizil?.spatialExtents?.find((extent) => extent.kind === 'world-heritage-property')
  const kizilBuffer = kizil?.spatialExtents?.find((extent) => extent.kind === 'world-heritage-buffer')
  assert.equal(kizilProperty?.areaHa, 1798.48)
  assert.equal(kizilBuffer?.areaHa, 9849.17)
  assert.ok(kizil?.spatialExtents?.some((extent) => extent.kind === 'legal-protection' && extent.geometryStatus === 'text-only'))
  assert.ok(kizil?.spatialExtents?.some((extent) => extent.kind === 'construction-control' && extent.geometryStatus === 'text-only'))
})

test('v0.8 preserves official text-only protection evidence for Kumtura while keeping its point unresolved', () => {
  const kumtura = sites.find((site) => site.id === 9)
  assert.equal(kumtura?.siteExtent, 'group')
  assert.equal(kumtura?.coordinateConfidence, 'unresolved')
  assert.equal(kumtura?.lng, undefined)
  assert.equal(kumtura?.lat, undefined)
  assert.match(kumtura?.notes ?? '', /五连洞/)

  const legal = kumtura?.spatialExtents?.find((extent) => extent.kind === 'legal-protection')
  const control = kumtura?.spatialExtents?.find((extent) => extent.kind === 'construction-control')
  assert.equal(legal?.geometryStatus, 'text-only')
  assert.equal(control?.geometryStatus, 'text-only')
  assert.match(legal?.sourceUrl ?? '', /spp\.gov\.cn/)
  assert.match(control?.sourceUrl ?? '', /spp\.gov\.cn/)
  assert.match(legal?.description ?? '', /2009.*保护规划/)
  assert.match(legal?.description ?? '', /2022.*土地权属/)
})

test('v0.8 gives every canonical spatial evidence record explicit provenance metadata', () => {
  const extents = sites.flatMap((site) => site.spatialExtents ?? [])
  assert.ok(extents.length >= 11)
  for (const extent of extents) {
    assert.ok(extent.evidenceTier, `${extent.id}: missing evidenceTier`)
    assert.ok(extent.derivation, `${extent.id}: missing derivation`)
    assert.ok(extent.sourceDate, `${extent.id}: missing sourceDate`)
    assert.ok(extent.sourceUrl?.startsWith('https://'), `${extent.id}: missing traceable https sourceUrl`)
    if (extent.geometryStatus === 'verified') {
      assert.equal(extent.targetCrs, 'GCJ-02', `${extent.id}: verified geometry must declare GCJ-02 target`)
    }
  }
})

test('v0.9 adds UNESCO property and buffer evidence to Maijishan and Bin County Cave Temple', () => {
  const expected = [
    { id: 5, property: 483.71, buffer: 1259.28, ref: 'UNESCO WHC 1442-028' },
    { id: 27, property: 34.68, buffer: 587.26, ref: 'UNESCO WHC 1442-029' },
  ]

  for (const item of expected) {
    const site = sites.find((entry) => entry.id === item.id)
    assert.ok(site)
    const property = site?.spatialExtents?.find((extent) => extent.kind === 'world-heritage-property')
    const buffer = site?.spatialExtents?.find((extent) => extent.kind === 'world-heritage-buffer')
    assert.equal(property?.geometryStatus, 'text-only')
    assert.equal(buffer?.geometryStatus, 'text-only')
    assert.equal(property?.areaHa, item.property)
    assert.equal(buffer?.areaHa, item.buffer)
    assert.equal(property?.officialReference, item.ref)
    assert.equal(buffer?.officialReference, item.ref)
    assert.equal(property?.evidenceTier, 'official-primary')
    assert.equal(buffer?.evidenceTier, 'official-primary')
    assert.ok(property?.geometry == null)
    assert.ok(buffer?.geometry == null)
  }
})
