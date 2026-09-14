import { solveLeastSquares } from './linearAlgebra.ts'
import type {
  AffineModel,
  GeoreferenceControlPoint,
  GeoreferenceTransformModel,
  GroundPoint,
  PixelPoint,
  ProjectiveModel,
} from './types.ts'

export function fitAffine(controls: GeoreferenceControlPoint[]): AffineModel {
  if (controls.length < 3) throw new Error('affine fit requires at least 3 control points')
  const rows: number[][] = []
  const values: number[] = []
  for (const control of controls) {
    const { x, y } = control.pixel
    rows.push([x, y, 1, 0, 0, 0])
    values.push(control.ground.lng)
    rows.push([0, 0, 0, x, y, 1])
    values.push(control.ground.lat)
  }
  const params = solveLeastSquares(rows, values)
  return { kind: 'affine', params: params as AffineModel['params'] }
}

export function fitProjective(controls: GeoreferenceControlPoint[]): ProjectiveModel {
  if (controls.length < 4) throw new Error('projective fit requires at least 4 control points')
  const rows: number[][] = []
  const values: number[] = []
  for (const control of controls) {
    const { x, y } = control.pixel
    const { lng, lat } = control.ground
    rows.push([x, y, 1, 0, 0, 0, -x * lng, -y * lng])
    values.push(lng)
    rows.push([0, 0, 0, x, y, 1, -x * lat, -y * lat])
    values.push(lat)
  }
  const params = solveLeastSquares(rows, values)
  return { kind: 'projective', params: params as ProjectiveModel['params'] }
}

export function fitTransform(method: 'affine' | 'projective', controls: GeoreferenceControlPoint[]) {
  return method === 'affine' ? fitAffine(controls) : fitProjective(controls)
}

export function applyTransform(model: GeoreferenceTransformModel, pixel: PixelPoint): GroundPoint {
  const { x, y } = pixel
  if (model.kind === 'affine') {
    const [a, b, c, d, e, f] = model.params
    return { lng: a * x + b * y + c, lat: d * x + e * y + f }
  }

  const [h11, h12, h13, h21, h22, h23, h31, h32] = model.params
  const denominator = h31 * x + h32 * y + 1
  if (Math.abs(denominator) < 1e-12) throw new Error('projective denominator is near zero')
  return {
    lng: (h11 * x + h12 * y + h13) / denominator,
    lat: (h21 * x + h22 * y + h23) / denominator,
  }
}
