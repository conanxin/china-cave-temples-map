import test from 'node:test'
import assert from 'node:assert/strict'
import { analyzeMonteCarloUncertainty } from './monteCarloUncertainty.ts'
import type { GeoreferenceControlPoint, GeoreferenceSession } from './types.ts'

const thresholds = { passRmseM: 25, passMaxM: 50, reviewRmseM: 75, reviewMaxM: 150 }

function affineGround(x: number, y: number) {
  return { lng: 105 + x * 0.00001 + y * 0.000002, lat: 34 + x * -0.000001 + y * 0.000009 }
}

function verticalPiecewiseGround(x: number, y: number) {
  if (x < 500) return affineGround(x, y)
  return { lng: 105.001 + x * 0.0000125 + y * 0.000002, lat: 34.0003 + x * -0.000001 + y * 0.000009 }
}

function makeSession(mapper = affineGround): GeoreferenceSession {
  const fitPixels = [
    [80, 80], [240, 120], [420, 220],
    [90, 430], [260, 560], [430, 760],
    [570, 90], [760, 160], [930, 260],
    [560, 480], [760, 620], [920, 820],
  ]
  const checkPixels = [[170, 320], [360, 680], [650, 350], [840, 720]]
  const controls: GeoreferenceControlPoint[] = [
    ...fitPixels.map(([x, y], index) => ({ id: `fit-${index + 1}`, role: 'fit' as const, pixel: { x, y }, ground: mapper(x, y) })),
    ...checkPixels.map(([x, y], index) => ({ id: `check-${index + 1}`, role: 'check' as const, pixel: { x, y }, ground: mapper(x, y) })),
  ]
  return {
    schemaVersion: 1,
    id: 'mc-fixture',
    method: 'affine',
    imageWidth: 1000,
    imageHeight: 900,
    controls,
    boundaryPixels: [
      { x: 120, y: 140 }, { x: 880, y: 150 }, { x: 940, y: 760 }, { x: 150, y: 820 },
    ],
    qaThresholds: thresholds,
    createdAt: '2026-09-13T00:00:00Z',
    updatedAt: '2026-09-13T00:00:00Z',
  }
}

test('zero perturbation collapses boundary uncertainty to zero', () => {
  const result = analyzeMonteCarloUncertainty(makeSession(), { trials: 30, pixelSigmaPx: 0, groundSigmaM: 0, seed: 27 })
  assert.equal(result.available, true)
  if (!result.available) return
  assert.equal(result.successfulTrials, 30)
  assert.equal(result.boundary.maxP95M, 0)
  assert.equal(result.boundary.maxObservedM, 0)
})

test('monte carlo analysis is exactly reproducible for the same seed', () => {
  const options = { trials: 40, pixelSigmaPx: 1.5, groundSigmaM: 10, seed: 27027 }
  const a = analyzeMonteCarloUncertainty(makeSession(), options)
  const b = analyzeMonteCarloUncertainty(makeSession(), options)
  assert.deepEqual(a, b)
})

test('clean global affine data is selected most often after complexity adjustment', () => {
  const result = analyzeMonteCarloUncertainty(makeSession(), { trials: 80, pixelSigmaPx: 1.5, groundSigmaM: 8, seed: 91 })
  assert.equal(result.available, true)
  if (!result.available) return
  const affine = result.models.find((model) => model.id === 'affine')!
  assert.equal(result.winnerModelId, 'affine')
  assert.ok(affine.winRate >= 0.55, `expected affine to dominate, got ${affine.winRate}`)
})

test('true left/right deformation makes vertical piecewise win most perturbation trials', () => {
  const result = analyzeMonteCarloUncertainty(makeSession(verticalPiecewiseGround), { trials: 80, pixelSigmaPx: 1, groundSigmaM: 6, seed: 1234 })
  assert.equal(result.available, true)
  if (!result.available) return
  const piecewise = result.models.find((model) => model.id === 'piecewise-vertical-2')!
  assert.equal(result.winnerModelId, 'piecewise-vertical-2')
  assert.ok(piecewise.winRate >= 0.5, `expected 2x1 piecewise to dominate, got ${piecewise.winRate}`)
})

