import test from 'node:test'
import assert from 'node:assert/strict'
import { analyzeIrlsGeoreference } from './robustIrls.ts'
import { createSession } from './session.ts'

function affineGround(x: number, y: number) {
  return { lng: 100 + x * 0.001, lat: 30 + y * 0.001 }
}

test('Huber and Tukey continuously downweight one contaminated affine fit point', () => {
  const session = createSession({ id: 'irls-affine-bad', now: '2026-09-13T08:00:00.000Z' })
  session.method = 'affine'
  session.controls = [
    { id: 'fit-1', role: 'fit', pixel: { x: 0, y: 0 }, ground: affineGround(0, 0) },
    { id: 'fit-2', role: 'fit', pixel: { x: 1000, y: 0 }, ground: affineGround(1000, 0) },
    { id: 'fit-3', role: 'fit', pixel: { x: 0, y: 1000 }, ground: affineGround(0, 1000) },
    { id: 'fit-4', role: 'fit', pixel: { x: 1000, y: 1000 }, ground: { lng: 101.0035, lat: 30.9965 } },
    { id: 'fit-5', role: 'fit', pixel: { x: 500, y: 250 }, ground: affineGround(500, 250) },
    { id: 'fit-6', role: 'fit', pixel: { x: 250, y: 700 }, ground: affineGround(250, 700) },
    { id: 'fit-7', role: 'fit', pixel: { x: 750, y: 650 }, ground: affineGround(750, 650) },
    { id: 'check-1', role: 'check', pixel: { x: 200, y: 800 }, ground: affineGround(200, 800) },
    { id: 'check-2', role: 'check', pixel: { x: 800, y: 200 }, ground: affineGround(800, 200) },
  ]
  session.boundaryPixels = [{ x: 50, y: 50 }, { x: 950, y: 50 }, { x: 950, y: 950 }, { x: 50, y: 950 }]

  const result = analyzeIrlsGeoreference(session)
  assert.equal(result.available, true)
  if (!result.available) return

  for (const estimator of [result.huber, result.tukey]) {
    const bad = estimator.points.find((point) => point.controlId === 'fit-4')
    assert.ok(bad)
    assert.ok(bad.weight < 0.35, `${estimator.estimator}: expected contaminated point to be strongly downweighted, got ${bad.weight}`)
    assert.ok(estimator.holdout.rmseM < result.baselineHoldout.rmseM * 0.45, `${estimator.estimator}: holdout should materially improve`)
  }
  assert.ok(result.tukey.points.find((point) => point.controlId === 'fit-4')!.weight <= result.huber.points.find((point) => point.controlId === 'fit-4')!.weight)
})

test('clean affine controls retain near-full IRLS weights', () => {
  const session = createSession({ id: 'irls-clean', now: '2026-09-13T08:00:00.000Z' })
  session.method = 'affine'
  session.controls = [
    { id: 'fit-1', role: 'fit', pixel: { x: 0, y: 0 }, ground: affineGround(0, 0) },
    { id: 'fit-2', role: 'fit', pixel: { x: 1000, y: 0 }, ground: affineGround(1000, 0) },
    { id: 'fit-3', role: 'fit', pixel: { x: 0, y: 1000 }, ground: affineGround(0, 1000) },
    { id: 'fit-4', role: 'fit', pixel: { x: 1000, y: 1000 }, ground: affineGround(1000, 1000) },
    { id: 'fit-5', role: 'fit', pixel: { x: 500, y: 300 }, ground: affineGround(500, 300) },
    { id: 'fit-6', role: 'fit', pixel: { x: 300, y: 700 }, ground: affineGround(300, 700) },
    { id: 'check-1', role: 'check', pixel: { x: 200, y: 800 }, ground: affineGround(200, 800) },
    { id: 'check-2', role: 'check', pixel: { x: 800, y: 200 }, ground: affineGround(800, 200) },
  ]
  const result = analyzeIrlsGeoreference(session)
  assert.equal(result.available, true)
  if (!result.available) return
  assert.ok(result.huber.points.every((point) => point.weight > 0.95))
  assert.ok(result.tukey.points.every((point) => point.weight > 0.95))
})

test('projective IRLS uses continuous weights and independent check points for comparison', () => {
  const project = (x: number, y: number) => {
    const den = 1 + 0.00015 * x - 0.00008 * y
    return { lng: (100 + 0.0012 * x + 0.00015 * y) / den, lat: (30 + 0.0001 * x + 0.0011 * y) / den }
  }
  const session = createSession({ id: 'irls-projective', now: '2026-09-13T08:00:00.000Z' })
  session.method = 'projective'
  const pixels = [[0,0],[1000,0],[0,1000],[1000,1000],[500,200],[200,600],[800,650],[350,850]] as const
  session.controls = pixels.map(([x,y], index) => ({
    id: `fit-${index + 1}`,
    role: 'fit' as const,
    pixel: { x, y },
    ground: index === 6 ? { lng: project(x,y).lng + 0.0025, lat: project(x,y).lat - 0.002 } : project(x,y),
  }))
  session.controls.push(
    { id: 'check-1', role: 'check', pixel: { x: 250, y: 750 }, ground: project(250, 750) },
    { id: 'check-2', role: 'check', pixel: { x: 750, y: 250 }, ground: project(750, 250) },
  )
  const result = analyzeIrlsGeoreference(session)
  assert.equal(result.available, true)
  if (!result.available) return
  assert.ok(result.tukey.points.find((point) => point.controlId === 'fit-7')!.weight < 0.4)
  assert.ok(result.tukey.holdout.rmseM < result.baselineHoldout.rmseM)
  assert.equal(result.checkControlCount, 2)
})
