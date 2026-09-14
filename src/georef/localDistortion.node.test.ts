import test from 'node:test'
import assert from 'node:assert/strict'
import { analyzeLocalDistortion, compareLocalDistortionAnalyses, type LocalDistortionResult } from './localDistortion.ts'
import type { AffineModel, GeoreferenceSession } from './types.ts'

const model: AffineModel = { kind: 'affine', params: [0.001, 0, 100, 0, 0.001, 30] }
const METERS_PER_DEG_LAT = 111_195
const METERS_PER_DEG_LNG_AT_30 = 111_195 * Math.cos(30 * Math.PI / 180)

function sessionWithResiduals(points: Array<{ x: number; y: number; eastM: number; northM: number }>): GeoreferenceSession {
  return {
    schemaVersion: 1,
    id: 'local-distortion',
    method: 'affine',
    imageWidth: 1000,
    imageHeight: 1000,
    controls: points.map((point, index) => {
      const predicted = { lng: 100 + point.x * 0.001, lat: 30 + point.y * 0.001 }
      return {
        id: `check-${index + 1}`,
        role: 'check' as const,
        pixel: { x: point.x, y: point.y },
        ground: {
          lng: predicted.lng + point.eastM / METERS_PER_DEG_LNG_AT_30,
          lat: predicted.lat + point.northM / METERS_PER_DEG_LAT,
        },
      }
    }),
    boundaryPixels: [],
    qaThresholds: { passRmseM: 25, passMaxM: 50, reviewRmseM: 75, reviewMaxM: 150 },
    createdAt: '2026-09-13T08:00:00.000Z',
    updatedAt: '2026-09-13T08:00:00.000Z',
  }
}

const grid = [100, 500, 900].flatMap((y) => [100, 500, 900].map((x) => ({ x, y })))

test('small independent residuals produce a stable local-distortion diagnosis', () => {
  const session = sessionWithResiduals(grid.map(({ x, y }, index) => ({ x, y, eastM: (index % 3 - 1) * 3, northM: (Math.floor(index / 3) - 1) * 2 })))
  const result = analyzeLocalDistortion(session, model)
  assert.equal(result.available, true)
  if (!result.available) return
  assert.equal(result.pattern, 'stable')
  assert.ok(result.fieldVariationM < 15)
  assert.ok(result.postFieldRmsM < 5)
  assert.equal(result.gridCells.length, 16)
})

test('a smooth left-to-right and top-to-bottom residual gradient is diagnosed as structured warp', () => {
  const session = sessionWithResiduals(grid.map(({ x, y }) => {
    const xn = x / 500 - 1
    const yn = y / 500 - 1
    return { x, y, eastM: 65 * xn + 12 * yn, northM: -8 * xn + 45 * yn }
  }))
  const result = analyzeLocalDistortion(session, model)
  assert.equal(result.available, true)
  if (!result.available) return
  assert.equal(result.pattern, 'structured-gradient')
  assert.ok(result.gradientExplainedFraction > 0.95)
  assert.ok(result.fieldVariationM > 120)
  assert.ok(result.postFieldRmsM < 3)
  assert.ok(Math.abs(result.gradient.eastDxM) > 50)
  assert.ok(Math.abs(result.gradient.northDyM) > 35)
})

test('a concentrated northeast residual cluster is diagnosed as a localized hotspot', () => {
  const points = grid.map(({ x, y }) => ({
    x,
    y,
    eastM: x >= 500 && y <= 500 && !(x === 500 && y === 500) ? 115 : 0,
    northM: x >= 500 && y <= 500 && !(x === 500 && y === 500) ? 35 : 0,
  }))
  const result = analyzeLocalDistortion(sessionWithResiduals(points), model)
  assert.equal(result.available, true)
  if (!result.available) return
  assert.equal(result.pattern, 'localized-hotspot')
  assert.equal(result.hotspotRegion, 'NE')
  assert.ok((result.hotspotCell?.magnitudeM ?? 0) > 45)
  assert.ok(result.hotspotContrast > 1.7)
})

