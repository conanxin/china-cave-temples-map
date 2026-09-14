import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateFit, haversineMeters } from './qa.ts'
import type { AffineModel, GeoreferenceControlPoint } from './types.ts'

const identity: AffineModel = { kind: 'affine', params: [0.001, 0, 100, 0, 0.001, 30] }
const controls: GeoreferenceControlPoint[] = [
  { id: 'a', pixel: { x: 0, y: 0 }, ground: { lng: 100, lat: 30 } },
  { id: 'b', pixel: { x: 100, y: 0 }, ground: { lng: 100.1, lat: 30 } },
  { id: 'c', pixel: { x: 0, y: 100 }, ground: { lng: 100, lat: 30.1 } },
]

test('haversine residuals are reported in metres', () => {
  const distance = haversineMeters({ lng: 100, lat: 30 }, { lng: 100, lat: 30.001 })
  assert.ok(distance > 110 && distance < 112)
})

test('exact control fit returns zero-ish RMSE and pass verdict', () => {
  const result = evaluateFit(identity, controls)
  assert.equal(result.verdict, 'pass')
  assert.ok(result.rmseM < 1e-6)
  assert.ok(result.maxResidualM < 1e-6)
  assert.equal(result.residuals.length, 3)
})

test('QA thresholds separate pass, review and fail', () => {
  const shifted: AffineModel = { kind: 'affine', params: [0.001, 0, 100, 0, 0.001, 30.0003] }
  const review = evaluateFit(shifted, controls, { passRmseM: 25, passMaxM: 50, reviewRmseM: 75, reviewMaxM: 150 })
  assert.equal(review.verdict, 'review')
  assert.ok(review.rmseM > 30 && review.rmseM < 35)

  const bad: AffineModel = { kind: 'affine', params: [0.001, 0, 100, 0, 0.001, 30.003] }
  const fail = evaluateFit(bad, controls)
  assert.equal(fail.verdict, 'fail')
  assert.ok(fail.rmseM > 300)
})
