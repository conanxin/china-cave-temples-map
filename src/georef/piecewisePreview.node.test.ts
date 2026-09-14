import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPiecewisePreview } from './piecewisePreview.ts'
import type { GeoreferenceControlPoint, GeoreferenceSession } from './types.ts'

function groundForContinuousVertical(x: number, y: number) {
  const lng = x <= 500
    ? 110 + x * 0.00001 + y * 0.000001
    : 110 + 500 * 0.00001 + (x - 500) * 0.00002 + y * 0.000001
  const lat = 30 - y * 0.00001 + x * 0.0000005
  return { lng, lat }
}

function makeControl(id: string, x: number, y: number, role: 'fit' | 'check', ground = groundForContinuousVertical(x, y)): GeoreferenceControlPoint {
  return { id, role, pixel: { x, y }, ground }
}

function verticalControls() {
  return [
    makeControl('lf1', 100, 100, 'fit'), makeControl('lf2', 420, 120, 'fit'), makeControl('lf3', 160, 650, 'fit'), makeControl('lf4', 440, 620, 'fit'),
    makeControl('rf1', 560, 120, 'fit'), makeControl('rf2', 900, 100, 'fit'), makeControl('rf3', 580, 650, 'fit'), makeControl('rf4', 920, 620, 'fit'),
    makeControl('lc1', 260, 300, 'check'), makeControl('lc2', 360, 520, 'check'),
    makeControl('rc1', 650, 300, 'check'), makeControl('rc2', 800, 500, 'check'),
  ]
}

function baseSession(controls = verticalControls()): GeoreferenceSession {
  return {
    schemaVersion: 1,
    id: 'piecewise-preview-test',
    method: 'affine',
    imageWidth: 1000,
    imageHeight: 800,
    controls,
    boundaryPixels: [
      { x: 100, y: 100 }, { x: 450, y: 100 }, { x: 550, y: 100 }, { x: 900, y: 100 },
      { x: 900, y: 700 }, { x: 550, y: 700 }, { x: 450, y: 700 }, { x: 100, y: 700 },
    ],
    qaThresholds: { passRmseM: 25, passMaxM: 50, reviewRmseM: 75, reviewMaxM: 150 },
    createdAt: '2026-09-13T00:00:00.000Z',
    updatedAt: '2026-09-13T00:00:00.000Z',
  }
}

test('piecewise preview closes transformed boundary and quantifies divergence from current global model', () => {
  const preview = buildPiecewisePreview(baseSession(), 'vertical-2')
  assert.equal(preview.available, true)
  if (!preview.available) return
  assert.equal(preview.boundaryGcj02.length, 9)
  assert.deepEqual(preview.boundaryGcj02[0], preview.boundaryGcj02.at(-1))
  assert.equal(preview.regionOutlinesGcj02.length, 2)
  assert.equal(preview.seamVectors.length, 5)
  assert.ok(preview.globalDivergence.meanM > 5)
  assert.ok(preview.globalDivergence.maxM >= preview.globalDivergence.meanM)
  assert.deepEqual(preview.foldOverRegionIds, [])
})

test('piecewise preview exposes large seam jump vectors with fail severity', () => {
  const controls = verticalControls().map((control) => {
    if (control.pixel.x < 500) return control
    return { ...control, ground: { ...control.ground, lng: control.ground.lng + 0.002 } }
  })
  const preview = buildPiecewisePreview(baseSession(controls), 'vertical-2')
  assert.equal(preview.available, true)
  if (!preview.available) return
  assert.ok(preview.seamVectors.some((vector) => vector.distanceM > 100 && vector.severity === 'fail'))
  assert.ok(preview.seamMaxM > 100)
})

test('piecewise preview marks the specific region whose orientation flips against the global model', () => {
  const controls = verticalControls().map((control) => {
    if (control.pixel.x < 500) return control
    const { x, y } = control.pixel
    return { ...control, ground: { lng: 110.02 - x * 0.00001 + y * 0.000001, lat: 30 - y * 0.00001 + x * 0.0000005 } }
  })
  const preview = buildPiecewisePreview(baseSession(controls), 'vertical-2')
  assert.equal(preview.available, true)
  if (!preview.available) return
  assert.deepEqual(preview.foldOverRegionIds, ['E'])
  assert.equal(preview.imageRegions.find((region) => region.id === 'E')?.foldOverRisk, true)
})

test('piecewise preview returns explicit unavailability when a region lacks candidate evidence', () => {
  const controls = verticalControls().filter((control) => !['rf3', 'rf4', 'rc2'].includes(control.id))
  const preview = buildPiecewisePreview(baseSession(controls), 'vertical-2')
  assert.equal(preview.available, false)
  if (preview.available) return
  assert.match(preview.reason, /region E|fit points|check/i)
})
