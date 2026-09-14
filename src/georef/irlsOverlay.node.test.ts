import test from 'node:test'
import assert from 'node:assert/strict'
import { buildIrlsBoundaryOverlays, irlsPointDisplay } from './irlsOverlay.ts'
import { analyzeIrlsGeoreference } from './robustIrls.ts'
import { createSession } from './session.ts'

function ground(x: number, y: number) { return { lng: 100 + x * 0.001, lat: 30 + y * 0.001 } }

function sessionWithOutlier() {
  const session = createSession({ id: 'irls-overlay', now: '2026-09-13T08:30:00.000Z' })
  session.method = 'affine'
  session.controls = [
    { id: 'fit-1', role: 'fit', pixel: { x: 0, y: 0 }, ground: ground(0, 0) },
    { id: 'fit-2', role: 'fit', pixel: { x: 1000, y: 0 }, ground: ground(1000, 0) },
    { id: 'fit-3', role: 'fit', pixel: { x: 0, y: 1000 }, ground: ground(0, 1000) },
    { id: 'fit-bad', role: 'fit', pixel: { x: 1000, y: 1000 }, ground: { lng: 101.003, lat: 30.997 } },
    { id: 'fit-5', role: 'fit', pixel: { x: 500, y: 200 }, ground: ground(500, 200) },
    { id: 'fit-6', role: 'fit', pixel: { x: 250, y: 700 }, ground: ground(250, 700) },
    { id: 'fit-7', role: 'fit', pixel: { x: 800, y: 550 }, ground: ground(800, 550) },
    { id: 'check-1', role: 'check', pixel: { x: 200, y: 800 }, ground: ground(200, 800) },
    { id: 'check-2', role: 'check', pixel: { x: 800, y: 200 }, ground: ground(800, 200) },
  ]
  session.boundaryPixels = [{ x: 100, y: 100 }, { x: 900, y: 100 }, { x: 900, y: 900 }, { x: 100, y: 900 }]
  return session
}

test('IRLS overlay returns closed Huber and Tukey GCJ-02 boundary paths', () => {
  const session = sessionWithOutlier()
  const result = analyzeIrlsGeoreference(session)
  assert.equal(result.available, true)
  const overlays = buildIrlsBoundaryOverlays(session, result)
  assert.equal(overlays.length, 2)
  assert.deepEqual(overlays.map((item) => item.estimator), ['huber', 'tukey'])
  for (const overlay of overlays) {
    assert.equal(overlay.path.length, 5)
    assert.deepEqual(overlay.path[0], overlay.path.at(-1))
  }
})

test('IRLS point display distinguishes full, downweighted, and severe continuous weights', () => {
  assert.deepEqual(irlsPointDisplay(0.97), { label: 'IRLS FULL', tone: 'full', action: 'none' })
  assert.deepEqual(irlsPointDisplay(0.55), { label: 'IRLS 0.55', tone: 'downweighted', action: 'review' })
  assert.deepEqual(irlsPointDisplay(0.12), { label: 'IRLS 0.12 · 复查', tone: 'severe', action: 'review' })
})
