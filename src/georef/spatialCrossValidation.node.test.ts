import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateSpatialCrossValidation } from './spatialCrossValidation.ts'
import type { GeoreferenceControlPoint, GeoreferenceSession } from './types.ts'

function affineGround(x: number, y: number) {
  return { lng: 110 + x * 0.00001 + y * 0.0000015, lat: 30 - y * 0.00001 + x * 0.0000007 }
}

function verticalPiecewiseGround(x: number, y: number) {
  if (x <= 500) return affineGround(x, y)
  const seam = affineGround(500, y)
  return {
    lng: seam.lng + (x - 500) * 0.000021,
    lat: seam.lat + (x - 500) * 0.0000013,
  }
}

function cp(id: string, x: number, y: number, role: 'fit' | 'check', groundFn: (x: number, y: number) => { lng: number; lat: number }): GeoreferenceControlPoint {
  return { id, role, pixel: { x, y }, ground: groundFn(x, y) }
}

function denseControls(groundFn: (x: number, y: number) => { lng: number; lat: number }) {
  const fit: GeoreferenceControlPoint[] = []
  let n = 0
  for (const x of [90, 230, 390, 470, 540, 650, 790, 920]) {
    for (const y of [90, 300, 560, 720]) {
      fit.push(cp(`f${++n}`, x, y, 'fit', groundFn))
    }
  }
  const checks = [
    cp('c1', 160, 190, 'check', groundFn), cp('c2', 360, 650, 'check', groundFn),
    cp('c3', 620, 210, 'check', groundFn), cp('c4', 840, 610, 'check', groundFn),
  ]
  return [...fit, ...checks]
}

function session(controls: GeoreferenceControlPoint[]): GeoreferenceSession {
  return {
    schemaVersion: 1,
    id: 'spatial-cv-test',
    method: 'affine',
    imageWidth: 1000,
    imageHeight: 800,
    controls,
    boundaryPixels: [
      { x: 80, y: 80 }, { x: 920, y: 80 }, { x: 920, y: 720 }, { x: 80, y: 720 },
    ],
    qaThresholds: { passRmseM: 25, passMaxM: 50, reviewRmseM: 75, reviewMaxM: 150 },
    createdAt: '2026-09-13T00:00:00.000Z',
    updatedAt: '2026-09-13T00:00:00.000Z',
  }
}

test('spatial block CV still supports vertical piecewise model for genuinely piecewise source', () => {
  const result = evaluateSpatialCrossValidation(session(denseControls(verticalPiecewiseGround)))
  assert.equal(result.available, true)
  if (!result.available) return
  assert.ok(result.bestGlobalModelId === 'affine' || result.bestGlobalModelId === 'projective')
  assert.equal(result.bestPiecewiseModelId, 'piecewise-vertical-2')
  const global = result.models.find((model) => model.id === result.bestGlobalModelId)!
  const piecewise = result.models.find((model) => model.id === result.bestPiecewiseModelId)!
  assert.equal(global.available, true)
  assert.equal(piecewise.available, true)
  if (!global.available || !piecewise.available) return
  assert.equal(piecewise.coverageRatio, 1)
  assert.ok(piecewise.cvRmseM < global.cvRmseM * 0.5)
  assert.ok(result.adjustedImprovementPercent > 15)
  assert.equal(result.recommendation, 'piecewise-supported')
})

test('complexity adjustment keeps global affine when piecewise models do not generalize better', () => {
  const result = evaluateSpatialCrossValidation(session(denseControls(affineGround)))
  assert.equal(result.available, true)
  if (!result.available) return
  assert.equal(result.bestGlobalModelId, 'affine')
  const affine = result.models.find((model) => model.id === 'affine')!
  const vertical = result.models.find((model) => model.id === 'piecewise-vertical-2')!
  assert.equal(affine.available, true)
  assert.equal(vertical.available, true)
  if (!affine.available || !vertical.available) return
  assert.ok(affine.cvRmseM < 0.1)
  assert.ok(vertical.cvRmseM < 0.1)
  assert.ok(vertical.complexitySurchargePercent > affine.complexitySurchargePercent)
  assert.ok(vertical.adjustedCvRmseM >= vertical.cvRmseM)
  assert.equal(result.recommendation, 'global-preferred')
})

test('piecewise candidate is cross-validation unavailable when a spatial fold removes too much local support', () => {
  const controls: GeoreferenceControlPoint[] = [
    cp('nw1', 100, 100, 'fit', affineGround), cp('nw2', 350, 120, 'fit', affineGround), cp('nw3', 180, 330, 'fit', affineGround),
    cp('ne1', 600, 100, 'fit', affineGround), cp('ne2', 880, 140, 'fit', affineGround), cp('ne3', 740, 320, 'fit', affineGround),
    cp('sw1', 100, 500, 'fit', affineGround), cp('sw2', 350, 520, 'fit', affineGround), cp('sw3', 180, 720, 'fit', affineGround),
    cp('se1', 600, 500, 'fit', affineGround), cp('se2', 880, 540, 'fit', affineGround), cp('se3', 740, 720, 'fit', affineGround),
    cp('cnw', 260, 250, 'check', affineGround), cp('cne', 760, 250, 'check', affineGround),
    cp('csw', 260, 650, 'check', affineGround), cp('cse', 760, 650, 'check', affineGround),
  ]
  const result = evaluateSpatialCrossValidation(session(controls))
  assert.equal(result.available, true)
  if (!result.available) return
  const quadrants = result.models.find((model) => model.id === 'piecewise-quadrants-4')!
  assert.equal(quadrants.available, false)
  if (quadrants.available) return
  assert.match(quadrants.reason, /spatial fold|region|fit points/i)
  assert.ok(quadrants.coverageRatio < 1)
})

test('spatial folds evaluate every fit control exactly once for an available model', () => {
  const controls = denseControls(affineGround)
  const fitCount = controls.filter((control) => control.role !== 'check').length
  const result = evaluateSpatialCrossValidation(session(controls))
  assert.equal(result.available, true)
  if (!result.available) return
  const affine = result.models.find((model) => model.id === 'affine')!
  assert.equal(affine.available, true)
  if (!affine.available) return
  assert.equal(affine.evaluatedPointCount, fitCount)
  assert.equal(affine.coverageRatio, 1)
  const held = affine.folds.flatMap((fold) => fold.available ? fold.heldOutControlIds : [])
  assert.equal(new Set(held).size, fitCount)
  assert.equal(held.length, fitCount)
})
