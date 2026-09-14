import { wgs84ToGcj02 } from '../geo/wgs84ToGcj02.ts'
import type { UncertainCheckHoldoutResult } from './checkUncertainty.ts'
import type { GeoreferenceSession, GroundPoint } from './types.ts'

export interface CheckUncertaintyOverlayCircle {
  controlId: string
  centerGcj02: GroundPoint
  radiusM: number
  interpretation: 'compatible' | 'tension' | 'inconsistent'
  standardizedResidual: number
}

export function buildCheckUncertaintyOverlay(
  session: GeoreferenceSession,
  result: UncertainCheckHoldoutResult,
): CheckUncertaintyOverlayCircle[] {
  if (!result.available) return []
  const byId = new Map(session.controls.filter((control) => control.role === 'check').map((control) => [control.id, control]))
  return result.checks.flatMap((item) => {
    const control = byId.get(item.controlId)
    if (!control) return []
    const [lng, lat] = wgs84ToGcj02(control.ground.lng, control.ground.lat)
    return [{
      controlId: item.controlId,
      centerGcj02: { lng, lat },
      radiusM: item.effectiveSigmaM * 2,
      interpretation: item.interpretation,
      standardizedResidual: item.standardizedResidual,
    }]
  })
}
