import test from 'node:test'
import assert from 'node:assert/strict'
import { createSession, parseSession, serializeSession, sessionStorageKey } from './session.ts'

test('session creation provides v1 defaults and target linkage', () => {
  const session = createSession({ id: 'demo', targetId: 'unesco-1442-028-map', siteId: 5, now: '2026-09-12T20:00:00.000Z' })
  assert.equal(session.schemaVersion, 1)
  assert.equal(session.id, 'demo')
  assert.equal(session.targetId, 'unesco-1442-028-map')
  assert.equal(session.siteId, 5)
  assert.equal(session.method, 'affine')
  assert.deepEqual(session.controls, [])
  assert.deepEqual(session.boundaryPixels, [])
  assert.equal(session.createdAt, '2026-09-12T20:00:00.000Z')
  assert.equal(session.updatedAt, '2026-09-12T20:00:00.000Z')
})

test('session serialization round-trips without losing controls or thresholds', () => {
  const session = createSession({ id: 'roundtrip', now: '2026-09-12T20:00:00.000Z' })
  session.controls.push({ id: 'cp-1', pixel: { x: 10, y: 20 }, ground: { lng: 103.1, lat: 34.2 } })
  session.boundaryPixels.push({ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 })
  session.method = 'projective'
  const parsed = parseSession(serializeSession(session))
  assert.deepEqual(parsed, session)
})

test('parser rejects unsupported schemas and malformed coordinates', () => {
  assert.throws(() => parseSession('{"schemaVersion":2,"id":"x"}'), /schemaVersion/i)
  assert.throws(() => parseSession(JSON.stringify({
    schemaVersion: 1,
    id: 'bad',
    method: 'affine',
    controls: [{ id: 'cp', pixel: { x: 'x', y: 1 }, ground: { lng: 100, lat: 30 } }],
    boundaryPixels: [],
    qaThresholds: { passRmseM: 25, passMaxM: 50, reviewRmseM: 75, reviewMaxM: 150 },
    createdAt: 'x',
    updatedAt: 'x',
  })), /pixel/i)
})

test('parser validates optional image dimensions', () => {
  const session = createSession({ id: 'image', now: '2026-09-12T20:00:00.000Z' })
  const bad = { ...session, imageWidth: -10, imageHeight: 200 }
  assert.throws(() => parseSession(JSON.stringify(bad)), /image dimensions/i)
})

test('storage key is namespaced by session id', () => {
  assert.equal(sessionStorageKey('abc'), 'china-cave-georef-session:abc')
})

test('session preserves fit/check control roles and optional boundary extent selection', () => {
  const session = createSession({ id: 'roles', now: '2026-09-13T06:00:00.000Z' })
  session.boundaryExtentId = '05-wh-property'
  session.controls.push(
    { id: 'fit', role: 'fit', pixel: { x: 1, y: 2 }, ground: { lng: 100, lat: 30 } },
    { id: 'check', role: 'check', pixel: { x: 3, y: 4 }, ground: { lng: 100.1, lat: 30.1 } },
  )
  const parsed = parseSession(serializeSession(session))
  assert.equal(parsed.boundaryExtentId, '05-wh-property')
  assert.deepEqual(parsed.controls.map((item) => item.role), ['fit', 'check'])
})

test('session round-trip preserves AMap control provenance and rejects incomplete AMap metadata', () => {
  const session = createSession({ id: 'amap-provenance', now: '2026-09-13T06:30:00.000Z' })
  session.controls.push({
    id: 'amap', role: 'check', pixel: { x: 10, y: 20 }, ground: { lng: 112.47, lat: 34.55 },
    groundSource: 'amap-click', groundSourceCrs: 'GCJ-02', groundSourceOriginal: { lng: 112.476, lat: 34.551 },
  })
  assert.deepEqual(parseSession(serializeSession(session)).controls[0].groundSourceOriginal, { lng: 112.476, lat: 34.551 })
  const bad = structuredClone(session)
  delete bad.controls[0].groundSourceOriginal
  assert.throws(() => parseSession(JSON.stringify(bad)), /provenance/i)
})

test('session round-trip preserves uncertainty evidence and rejects invalid uncertainty metadata', () => {
  const session = createSession({ id: 'uncertainty-profile', now: '2026-09-14T03:20:00.000Z' })
  session.controls.push({
    id: 'cp-u', role: 'fit', pixel: { x: 10, y: 20 }, ground: { lng: 112.47, lat: 34.55 },
    uncertainty: {
      pixelEvidence: 'clear-feature',
      groundEvidence: 'official-coordinate',
      pixelSigmaPx: 1.1,
      groundSigmaM: 6,
      note: 'cross-checked against official control sheet',
    },
  })
  const parsed = parseSession(serializeSession(session))
  assert.deepEqual(parsed.controls[0].uncertainty, session.controls[0].uncertainty)

  const badSigma = structuredClone(session)
  badSigma.controls[0].uncertainty!.groundSigmaM = -1
  assert.throws(() => parseSession(JSON.stringify(badSigma)), /ground uncertainty sigma/i)

  const badEvidence = structuredClone(session) as any
  badEvidence.controls[0].uncertainty.pixelEvidence = 'magic-feature'
  assert.throws(() => parseSession(JSON.stringify(badEvidence)), /pixel uncertainty evidence/i)
})

test('session round-trip preserves uncertainty provenance and rejects invalid audit metadata', () => {
  const session = createSession({ id: 'uncertainty-audit', now: '2026-09-14T05:00:00.000Z' })
  session.controls.push({
    id: 'audit-cp', role: 'fit', pixel: { x: 30, y: 40 }, ground: { lng: 112.47, lat: 34.55 },
    uncertainty: {
      groundEvidence: 'official-survey-gis',
      groundSigmaM: 2,
      evidenceRef: 'https://example.org/gis/layer/17',
      evidenceDate: '2026-09-01',
      calibrationBasis: 'metadata',
      reviewStatus: 'reviewed',
      reviewedAt: '2026-09-14T04:45:00.000Z',
      note: 'source metadata states 2m positional accuracy',
    },
  })
  const parsed = parseSession(serializeSession(session))
  assert.deepEqual(parsed.controls[0].uncertainty, session.controls[0].uncertainty)

  const badBasis = structuredClone(session) as any
  badBasis.controls[0].uncertainty.calibrationBasis = 'because-i-said-so'
  assert.throws(() => parseSession(JSON.stringify(badBasis)), /calibration basis/i)

  const badReview = structuredClone(session) as any
  badReview.controls[0].uncertainty.reviewStatus = 'approved-ish'
  assert.throws(() => parseSession(JSON.stringify(badReview)), /review status/i)

  const emptyRef = structuredClone(session)
  emptyRef.controls[0].uncertainty!.evidenceRef = '   '
  assert.throws(() => parseSession(JSON.stringify(emptyRef)), /evidence reference/i)

  const badDate = structuredClone(session)
  badDate.controls[0].uncertainty!.evidenceDate = 'not-a-date'
  assert.throws(() => parseSession(JSON.stringify(badDate)), /evidence date/i)
})
