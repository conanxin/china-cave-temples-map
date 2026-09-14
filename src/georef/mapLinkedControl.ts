import { gcj02ToWgs84 } from '../geo/gcj02ToWgs84.ts'
import type { GeoreferenceControlPoint, GeoreferenceControlRole, GroundPoint, PixelPoint } from './types.ts'

interface CommonInput {
  id: string
  label?: string
  role: GeoreferenceControlRole
  pixel: PixelPoint
}

export function createAmapLinkedControlPoint(input: CommonInput & { gcj02: GroundPoint }): GeoreferenceControlPoint {
  const [lng, lat] = gcj02ToWgs84(input.gcj02.lng, input.gcj02.lat)
  return {
    id: input.id,
    ...(input.label ? { label: input.label } : {}),
    role: input.role,
    pixel: { ...input.pixel },
    ground: { lng, lat },
    groundSource: 'amap-click',
    groundSourceCrs: 'GCJ-02',
    groundSourceOriginal: { ...input.gcj02 },
  }
}

export function createManualControlPoint(input: CommonInput & { ground: GroundPoint }): GeoreferenceControlPoint {
  return {
    id: input.id,
    ...(input.label ? { label: input.label } : {}),
    role: input.role,
    pixel: { ...input.pixel },
    ground: { ...input.ground },
    groundSource: 'manual',
    groundSourceCrs: 'WGS84',
  }
}

export function clearGroundProvenance(control: GeoreferenceControlPoint): GeoreferenceControlPoint {
  const { groundSourceOriginal: _ignored, ...rest } = control
  return { ...rest, groundSource: 'manual', groundSourceCrs: 'WGS84' }
}