test('local distortion diagnosis stays unavailable until four independent check points and image dimensions exist', () => {
  const result = analyzeLocalDistortion(sessionWithResiduals([
    { x: 100, y: 100, eastM: 30, northM: 0 },
    { x: 900, y: 100, eastM: 30, northM: 0 },
    { x: 500, y: 900, eastM: 30, northM: 0 },
  ]), model)
  assert.equal(result.available, false)
  if (!result.available) assert.match(result.reason, /at least 4 independent check points/i)
})

function fakeAnalysis(input: {
  pattern: 'stable' | 'structured-gradient' | 'localized-hotspot' | 'irregular'
  meanResidualM: number
  hotspotRegion?: 'NW' | 'NE' | 'SW' | 'SE'
  fieldVariationM?: number
}): Extract<LocalDistortionResult, { available: true }> {
  return {
    available: true,
    checkCount: 8,
    pattern: input.pattern,
    meanResidualM: input.meanResidualM,
    maxResidualM: input.meanResidualM * 1.4,
    systematicMagnitudeM: 0,
    localRmsM: input.meanResidualM,
    gradientExplainedFraction: input.pattern === 'structured-gradient' ? 0.8 : 0.25,
    postFieldRmsM: input.meanResidualM * 0.6,
    fieldVariationM: input.fieldVariationM ?? input.meanResidualM,
    gradient: { eastDxM: 20, eastDyM: 0, northDxM: 0, northDyM: 20, divergenceM: 40, rotationM: 0, shearM: 0 },
    gridCells: [],
    hotspotContrast: input.hotspotRegion ? 2.5 : 1,
    ...(input.hotspotRegion ? { hotspotRegion: input.hotspotRegion, hotspotCell: { row: 0, col: 3, centerPixel: { x: 875, y: 125 }, eastM: 50, northM: 0, magnitudeM: 50, supportScore: 0.9, severity: 'review', region: input.hotspotRegion } } : {}),
  }
}

test('cross-model comparison prefers projective when it resolves an affine spatial warp', () => {
  const result = compareLocalDistortionAnalyses([
    { id: 'affine', label: 'Affine', analysis: fakeAnalysis({ pattern: 'structured-gradient', meanResidualM: 60, hotspotRegion: 'NE' }) },
    { id: 'projective', label: 'Projective', analysis: fakeAnalysis({ pattern: 'stable', meanResidualM: 12 }) },
  ], 25)
  assert.equal(result.recommendation, 'prefer-projective')
  assert.equal(result.bestModelId, 'projective')
})

test('cross-model comparison recommends control review when robust/IRLS resolves distortion left by least squares', () => {
  const result = compareLocalDistortionAnalyses([
    { id: 'current', label: 'Current LS', analysis: fakeAnalysis({ pattern: 'localized-hotspot', meanResidualM: 58, hotspotRegion: 'NE' }) },
    { id: 'robust', label: 'RANSAC', analysis: fakeAnalysis({ pattern: 'stable', meanResidualM: 16 }) },
    { id: 'tukey', label: 'Tukey', analysis: fakeAnalysis({ pattern: 'stable', meanResidualM: 14 }) },
  ], 25)
  assert.equal(result.recommendation, 'review-controls')
  assert.equal(result.bestModelId, 'tukey')
})

test('persistent hotspot across global and robust models triggers a piecewise-registration suggestion', () => {
  const analyses = ['affine', 'projective', 'robust', 'huber', 'tukey'].map((id, index) => ({
    id,
    label: id,
    analysis: fakeAnalysis({ pattern: index % 2 ? 'localized-hotspot' : 'structured-gradient', meanResidualM: 48 + index * 2, hotspotRegion: 'SE', fieldVariationM: 70 }),
  }))
  const result = compareLocalDistortionAnalyses(analyses, 25)
  assert.equal(result.recommendation, 'consider-piecewise')
  assert.equal(result.persistentHotspotRegion, 'SE')
  assert.ok(result.nonStableModelCount >= 4)
})
