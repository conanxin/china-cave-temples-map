import test from 'node:test'
import assert from 'node:assert/strict'
import { analyzeCheckErrorField } from './errorField.ts'
import type { AffineModel, GeoreferenceSession } from './types.ts'

const model: AffineModel = { kind: 'affine', params: [0.001, 0, 100, 0, 0.001, 30] }

function sessionWithChecks(offsets: Array<[number, number]>) {
  const session: GeoreferenceSession = {
    schemaVersion: 1,
    id: 'error-field-test',
    method: 'affine',
    imageWidth: 1000,
    imageHeight: 1000,
    controls: offsets.map(([dLng, dLat], index) => {
      const x = index % 2 ? 800 : 200
      const y = index < 2 ? 200 : 800
      const predicted = { lng: 100 + x * 0.001, lat: 30 + y * 0.001 }
      return {
        id: `check-${index + 1}`,
        role: 'check' as const,
        pixel: { x, y },
        ground: { lng: predicted.lng + dLng, lat: predicted.lat + dLat },
      }
    }),
    boundaryPixels: [],
    qaThresholds: { passRmseM: 25, passMaxM: 50, reviewRmseM: 75, reviewMaxM: 150 },
    createdAt: '2026-09-13T07:30:00.000Z',
    updatedAt: '2026-09-13T07:30:00.000Z',
  }
  return session
}

test('coherent eastward check residuals are diagnosed as a global systematic shift', () => {
  const session = sessionWithChecks([
    [0.0005, 0], [0.0005, 0], [0.0005, 0], [0.0005, 0],
  ])
  const result = analyzeCheckErrorField(session, model)
  assert.equal(result.available, true)
  if (!result.available) return
  assert.equal(result.vectors.length, 4)
  assert.equal(result.pattern, 'global-shift')
  assert.ok(result.meanEastM > 40)
  assert.ok(Math.abs(result.meanNorthM) < 1)
  assert.ok(result.systematicBearingDeg > 80 && result.systematicBearingDeg < 100)
  assert.ok(result.directionalCoherence > 0.95)
  assert.ok(result.localRmsM < 1)
})

test('opposing check residuals are diagnosed as local distortion rather than a fake global shift', () => {
  const session = sessionWithChecks([
    [0.0007, 0], [-0.0007, 0], [0, 0.0007], [0, -0.0007],
  ])
  const result = analyzeCheckErrorField(session, model)
  assert.equal(result.available, true)
  if (!result.available) return
  assert.equal(result.pattern, 'local-distortion')
  assert.ok(result.directionalCoherence < 0.25)
  assert.ok(result.localRmsM > result.systematicMagnitudeM * 3)
})

test('error field stays unavailable until at least two independent check points exist', () => {
  const session = sessionWithChecks([[0.0005, 0]])
  const result = analyzeCheckErrorField(session, model)
  assert.equal(result.available, false)
  if (!result.available) assert.match(result.reason, /at least 2 check points/i)
})

test('a spatial cluster of larger check residuals is surfaced as a quadrant hotspot', () => {
  const session: GeoreferenceSession = {
    schemaVersion: 1,
    id: 'hotspot',
    method: 'affine',
    imageWidth: 1000,
    imageHeight: 1000,
    controls: [
      { id: 'nw', role: 'check', pixel: { x: 100, y: 100 }, ground: { lng: 100.10005, lat: 30.10000 } },
      { id: 'sw', role: 'check', pixel: { x: 100, y: 900 }, ground: { lng: 100.10005, lat: 30.90000 } },
      { id: 'ne1', role: 'check', pixel: { x: 700, y: 100 }, ground: { lng: 100.70120, lat: 30.10000 } },
      { id: 'ne2', role: 'check', pixel: { x: 800, y: 200 }, ground: { lng: 100.80120, lat: 30.20000 } },
      { id: 'ne3', role: 'check', pixel: { x: 900, y: 300 }, ground: { lng: 100.90120, lat: 30.30000 } },
    ],
    boundaryPixels: [],
    qaThresholds: { passRmseM: 25, passMaxM: 50, reviewRmseM: 75, reviewMaxM: 150 },
    createdAt: '2026-09-13T07:45:00.000Z',
    updatedAt: '2026-09-13T07:45:00.000Z',
  }
  const result = analyzeCheckErrorField(session, model)
  assert.equal(result.available, true)
  if (!result.available) return
  assert.equal(result.hotspotQuadrant, 'NE')
  const ne = result.quadrantSummaries.find((item) => item.quadrant === 'NE')
  assert.equal(ne?.count, 3)
  assert.ok((ne?.meanResidualM ?? 0) > result.meanResidualM)
})
