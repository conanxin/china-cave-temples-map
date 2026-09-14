import test from 'node:test'
import assert from 'node:assert/strict'
import { analyzeSystematicStress } from './systematicStress.ts'
import type { GeoreferenceControlPoint, GeoreferenceSession } from './types.ts'

const thresholds = { passRmseM: 25, passMaxM: 50, reviewRmseM: 75, reviewMaxM: 150 }

function affineGround(x: number, y: number) {
  return { lng: 105 + x * 0.00001 + y * 0.000002, lat: 34 + x * -0.000001 + y * 0.000009 }
}

function makeSession(): GeoreferenceSession {
  const fitPixels = [
    [80, 80], [240, 120], [420, 220],
    [90, 430], [260, 560], [430, 760],
    [570, 90], [760, 160], [930, 260],
    [560, 480], [760, 620], [920, 820],
  ]
  const checkPixels = [[170, 320], [360, 680], [650, 350], [840, 720]]
  const controls: GeoreferenceControlPoint[] = [
    ...fitPixels.map(([x, y], index) => ({ id: `fit-${index + 1}`, role: 'fit' as const, pixel: { x, y }, ground: affineGround(x, y) })),
    ...checkPixels.map(([x, y], index) => ({ id: `check-${index + 1}`, role: 'check' as const, pixel: { x, y }, ground: affineGround(x, y) })),
  ]
  return {
    schemaVersion: 1,
    id: 'stress-fixture',
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

test('zero-amplitude systematic stress collapses to baseline', () => {
  const result = analyzeSystematicStress(makeSession(), {
    rotationDeg: 0,
    anisotropicScaleFraction: 0,
    commonGroundShiftM: 0,
    regionalGroundBiasM: 0,
    pixelWaveAmplitudePx: 0,
    singleControlGrossErrorM: 0,
  })
  assert.equal(result.available, true)
  if (!result.available) return
  assert.equal(result.scenarios.length, 6)
  assert.equal(result.maxBoundaryShiftM, 0)
  assert.equal(result.maxHoldoutIncreaseM, 0)
  assert.equal(result.modelFlipCount, 0)
  assert.equal(result.recommendation, 'stable')
})

test('common ground shift is visible as whole-boundary displacement against fixed checks', () => {
  const result = analyzeSystematicStress(makeSession(), {
    rotationDeg: 0,
    anisotropicScaleFraction: 0,
    commonGroundShiftM: 40,
    regionalGroundBiasM: 0,
    pixelWaveAmplitudePx: 0,
  })
  assert.equal(result.available, true)
  if (!result.available) return
  const scenario = result.scenarios.find((item) => item.id === 'ground-common-shift')!
  assert.ok(scenario.maxBoundaryShiftM > 35 && scenario.maxBoundaryShiftM < 45, `expected ~40m shift, got ${scenario.maxBoundaryShiftM}`)
  assert.ok(scenario.maxHoldoutRmseM > 35, `expected fixed checks to expose shared shift, got ${scenario.maxHoldoutRmseM}`)
  assert.equal(result.dominantScenarioId, 'ground-common-shift')
})

test('regional correlated bias creates non-uniform boundary sensitivity', () => {
  const result = analyzeSystematicStress(makeSession(), {
    rotationDeg: 0,
    anisotropicScaleFraction: 0,
    commonGroundShiftM: 0,
    regionalGroundBiasM: 45,
    pixelWaveAmplitudePx: 0,
  })
  assert.equal(result.available, true)
  if (!result.available) return
  const scenario = result.scenarios.find((item) => item.id === 'regional-ground-bias')!
  assert.ok(scenario.maxBoundaryShiftM > 10)
  assert.ok(scenario.worstVariant.boundary)
  const shifts = scenario.worstVariant.boundary!.vertexShiftsM
  assert.ok(Math.max(...shifts) - Math.min(...shifts) > 5, `expected non-uniform shifts, got ${shifts.join(', ')}`)
})

test('stress result records baseline winner and whether scenario variants flip model selection', () => {
  const result = analyzeSystematicStress(makeSession(), {
    rotationDeg: 0.4,
    anisotropicScaleFraction: 0.006,
    commonGroundShiftM: 20,
    regionalGroundBiasM: 30,
    pixelWaveAmplitudePx: 4,
  })
  assert.equal(result.available, true)
  if (!result.available) return
  assert.equal(result.baselineWinnerModelId, 'affine')
  assert.ok(result.scenarios.every((scenario) => scenario.variants.every((variant) => typeof variant.modelWinnerChanged === 'boolean')))
  assert.equal(result.modelFlipCount, result.scenarios.flatMap((scenario) => scenario.variants).filter((variant) => variant.modelWinnerChanged).length)
})

test('single-control gross error stresses one fit point at a time and exposes the worst offender', () => {
  const result = analyzeSystematicStress(makeSession(), {
    rotationDeg: 0,
    anisotropicScaleFraction: 0,
    commonGroundShiftM: 0,
    regionalGroundBiasM: 0,
    pixelWaveAmplitudePx: 0,
    singleControlGrossErrorM: 60,
  })
  assert.equal(result.available, true)
  if (!result.available) return
  const scenario = result.scenarios.find((item) => item.id === 'single-control-gross-error')!
  assert.ok(scenario)
  assert.equal(scenario.variants.length, 12)
  assert.ok(scenario.maxHoldoutIncreaseM > 0)
  assert.ok(scenario.maxBoundaryShiftM > 0)
  assert.match(scenario.worstVariant.label, /fit-/i)
})

test('systematic stress requires at least two independent check points', () => {
  const session = makeSession()
  session.controls = session.controls.filter((control) => control.role !== 'check' || control.id === 'check-1')
  const result = analyzeSystematicStress(session)
  assert.equal(result.available, false)
  if (result.available) return
  assert.match(result.reason, /2 independent check points/i)
})
