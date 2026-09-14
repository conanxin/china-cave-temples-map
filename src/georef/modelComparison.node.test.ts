import test from 'node:test'
import assert from 'node:assert/strict'
import { applyTransform } from './fitTransform.ts'
import { compareGeoreferenceModels } from './modelComparison.ts'
import type { GeoreferenceControlPoint, GeoreferenceSession, ProjectiveModel } from './types.ts'

function baseSession(): GeoreferenceSession {
  return {
    schemaVersion: 1,
    id: 'model-comparison',
    method: 'affine',
    imageWidth: 1000,
    imageHeight: 1000,
    controls: [],
    boundaryPixels: [{ x: 100, y: 100 }, { x: 900, y: 100 }, { x: 900, y: 900 }, { x: 100, y: 900 }],
    qaThresholds: { passRmseM: 25, passMaxM: 50, reviewRmseM: 75, reviewMaxM: 150 },
    createdAt: '2026-09-13T07:30:00.000Z',
    updatedAt: '2026-09-13T07:30:00.000Z',
  }
}

function controlsFromModel(model: ProjectiveModel, fitPixels: Array<[number, number]>, checkPixels: Array<[number, number]>): GeoreferenceControlPoint[] {
  return [
    ...fitPixels.map(([x, y], index) => ({ id: `fit-${index + 1}`, role: 'fit' as const, pixel: { x, y }, ground: applyTransform(model, { x, y }) })),
    ...checkPixels.map(([x, y], index) => ({ id: `check-${index + 1}`, role: 'check' as const, pixel: { x, y }, ground: applyTransform(model, { x, y }) })),
  ]
}

test('projective is recommended when holdout points reveal real perspective distortion', () => {
  const trueModel: ProjectiveModel = {
    kind: 'projective',
    params: [0.0011, 0.00005, 100, -0.00003, 0.001, 30, 0.00018, 0.00012],
  }
  const session = baseSession()
  session.controls = controlsFromModel(
    trueModel,
    [[0, 0], [1000, 0], [0, 1000], [1000, 1000], [500, 200], [250, 700]],
    [[500, 500], [800, 300], [300, 850]],
  )

  const result = compareGeoreferenceModels(session)
  assert.equal(result.available, true)
  if (!result.available) return
  assert.ok(result.affine.holdout)
  assert.ok(result.projective.holdout)
  assert.ok((result.projective.holdout?.rmseM ?? Infinity) < (result.affine.holdout?.rmseM ?? 0) * 0.4)
  assert.equal(result.recommendation, 'projective')
  assert.ok((result.boundaryDivergence?.maxM ?? 0) > 1)
})

test('affine is preferred when projective adds no meaningful holdout benefit', () => {
  const trueModel: ProjectiveModel = {
    kind: 'projective',
    params: [0.001, 0.0001, 100, -0.00005, 0.0012, 30, 0, 0],
  }
  const session = baseSession()
  session.controls = controlsFromModel(
    trueModel,
    [[0, 0], [1000, 0], [0, 1000], [1000, 1000], [500, 200], [250, 700]],
    [[500, 500], [800, 300], [300, 850]],
  )

  const result = compareGeoreferenceModels(session)
  assert.equal(result.available, true)
  if (!result.available) return
  assert.equal(result.affine.holdout?.verdict, 'pass')
  assert.equal(result.projective.holdout?.verdict, 'pass')
  assert.equal(result.recommendation, 'affine')
  assert.ok((result.boundaryDivergence?.meanM ?? Infinity) < 1)
})

test('comparison asks for more independent checks instead of recommending a model without holdout evidence', () => {
  const trueModel: ProjectiveModel = {
    kind: 'projective',
    params: [0.001, 0, 100, 0, 0.001, 30, 0, 0],
  }
  const session = baseSession()
  session.controls = controlsFromModel(
    trueModel,
    [[0, 0], [1000, 0], [0, 1000], [1000, 1000], [500, 500]],
    [[250, 250]],
  )
  const result = compareGeoreferenceModels(session)
  assert.equal(result.available, true)
  if (!result.available) return
  assert.equal(result.recommendation, 'insufficient')
  assert.match(result.reasons.join(' '), /at least 2 independent check points/i)
})

test('projective is not recommended from a minimally determined four-point fit when LOO is unavailable', () => {
  const trueModel: ProjectiveModel = {
    kind: 'projective',
    params: [0.0011, 0.00005, 100, -0.00003, 0.001, 30, 0.00018, 0.00012],
  }
  const session = baseSession()
  session.controls = controlsFromModel(
    trueModel,
    [[0, 0], [1000, 0], [0, 1000], [1000, 1000]],
    [[500, 500], [800, 300], [300, 850]],
  )
  const result = compareGeoreferenceModels(session)
  assert.equal(result.available, true)
  if (!result.available) return
  assert.equal(result.projective.leaveOneOut.available, false)
  assert.notEqual(result.recommendation, 'projective')
  assert.match(result.reasons.join(' '), /leave-one-out|additional fit points/i)
})
