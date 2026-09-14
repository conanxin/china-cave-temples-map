import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveControlUncertainty, summarizeControlUncertainty } from './controlUncertainty.ts'
import type { GeoreferenceControlPoint } from './types.ts'

const base: GeoreferenceControlPoint = {
  id: 'cp-1', role: 'fit', pixel: { x: 100, y: 200 }, ground: { lng: 110, lat: 35 },
}

test('legacy control without evidence preserves v0.27 default uncertainty', () => {
  const resolved = resolveControlUncertainty(base)
  assert.equal(resolved.pixelEvidence, 'unknown')
  assert.equal(resolved.groundEvidence, 'unknown')
  assert.equal(resolved.pixelSigmaPx, 1.5)
  assert.equal(resolved.groundSigmaM, 10)
  assert.equal(resolved.calibrationSource, 'fallback')
})

test('AMap-linked control automatically infers amap-poi ground evidence', () => {
  const resolved = resolveControlUncertainty({
    ...base,
    groundSource: 'amap-click',
    groundSourceCrs: 'GCJ-02',
    groundSourceOriginal: { lng: 110.01, lat: 35.01 },
  })
  assert.equal(resolved.groundEvidence, 'amap-poi')
  assert.equal(resolved.groundSigmaM, 10)
  assert.equal(resolved.calibrationSource, 'inferred')
})

test('evidence categories map to transparent default sigmas', () => {
  const resolved = resolveControlUncertainty({
    ...base,
    uncertainty: {
      pixelEvidence: 'exact-corner',
      groundEvidence: 'official-survey-gis',
    },
  })
  assert.equal(resolved.pixelSigmaPx, 0.7)
  assert.equal(resolved.groundSigmaM, 2)
  assert.equal(resolved.calibrationSource, 'explicit-evidence')
})

test('explicit numeric sigma overrides evidence defaults exactly', () => {
  const resolved = resolveControlUncertainty({
    ...base,
    uncertainty: {
      pixelEvidence: 'fuzzy-feature',
      groundEvidence: 'osm-wikidata',
      pixelSigmaPx: 2.25,
      groundSigmaM: 6.5,
      note: 'surveyed against local control sheet',
    },
  })
  assert.equal(resolved.pixelSigmaPx, 2.25)
  assert.equal(resolved.groundSigmaM, 6.5)
  assert.equal(resolved.calibrationSource, 'explicit-sigma')
  assert.match(resolved.rationale.join(' '), /surveyed against local control sheet/i)
})

test('summary reports heterogeneous uncertainty spread across fit controls', () => {
  const controls: GeoreferenceControlPoint[] = [
    { ...base, id: 'official', uncertainty: { pixelEvidence: 'exact-corner', groundEvidence: 'official-survey-gis' } },
    { ...base, id: 'gps', uncertainty: { pixelEvidence: 'clear-feature', groundEvidence: 'field-gps' } },
    { ...base, id: 'fallback' },
    { ...base, id: 'check', role: 'check', uncertainty: { pixelSigmaPx: 9, groundSigmaM: 99 } },
  ]
  const summary = summarizeControlUncertainty(controls)
  assert.equal(summary.fitControlCount, 3)
  assert.equal(summary.profiledControlCount, 2)
  assert.equal(summary.fallbackControlCount, 1)
  assert.deepEqual(summary.pixelSigmaRangePx, [0.7, 1.5])
  assert.deepEqual(summary.groundSigmaRangeM, [2, 10])
  assert.ok(summary.meanGroundSigmaM > 5 && summary.meanGroundSigmaM < 6)
})
