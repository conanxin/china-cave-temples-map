import test from 'node:test'
import assert from 'node:assert/strict'
import { applyTransform, fitAffine, fitProjective } from './fitTransform.ts'
import type { GeoreferenceControlPoint, ProjectiveModel } from './types.ts'

function cp(id: string, x: number, y: number, lng: number, lat: number): GeoreferenceControlPoint {
  return { id, pixel: { x, y }, ground: { lng, lat } }
}

function almost(actual: number, expected: number, tolerance = 1e-8) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`)
}

test('affine fit recovers an exact 6-parameter transform from redundant controls', () => {
  const expected = [0.01, 0.002, 103.0, -0.003, 0.008, 34.0] as const
  const controls = [[0, 0], [100, 0], [0, 100], [200, 150], [380, 40]].map(([x, y], index) => cp(
    `p${index + 1}`,
    x,
    y,
    expected[0] * x + expected[1] * y + expected[2],
    expected[3] * x + expected[4] * y + expected[5],
  ))

  const model = fitAffine(controls)
  model.params.forEach((value, index) => almost(value, expected[index], 1e-9))
  const mapped = applyTransform(model, { x: 125, y: 75 })
  almost(mapped.lng, 104.4, 1e-9)
  almost(mapped.lat, 34.225, 1e-9)
})

test('projective fit recovers an exact homography from redundant controls', () => {
  const expected: ProjectiveModel = {
    kind: 'projective',
    params: [0.01, 0.0015, 102.5, -0.001, 0.009, 33.5, 0.00008, -0.00004],
  }
  const pixels = [[0, 0], [200, 0], [0, 180], [240, 160], [500, 300], [80, 420]]
  const controls = pixels.map(([x, y], index) => {
    const ground = applyTransform(expected, { x, y })
    return cp(`h${index + 1}`, x, y, ground.lng, ground.lat)
  })

  const model = fitProjective(controls)
  model.params.forEach((value, index) => almost(value, expected.params[index], 2e-8))
  const ground = applyTransform(model, { x: 333, y: 222 })
  const reference = applyTransform(expected, { x: 333, y: 222 })
  almost(ground.lng, reference.lng, 1e-8)
  almost(ground.lat, reference.lat, 1e-8)
})

test('fit functions reject insufficient or singular control geometry', () => {
  assert.throws(() => fitAffine([
    cp('a', 0, 0, 100, 30),
    cp('b', 1, 0, 101, 30),
  ]), /at least 3/i)

  assert.throws(() => fitProjective([
    cp('a', 0, 0, 100, 30),
    cp('b', 1, 0, 101, 30),
    cp('c', 0, 1, 100, 31),
  ]), /at least 4/i)

  assert.throws(() => fitAffine([
    cp('a', 0, 0, 100, 30),
    cp('b', 10, 10, 101, 31),
    cp('c', 20, 20, 102, 32),
  ]), /singular|ill-conditioned/i)
})

test('projective application rejects a near-zero denominator', () => {
  const model: ProjectiveModel = {
    kind: 'projective',
    params: [1, 0, 0, 0, 1, 0, -1, 0],
  }
  assert.throws(() => applyTransform(model, { x: 1, y: 0 }), /denominator/i)
})
