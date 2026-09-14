import test from 'node:test'
import assert from 'node:assert/strict'
import { analyzeUncertainCheckHoldout } from './checkUncertainty.ts'
import { fitTransform } from './fitTransform.ts'
import type { GeoreferenceControlPoint, GeoreferenceSession } from './types.ts'

function affineGround(x: number, y: number) {
  return { lng: 110 + x * 0.00001, lat: 30 + y * 0.00001 }
}

function offsetEast(point: { lng: number; lat: number }, meters: number) {
  return { lng: point.lng + meters / (111_320 * Math.cos(point.lat * Math.PI / 180)), lat: point.lat }
}

function baseSession(checks: GeoreferenceControlPoint[]): GeoreferenceSession {
  return {
    schemaVersion: 1,
    id: 'uncertain-checks',
    method: 'affine',
    imageWidth: 1000,
    imageHeight: 1000,
    controls: [
      { id: 'f1', role: 'fit', pixel: { x: 0, y: 0 }, ground: affineGround(0, 0) },
      { id: 'f2', role: 'fit', pixel: { x: 1000, y: 0 }, ground: affineGround(1000, 0) },
      { id: 'f3', role: 'fit', pixel: { x: 0, y: 1000 }, ground: affineGround(0, 1000) },
      { id: 'f4', role: 'fit', pixel: { x: 1000, y: 1000 }, ground: affineGround(1000, 1000) },
      ...checks,
    ],
    boundaryPixels: [],
    qaThresholds: { passRmseM: 25, passMaxM: 50, reviewRmseM: 75, reviewMaxM: 150 },
    createdAt: '2026-09-14T04:30:00.000Z',
    updatedAt: '2026-09-14T04:30:00.000Z',
  }
}

test('same raw residual is interpreted differently for precise and uncertain check evidence', () => {
  const p1 = affineGround(250, 250)
  const p2 = affineGround(750, 750)
  const session = baseSession([
    { id: 'official', role: 'check', pixel: { x: 250, y: 250 }, ground: offsetEast(p1, 20), uncertainty: { pixelSigmaPx: 0, groundEvidence: 'official-survey-gis' } },
    { id: 'secondary', role: 'check', pixel: { x: 750, y: 750 }, ground: offsetEast(p2, 20), uncertainty: { pixelSigmaPx: 0, groundEvidence: 'osm-wikidata' } },
  ])
  const model = fitTransform('affine', session.controls.filter((control) => control.role !== 'check'))
  const result = analyzeUncertainCheckHoldout(session, model)
  assert.equal(result.available, true)
  if (!result.available) return
  const official = result.checks.find((item) => item.controlId === 'official')!
  const secondary = result.checks.find((item) => item.controlId === 'secondary')!
  assert.ok(Math.abs(official.residualM - secondary.residualM) < 0.2)
  assert.ok(official.standardizedResidual > secondary.standardizedResidual * 4)
  assert.equal(official.interpretation, 'inconsistent')
  assert.equal(secondary.interpretation, 'compatible')
})

test('check uncertainty never changes fitted model parameters', () => {
  const point = affineGround(500, 500)
  const low = baseSession([{ id: 'check', role: 'check', pixel: { x: 500, y: 500 }, ground: offsetEast(point, 30), uncertainty: { groundSigmaM: 2 } }])
  const high = baseSession([{ id: 'check', role: 'check', pixel: { x: 500, y: 500 }, ground: offsetEast(point, 30), uncertainty: { groundSigmaM: 80 } }])
  const lowModel = fitTransform('affine', low.controls.filter((control) => control.role !== 'check'))
  const highModel = fitTransform('affine', high.controls.filter((control) => control.role !== 'check'))
  assert.deepEqual(lowModel, highModel)
  const lowQa = analyzeUncertainCheckHoldout(low, lowModel)
  const highQa = analyzeUncertainCheckHoldout(high, highModel)
  assert.equal(lowQa.available, false) // one check remains insufficient for uncertain-holdout aggregate
  assert.equal(highQa.available, false)
})

test('pixel uncertainty is converted to meters using the fitted model local scale', () => {
  const p1 = affineGround(250, 250)
  const p2 = affineGround(750, 750)
  const session = baseSession([
    { id: 'pixel-fuzzy', role: 'check', pixel: { x: 250, y: 250 }, ground: offsetEast(p1, 18), uncertainty: { pixelEvidence: 'fuzzy-feature', groundSigmaM: 0 } },
    { id: 'pixel-exact', role: 'check', pixel: { x: 750, y: 750 }, ground: offsetEast(p2, 18), uncertainty: { pixelEvidence: 'exact-corner', groundSigmaM: 0 } },
  ])
  const model = fitTransform('affine', session.controls.filter((control) => control.role !== 'check'))
  const result = analyzeUncertainCheckHoldout(session, model)
  assert.equal(result.available, true)
  if (!result.available) return
  const fuzzy = result.checks.find((item) => item.controlId === 'pixel-fuzzy')!
  const exact = result.checks.find((item) => item.controlId === 'pixel-exact')!
  assert.ok(fuzzy.effectiveSigmaM > exact.effectiveSigmaM * 3)
})

import { analyzeUncertainCheckPredictions } from './checkUncertainty.ts'

test('prediction-function path matches transform-model path for uncertain checks', () => {
  const p1 = affineGround(250, 250)
  const p2 = affineGround(750, 750)
  const session = baseSession([
    { id: 'a', role: 'check', pixel: { x: 250, y: 250 }, ground: offsetEast(p1, 12), uncertainty: { groundSigmaM: 4 } },
    { id: 'b', role: 'check', pixel: { x: 750, y: 750 }, ground: offsetEast(p2, 18), uncertainty: { groundSigmaM: 9 } },
  ])
  const model = fitTransform('affine', session.controls.filter((control) => control.role !== 'check'))
  const viaModel = analyzeUncertainCheckHoldout(session, model)
  const viaPredict = analyzeUncertainCheckPredictions(session, (pixel) => {
    const [a,b,c,d,e,f] = model.params
    return { lng: a * pixel.x + b * pixel.y + c, lat: d * pixel.x + e * pixel.y + f }
  })
  assert.deepEqual(viaPredict, viaModel)
})
