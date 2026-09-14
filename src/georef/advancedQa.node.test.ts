import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateSessionQa } from './advancedQa.ts'
import { createSession } from './session.ts'

function fitPoint(id: string, x: number, y: number, lng: number, lat: number) {
  return { id, role: 'fit' as const, pixel: { x, y }, ground: { lng, lat } }
}
function checkPoint(id: string, x: number, y: number, lng: number, lat: number) {
  return { id, role: 'check' as const, pixel: { x, y }, ground: { lng, lat } }
}

test('holdout check points are evaluated independently and do not participate in fitting', () => {
  const session = createSession({ id: 'holdout', now: '2026-09-13T06:00:00.000Z' })
  session.imageWidth = 1000
  session.imageHeight = 1000
  session.controls = [
    fitPoint('a', 0, 0, 100, 30),
    fitPoint('b', 1000, 0, 101, 30),
    fitPoint('c', 0, 1000, 100, 31),
    fitPoint('d', 1000, 1000, 101, 31),
    checkPoint('check-1', 500, 500, 100.5, 30.5),
    checkPoint('check-2', 250, 750, 100.25, 30.75),
  ]

  const result = evaluateSessionQa(session)
  assert.equal(result.fit.fitControlCount, 4)
  assert.equal(result.fit.checkControlCount, 2)
  assert.equal(result.holdout?.count, 2)
  assert.equal(result.holdout?.verdict, 'pass')
  assert.ok((result.holdout?.rmseM ?? Infinity) < 1e-5)
})

test('projective leave-one-out is unavailable with exactly four fit points instead of reporting false zero confidence', () => {
  const session = createSession({ id: 'loo-short', now: '2026-09-13T06:00:00.000Z' })
  session.method = 'projective'
  session.controls = [
    fitPoint('a', 0, 0, 100, 30),
    fitPoint('b', 1000, 0, 101, 30),
    fitPoint('c', 0, 1000, 100, 31),
    fitPoint('d', 1000, 1000, 101, 31),
  ]

  const result = evaluateSessionQa(session)
  assert.equal(result.leaveOneOut.available, false)
  if (!result.leaveOneOut.available) assert.match(result.leaveOneOut.reason, /at least 5 fit points/i)
})

test('leave-one-out predicts omitted controls when redundant fit points exist', () => {
  const session = createSession({ id: 'loo', now: '2026-09-13T06:00:00.000Z' })
  session.controls = [
    fitPoint('a', 0, 0, 100, 30),
    fitPoint('b', 1000, 0, 101, 30),
    fitPoint('c', 0, 1000, 100, 31),
    fitPoint('d', 1000, 1000, 101, 31),
    fitPoint('e', 500, 250, 100.5, 30.25),
  ]

  const result = evaluateSessionQa(session)
  assert.equal(result.leaveOneOut.available, true)
  if (result.leaveOneOut.available) {
    assert.equal(result.leaveOneOut.residuals.length, 5)
    assert.equal(result.leaveOneOut.verdict, 'pass')
    assert.ok(result.leaveOneOut.rmseM < 1e-5)
  }
})
