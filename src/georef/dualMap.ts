import { wgs84ToGcj02 } from '../geo/wgs84ToGcj02.ts'
import { transformPixelPolygon } from './geojson.ts'
import type { GeoreferenceControlRole, GeoreferenceFitResult, GeoreferenceSession, GroundPoint } from './types.ts'

export interface DualMapControlMarker {
  id: string
  label?: string
  role: GeoreferenceControlRole
  pixel: { x: number; y: number }
  wgs84: GroundPoint
  gcj02: GroundPoint
  source: 'manual' | 'amap-click'
}

export interface ControlDisplayStyle {
  role: GeoreferenceControlRole
  selected: boolean
  label: string
  cssClass: string
}

export function getDualMapControlMarkers(session: GeoreferenceSession): DualMapControlMarker[] {
  return session.controls.map((control) => {
    const role = control.role ?? 'fit'
    const source = control.groundSource === 'amap-click' ? 'amap-click' : 'manual'
    let gcj02: GroundPoint
    if (source === 'amap-click' && control.groundSourceCrs === 'GCJ-02' && control.groundSourceOriginal) {
      gcj02 = { ...control.groundSourceOriginal }
    } else {
      const [lng, lat] = wgs84ToGcj02(control.ground.lng, control.ground.lat)
      gcj02 = { lng, lat }
    }
    return {
      id: control.id,
      ...(control.label ? { label: control.label } : {}),
      role,
      pixel: { ...control.pixel },
      wgs84: { ...control.ground },
      gcj02,
      source,
    }
  })
}

export function getProjectedBoundaryGcj02(session: GeoreferenceSession, fit?: GeoreferenceFitResult): GroundPoint[] {
  if (!fit || session.boundaryPixels.length < 3) return []
  const wgs84 = transformPixelPolygon(fit.model, session.boundaryPixels)
  return wgs84.map((point) => {
    const [lng, lat] = wgs84ToGcj02(point.lng, point.lat)
    return { lng, lat }
  })
}

export function getControlDisplayStyle(role: GeoreferenceControlRole = 'fit', selected = false): ControlDisplayStyle {
  const label = role === 'check' ? '检查' : '拟合'
  return {
    role,
    selected,
    label,
    cssClass: `georef-control-${role}${selected ? ' selected' : ''}`,
  }
}