test('boundary uncertainty identifies the most unstable segment', () => {
  const session = makeSession()
  session.method = 'projective'
  const result = analyzeMonteCarloUncertainty(session, { trials: 100, pixelSigmaPx: 2, groundSigmaM: 12, seed: 8008 })
  assert.equal(result.available, true)
  if (!result.available) return
  assert.equal(result.boundary.vertices.length, 4)
  assert.equal(result.boundary.segments.length, 4)
  assert.ok(result.boundary.maxP95M > 0)
  const worst = [...result.boundary.segments].sort((a, b) => b.p95M - a.p95M)[0]
  assert.equal(result.boundary.mostUnstableSegment.startVertexIndex, worst.startVertexIndex)
  assert.equal(result.boundary.mostUnstableSegment.endVertexIndex, worst.endVertexIndex)
})

test('default Monte Carlo uses evidence-profiled control sigmas while preserving legacy fallback values', () => {
  const session = makeSession()
  const fit = session.controls.filter((control) => control.role !== 'check')
  fit[0].uncertainty = { pixelEvidence: 'exact-corner', groundEvidence: 'official-survey-gis' }
  fit[1].uncertainty = { pixelEvidence: 'fuzzy-feature', groundEvidence: 'osm-wikidata' }
  const result = analyzeMonteCarloUncertainty(session, { trials: 10, seed: 9 })
  assert.equal(result.available, true)
  if (!result.available) return
  assert.equal(result.uncertaintyMode, 'evidence-profiled')
  assert.equal(result.controlProfiles.find((item) => item.controlId === fit[0].id)?.groundSigmaM, 2)
  assert.equal(result.controlProfiles.find((item) => item.controlId === fit[1].id)?.groundSigmaM, 15)
  assert.deepEqual(result.uncertaintySummary.groundSigmaRangeM, [2, 15])
  assert.ok(result.uncertaintySummary.fallbackControlCount > 0)
})

test('explicit uniform Monte Carlo options preserve v0.27 uniform behavior', () => {
  const session = makeSession()
  session.controls.filter((control) => control.role !== 'check')[0].uncertainty = { pixelSigmaPx: 9, groundSigmaM: 80 }
  const result = analyzeMonteCarloUncertainty(session, { trials: 10, pixelSigmaPx: 2, groundSigmaM: 12, seed: 10 })
  assert.equal(result.available, true)
  if (!result.available) return
  assert.equal(result.uncertaintyMode, 'uniform')
  assert.equal(result.pixelSigmaPx, 2)
  assert.equal(result.groundSigmaM, 12)
  assert.ok(result.controlProfiles.every((item) => item.pixelSigmaPx === 2 && item.groundSigmaM === 12))
})

test('zero explicit per-control profiles collapse default evidence-profiled uncertainty to zero', () => {
  const session = makeSession()
  for (const control of session.controls.filter((item) => item.role !== 'check')) {
    control.uncertainty = { pixelSigmaPx: 0, groundSigmaM: 0 }
  }
  const result = analyzeMonteCarloUncertainty(session, { trials: 20, seed: 11 })
  assert.equal(result.available, true)
  if (!result.available) return
  assert.equal(result.uncertaintyMode, 'evidence-profiled')
  assert.equal(result.boundary?.maxP95M, 0)
  assert.equal(result.pixelSigmaPx, 0)
  assert.equal(result.groundSigmaM, 0)
})

test('Monte Carlo reports a separate evidence-normalized model competition without replacing raw winner', () => {
  const session = makeSession()
  const checks = session.controls.filter((control) => control.role === 'check')
  checks[0].uncertainty = { pixelSigmaPx: 0.5, groundSigmaM: 2 }
  checks[1].uncertainty = { pixelSigmaPx: 2, groundSigmaM: 20 }
  checks[2].uncertainty = { pixelSigmaPx: 1, groundSigmaM: 5 }
  checks[3].uncertainty = { pixelSigmaPx: 2, groundSigmaM: 20 }
  const result = analyzeMonteCarloUncertainty(session, { trials: 20, pixelSigmaPx: 0, groundSigmaM: 0, seed: 3030 })
  assert.equal(result.available, true)
  if (!result.available) return
  assert.ok(result.evidenceWinnerModelId)
  assert.ok(result.evidenceWinnerRate >= 0 && result.evidenceWinnerRate <= 1)
  assert.ok(result.models.some((model) => model.validTrials > 0 && model.meanNormalizedHoldout != null))
  assert.equal(typeof result.winnerModelId, 'string')
})
