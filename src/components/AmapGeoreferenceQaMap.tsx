import { useEffect, useMemo, useRef, useState } from 'react'
import type { CaveTempleSite } from '../data/types'
import { gcj02ToWgs84 } from '../geo/gcj02ToWgs84'
import { getAmapPickerCenter } from '../georef/amapPicker'
import { getControlDisplayStyle, getDualMapControlMarkers, getProjectedBoundaryGcj02 } from '../georef/dualMap'
import { buildModelBoundaryOverlays, errorVectorSeverity } from '../georef/diagnosticOverlay'
import type { ErrorFieldResult } from '../georef/errorField'
import type { ModelComparisonResult } from '../georef/modelComparison'
import type { FitPointInfluenceResult } from '../georef/controlInfluence'
import type { RobustGeoreferenceResult } from '../georef/robustRansac'
import { buildRobustBoundaryOverlay } from '../georef/robustOverlay'
import type { IrlsGeoreferenceResult } from '../georef/robustIrls'
import { buildIrlsBoundaryOverlays } from '../georef/irlsOverlay'
import { combineIrlsPointDiagnostics } from '../georef/irlsView'
import { combineControlReviewPriority } from '../georef/controlReviewPriority'
import type { PiecewisePreviewResult } from '../georef/piecewisePreview'
import type { MonteCarloUncertaintyResult } from '../georef/monteCarloUncertainty'
import { buildMonteCarloBoundaryOverlay } from '../georef/monteCarloOverlay'
import type { SystematicStressResult, SystematicStressScenarioId } from '../georef/systematicStress'
import { buildSystematicStressOverlay } from '../georef/systematicStressOverlay'
import type { UncertainCheckHoldoutResult } from '../georef/checkUncertainty'
import { buildCheckUncertaintyOverlay } from '../georef/checkUncertaintyOverlay'
import type { GeoreferenceFitResult, GeoreferenceSession, GroundPoint } from '../georef/types'
import { loadAmap } from '../map/amapLoader'

export interface DualMapGroundPick {
  gcj02: GroundPoint
  wgs84: GroundPoint
}

interface Props {
  site: CaveTempleSite
  session: GeoreferenceSession
  fit?: GeoreferenceFitResult
  selectedControlId?: string
  overlayOpacity: number
  groundPickEnabled: boolean
  onSelectControl: (controlId: string) => void
  onGroundPick: (pick: DualMapGroundPick) => void
  errorField?: ErrorFieldResult
  modelComparison?: ModelComparisonResult
  controlInfluence?: FitPointInfluenceResult
  robust?: RobustGeoreferenceResult
  irls?: IrlsGeoreferenceResult
  piecewisePreview?: PiecewisePreviewResult
  monteCarlo?: MonteCarloUncertaintyResult
  systematicStress?: SystematicStressResult
  uncertainCheck?: UncertainCheckHoldoutResult
  systematicStressScenarioId?: SystematicStressScenarioId
  showPiecewisePreview: boolean
  onTogglePiecewisePreview: () => void
}

export function AmapGeoreferenceQaMap({
  site,
  session,
  fit,
  selectedControlId,
  overlayOpacity,
  groundPickEnabled,
  onSelectControl,
  onGroundPick,
  errorField,
  modelComparison,
  controlInfluence,
  robust,
  irls,
  piecewisePreview,
  monteCarlo,
  systematicStress,
  uncertainCheck,
  systematicStressScenarioId,
  showPiecewisePreview,
  onTogglePiecewisePreview,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])
  const polygonRef = useRef<any>(null)
  const pickMarkerRef = useRef<any>(null)
  const errorLinesRef = useRef<any[]>([])
  const comparisonLinesRef = useRef<any[]>([])
  const robustLineRef = useRef<any>(null)
  const irlsLinesRef = useRef<any[]>([])
  const piecewiseLinesRef = useRef<any[]>([])
  const monteCarloOverlaysRef = useRef<any[]>([])
  const systematicStressOverlaysRef = useRef<any[]>([])
  const checkUncertaintyOverlaysRef = useRef<any[]>([])
  const groundPickEnabledRef = useRef(groundPickEnabled)
  const onGroundPickRef = useRef(onGroundPick)
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing-key' | 'error'>('loading')
  const [error, setError] = useState('')
  const [lastPick, setLastPick] = useState<DualMapGroundPick>()
  const [showErrorVectors, setShowErrorVectors] = useState(true)
  const [showModelComparison, setShowModelComparison] = useState(true)
  const [showRobustModel, setShowRobustModel] = useState(true)
  const [showIrlsModels, setShowIrlsModels] = useState(true)
  const [showMonteCarlo, setShowMonteCarlo] = useState(true)
  const [showSystematicStress, setShowSystematicStress] = useState(true)
  const [showCheckUncertainty, setShowCheckUncertainty] = useState(true)
  const key = import.meta.env.VITE_AMAP_KEY ?? ''
  const security = import.meta.env.VITE_AMAP_SECURITY_CODE ?? ''

  const controls = useMemo(() => getDualMapControlMarkers(session), [session])
  const projectedBoundary = useMemo(() => getProjectedBoundaryGcj02(session, fit), [fit, session])
  const comparisonBoundaries = useMemo(() => buildModelBoundaryOverlays(modelComparison ?? { available: false, reason: 'not evaluated' }), [modelComparison])
  const influenceById = useMemo(() => new Map(controlInfluence?.available ? controlInfluence.points.map((item) => [item.controlId, item]) : []), [controlInfluence])
  const robustById = useMemo(() => new Map(robust?.available ? robust.points.map((item) => [item.controlId, item]) : []), [robust])
  const robustBoundary = useMemo(() => buildRobustBoundaryOverlay(session, robust ?? { available: false, reason: 'not evaluated' }), [robust, session])
  const irlsRecords = useMemo(() => combineIrlsPointDiagnostics(irls ?? { available: false, reason: 'not evaluated' }), [irls])
  const irlsById = useMemo(() => new Map(irlsRecords.map((item) => [item.controlId, item])), [irlsRecords])
  const reviewPriorityById = useMemo(() => new Map(controls.map((control) => [control.id, combineControlReviewPriority({
    influence: influenceById.get(control.id)?.status,
    ransac: robustById.get(control.id)?.status,
    irls: irlsById.get(control.id)?.status,
  })])), [controls, influenceById, irlsById, robustById])
  const irlsBoundaries = useMemo(() => buildIrlsBoundaryOverlays(session, irls ?? { available: false, reason: 'not evaluated' }), [irls, session])
  const monteCarloOverlay = useMemo(() => monteCarlo ? buildMonteCarloBoundaryOverlay(monteCarlo) : undefined, [monteCarlo])
  const systematicStressOverlay = useMemo(() => systematicStress ? buildSystematicStressOverlay(systematicStress, systematicStressScenarioId) : undefined, [systematicStress, systematicStressScenarioId])
  const checkUncertaintyOverlay = useMemo(() => uncertainCheck ? buildCheckUncertaintyOverlay(session, uncertainCheck) : [], [session, uncertainCheck])

  useEffect(() => {
    groundPickEnabledRef.current = groundPickEnabled
    if (!groundPickEnabled) {
      setLastPick(undefined)
      pickMarkerRef.current?.setMap(null)
      pickMarkerRef.current = undefined
    }
  }, [groundPickEnabled])
  useEffect(() => { onGroundPickRef.current = onGroundPick }, [onGroundPick])

  useEffect(() => {
    let cancelled = false
    if (!key || key === 'AMAP_KEY') {
      setStatus('missing-key')
      return
    }
    setStatus('loading')
    loadAmap(key, security).then((AMap) => {
      if (cancelled || !containerRef.current) return
      const center = getAmapPickerCenter(site)
      const map = new AMap.Map(containerRef.current, {
        center,
        zoom: center[0] === 105.5 && center[1] === 35.8 ? 4.5 : 15,
        viewMode: '2D',
        mapStyle: 'amap://styles/normal',
      })
      mapRef.current = map
      map.on('click', (event: any) => {
        if (!groundPickEnabledRef.current) return
        const lng = Number(event.lnglat?.getLng?.() ?? event.lnglat?.lng)
        const lat = Number(event.lnglat?.getLat?.() ?? event.lnglat?.lat)
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) return
        const [wgsLng, wgsLat] = gcj02ToWgs84(lng, lat)
        const pick = { gcj02: { lng, lat }, wgs84: { lng: wgsLng, lat: wgsLat } }
        setLastPick(pick)
        onGroundPickRef.current(pick)
        if (pickMarkerRef.current) pickMarkerRef.current.setMap(null)
        const el = document.createElement('div')
        el.className = 'georef-modern-crosshair'
        el.innerHTML = '<i></i><b></b>'
        pickMarkerRef.current = new AMap.Marker({ position: [lng, lat], content: el, offset: new AMap.Pixel(-12, -12), zIndex: 260 })
        pickMarkerRef.current.setMap(map)
      })
      setStatus('ready')
    }).catch((reason) => {
      if (cancelled) return
      const message = reason instanceof Error ? reason.message : String(reason)
      setStatus(message === 'AMAP_KEY_MISSING' ? 'missing-key' : 'error')
      setError(message)
    })
    return () => {
      cancelled = true
      markersRef.current.forEach((marker) => marker.setMap(null))
      markersRef.current = []
      polygonRef.current?.setMap(null)
      pickMarkerRef.current?.setMap(null)
      errorLinesRef.current.forEach((line) => line.setMap(null))
      comparisonLinesRef.current.forEach((line) => line.setMap(null))
      robustLineRef.current?.setMap(null)
      irlsLinesRef.current.forEach((line) => line.setMap(null))
      piecewiseLinesRef.current.forEach((line) => line.setMap(null))
      monteCarloOverlaysRef.current.forEach((overlay) => overlay.setMap(null))
      systematicStressOverlaysRef.current.forEach((overlay) => overlay.setMap(null))
      checkUncertaintyOverlaysRef.current.forEach((overlay) => overlay.setMap(null))
      mapRef.current?.destroy?.()
      mapRef.current = undefined
    }
  }, [key, security, site])

  useEffect(() => {
    if (status !== 'ready' || !mapRef.current || !window.AMap) return
    markersRef.current.forEach((marker) => marker.setMap(null))
    markersRef.current = controls.map((control, index) => {
      const selected = selectedControlId === control.id
      const style = getControlDisplayStyle(control.role, selected)
      const influence = influenceById.get(control.id)
      const robustPoint = robustById.get(control.id)
      const irlsPoint = irlsById.get(control.id)
      const reviewPriority = reviewPriorityById.get(control.id)
      const el = document.createElement('button')
      el.type = 'button'
      el.className = `georef-modern-control ${style.cssClass} ${influence ? `influence-${influence.status}` : ''} ${robustPoint ? `robust-${robustPoint.status}` : ''} ${irlsPoint ? `irls-${irlsPoint.status}` : ''} ${reviewPriority && reviewPriority.priority !== 'none' ? `review-${reviewPriority.priority}` : ''}`
      el.textContent = String(index + 1)
      el.title = `${control.label ?? `CP${index + 1}`} · ${style.label} · ${control.source === 'amap-click' ? '高德原始点' : 'WGS84转换显示'}${influence ? ` · influence ${influence.status}` : ''}${robustPoint ? ` · RANSAC ${robustPoint.status} ${(robustPoint.outlierVoteRate * 100).toFixed(0)}%` : ''}${irlsPoint ? ` · IRLS min weight ${irlsPoint.minWeight.toFixed(2)}` : ''}${reviewPriority && reviewPriority.priority !== 'none' ? ` · ${reviewPriority.label}` : ''}`
      const marker = new window.AMap.Marker({
        position: [control.gcj02.lng, control.gcj02.lat],
        content: el,
        offset: new window.AMap.Pixel(-14, -14),
        zIndex: selected ? 240 : reviewPriority?.priority === 'high' ? 236 : robustPoint?.status === 'outlier' ? 230 : irlsPoint?.status === 'severe' ? 228 : influence?.status === 'suspect' ? 225 : influence?.status === 'supportive' ? 205 : control.role === 'check' ? 180 : 190,
        bubble: false,
      })
      marker.on('click', () => onSelectControl(control.id))
      marker.setMap(mapRef.current)
      return marker
    })
  }, [controls, influenceById, irlsById, onSelectControl, reviewPriorityById, robustById, selectedControlId, status])

  useEffect(() => {
    if (status !== 'ready' || !mapRef.current || !window.AMap) return
    polygonRef.current?.setMap(null)
    polygonRef.current = undefined
    if (projectedBoundary.length < 4) return
    polygonRef.current = new window.AMap.Polygon({
      path: projectedBoundary.map((point) => [point.lng, point.lat]),
      strokeColor: '#722e29',
      strokeOpacity: 0.95,
      strokeWeight: 2,
      strokeStyle: 'dashed',
      fillColor: '#722e29',
      fillOpacity: overlayOpacity,
      zIndex: 80,
    })
    polygonRef.current.setMap(mapRef.current)
  }, [overlayOpacity, projectedBoundary, status])

  useEffect(() => {
    if (status !== 'ready' || !mapRef.current || !window.AMap) return
    errorLinesRef.current.forEach((line) => line.setMap(null))
    errorLinesRef.current = []
    if (!showErrorVectors || !errorField?.available) return
    errorLinesRef.current = errorField.vectors.map((vector) => {
      const severity = errorVectorSeverity(vector.residualM, session.qaThresholds)
      const color = severity === 'pass' ? '#315a49' : severity === 'review' ? '#b17b34' : '#b33d32'
      const line = new window.AMap.Polyline({
        path: [
          [vector.predictedGcj02.lng, vector.predictedGcj02.lat],
          [vector.actualGcj02.lng, vector.actualGcj02.lat],
        ],
        strokeColor: color,
        strokeOpacity: 0.95,
        strokeWeight: 4,
        showDir: true,
        zIndex: 145,
      })
      line.on?.('click', () => onSelectControl(vector.controlId))
      line.setMap(mapRef.current)
      return line
    })
  }, [errorField, onSelectControl, session.qaThresholds, showErrorVectors, status])

  useEffect(() => {
    if (status !== 'ready' || !mapRef.current || !window.AMap) return
    comparisonLinesRef.current.forEach((line) => line.setMap(null))
    comparisonLinesRef.current = []
    if (!showModelComparison) return
    comparisonLinesRef.current = comparisonBoundaries.map((overlay) => {
      const line = new window.AMap.Polyline({
        path: overlay.path.map((point) => [point.lng, point.lat]),
        strokeColor: overlay.method === 'affine' ? '#315a49' : '#76508a',
        strokeOpacity: 0.9,
        strokeWeight: 3,
        strokeStyle: overlay.method === 'affine' ? 'solid' : 'dashed',
        zIndex: 125,
      })
      line.setMap(mapRef.current)
      return line
    })
  }, [comparisonBoundaries, showModelComparison, status])

  useEffect(() => {
    if (status !== 'ready' || !mapRef.current || !window.AMap) return
    robustLineRef.current?.setMap(null)
    robustLineRef.current = undefined
    if (!showRobustModel || !robustBoundary || robustBoundary.path.length < 4) return
    robustLineRef.current = new window.AMap.Polyline({
      path: robustBoundary.path.map((point) => [point.lng, point.lat]),
      strokeColor: '#2f7f86',
      strokeOpacity: 0.95,
      strokeWeight: 4,
      strokeStyle: 'dashed',
      zIndex: 138,
    })
    robustLineRef.current.setMap(mapRef.current)
  }, [robustBoundary, showRobustModel, status])

  useEffect(() => {
    if (status !== 'ready' || !mapRef.current || !window.AMap) return
    irlsLinesRef.current.forEach((line) => line.setMap(null))
    irlsLinesRef.current = []
    if (!showIrlsModels || !irlsBoundaries.length) return
    irlsLinesRef.current = irlsBoundaries.map((overlay) => {
      const isHuber = overlay.estimator === 'huber'
      const line = new window.AMap.Polyline({
        path: overlay.path.map((point) => [point.lng, point.lat]),
        strokeColor: isHuber ? '#c07a2c' : '#3c6e9d',
        strokeOpacity: 0.9,
        strokeWeight: 3,
        strokeStyle: isHuber ? 'solid' : 'dashed',
        zIndex: isHuber ? 132 : 133,
      })
      line.setMap(mapRef.current)
      return line
    })
  }, [irlsBoundaries, showIrlsModels, status])

  useEffect(() => {
    if (status !== 'ready' || !mapRef.current || !window.AMap) return
    piecewiseLinesRef.current.forEach((line) => line.setMap(null))
    piecewiseLinesRef.current = []
    if (!showPiecewisePreview || !piecewisePreview?.available) return
    const overlays: any[] = []
    if (piecewisePreview.boundaryGcj02.length >= 4) {
      const boundary = new window.AMap.Polyline({
        path: piecewisePreview.boundaryGcj02.map((point) => [point.lng, point.lat]),
        strokeColor: '#9a4b78',
        strokeOpacity: 0.98,
        strokeWeight: 4,
        strokeStyle: 'dashed',
        zIndex: 151,
      })
      boundary.setMap(mapRef.current)
      overlays.push(boundary)
    }
    for (const region of piecewisePreview.regionOutlinesGcj02) {
      const line = new window.AMap.Polyline({
        path: region.path.map((point) => [point.lng, point.lat]),
        strokeColor: region.foldOverRisk ? '#b33d32' : '#8a6f8e',
        strokeOpacity: region.foldOverRisk ? 0.95 : 0.48,
        strokeWeight: region.foldOverRisk ? 4 : 2,
        strokeStyle: 'dashed',
        zIndex: region.foldOverRisk ? 154 : 149,
      })
      line.setMap(mapRef.current)
      overlays.push(line)
    }
    for (const seam of piecewisePreview.seamVectors) {
      const color = seam.severity === 'pass' ? '#315a49' : seam.severity === 'review' ? '#b17b34' : '#b33d32'
      const line = new window.AMap.Polyline({
        path: [[seam.aGcj02.lng, seam.aGcj02.lat], [seam.bGcj02.lng, seam.bGcj02.lat]],
        strokeColor: color,
        strokeOpacity: 0.96,
        strokeWeight: seam.severity === 'fail' ? 5 : 3,
        zIndex: 158,
      })
      line.setMap(mapRef.current)
      overlays.push(line)
    }
    piecewiseLinesRef.current = overlays
  }, [piecewisePreview, showPiecewisePreview, status])

  useEffect(() => {
    if (status !== 'ready' || !mapRef.current || !window.AMap) return
    monteCarloOverlaysRef.current.forEach((overlay) => overlay.setMap(null))
    monteCarloOverlaysRef.current = []
    if (!showMonteCarlo || !monteCarloOverlay) return
    const overlays: any[] = []
    for (const vertex of monteCarloOverlay.vertices) {
      const circle = new window.AMap.Circle({
        center: [vertex.gcj02.lng, vertex.gcj02.lat],
        radius: Math.max(0.1, vertex.radiusM),
        strokeColor: '#7b5aa6',
        strokeOpacity: 0.7,
        strokeWeight: 1.5,
        fillColor: '#7b5aa6',
        fillOpacity: 0.08,
        zIndex: 128,
      })
      circle.setMap(mapRef.current)
      overlays.push(circle)
    }
    const unstable = monteCarloOverlay.unstableSegment
    const line = new window.AMap.Polyline({
      path: unstable.path.map((point) => [point.lng, point.lat]),
      strokeColor: '#8d315b',
      strokeOpacity: 0.98,
      strokeWeight: 5,
      strokeStyle: 'solid',
      zIndex: 162,
    })
    line.setMap(mapRef.current)
    overlays.push(line)
    monteCarloOverlaysRef.current = overlays
  }, [monteCarloOverlay, showMonteCarlo, status])


  useEffect(() => {
    if (status !== 'ready' || !mapRef.current || !window.AMap) return
    systematicStressOverlaysRef.current.forEach((overlay) => overlay.setMap(null))
    systematicStressOverlaysRef.current = []
    if (!showSystematicStress || !systematicStressOverlay) return
    const overlays: any[] = []
    const baseline = new window.AMap.Polyline({
      path: systematicStressOverlay.baselinePath.map((point) => [point.lng, point.lat]),
      strokeColor: '#6f756f', strokeOpacity: 0.55, strokeWeight: 2, strokeStyle: 'dashed', zIndex: 164,
    })
    baseline.setMap(mapRef.current)
    overlays.push(baseline)
    const stressed = new window.AMap.Polyline({
      path: systematicStressOverlay.stressedPath.map((point) => [point.lng, point.lat]),
      strokeColor: '#c35f2f', strokeOpacity: 0.98, strokeWeight: 4, strokeStyle: 'solid', zIndex: 166,
    })
    stressed.setMap(mapRef.current)
    overlays.push(stressed)
    for (const vector of systematicStressOverlay.vectors) {
      if (vector.shiftM < 0.25) continue
      const line = new window.AMap.Polyline({
        path: vector.path.map((point) => [point.lng, point.lat]),
        strokeColor: '#d18a36', strokeOpacity: 0.9, strokeWeight: 2.5, showDir: true, zIndex: 167,
      })
      line.setMap(mapRef.current)
      overlays.push(line)
    }
    const unstable = systematicStressOverlay.unstableSegment
    const unstableLine = new window.AMap.Polyline({
      path: unstable.path.map((point) => [point.lng, point.lat]),
      strokeColor: '#b33d32', strokeOpacity: 1, strokeWeight: 6, zIndex: 169,
    })
    unstableLine.setMap(mapRef.current)
    overlays.push(unstableLine)
    systematicStressOverlaysRef.current = overlays
  }, [showSystematicStress, status, systematicStressOverlay])

  useEffect(() => {
    if (status !== 'ready' || !mapRef.current || !window.AMap) return
    checkUncertaintyOverlaysRef.current.forEach((overlay) => overlay.setMap(null))
    checkUncertaintyOverlaysRef.current = []
    if (!showCheckUncertainty || !checkUncertaintyOverlay.length) return
    const overlays: any[] = []
    for (const item of checkUncertaintyOverlay) {
      const color = item.interpretation === 'compatible' ? '#315a49' : item.interpretation === 'tension' ? '#b17b34' : '#b33d32'
      const circle = new window.AMap.Circle({
        center: [item.centerGcj02.lng, item.centerGcj02.lat],
        radius: Math.max(0.25, item.radiusM),
        strokeColor: color,
        strokeOpacity: 0.72,
        strokeWeight: 1.5,
        fillColor: color,
        fillOpacity: 0.05,
        zIndex: 126,
      })
      circle.setMap(mapRef.current)
      overlays.push(circle)
    }
    checkUncertaintyOverlaysRef.current = overlays
  }, [checkUncertaintyOverlay, showCheckUncertainty, status])

  useEffect(() => {
    if (status !== 'ready' || !mapRef.current || !selectedControlId) return
    const selected = controls.find((control) => control.id === selectedControlId)
    if (selected) mapRef.current.panTo([selected.gcj02.lng, selected.gcj02.lat], 250)
  }, [controls, selectedControlId, status])

  return (
    <section className="georef-modern-column" aria-label="现代高德地图视觉验收">
      <div className="georef-modern-head">
        <div><strong>现代高德底图</strong><span>控制点联动 · 实时投影与误差诊断仅用于 visual QA</span></div>
        <div className="georef-modern-diagnostic-toggles">
          <button type="button" className={showErrorVectors ? 'active' : ''} disabled={!errorField?.available} onClick={() => setShowErrorVectors((value) => !value)}>误差向量</button>
          <button type="button" className={showModelComparison ? 'active comparison' : ''} disabled={!comparisonBoundaries.length} onClick={() => setShowModelComparison((value) => !value)}>双模型</button>
          <button type="button" className={showRobustModel ? 'active robust' : ''} disabled={!robust?.available || !robustBoundary} onClick={() => setShowRobustModel((value) => !value)}>Robust</button>
          <button type="button" className={showIrlsModels ? 'active irls' : ''} disabled={!irls?.available || !irlsBoundaries.length} onClick={() => setShowIrlsModels((value) => !value)}>IRLS</button>
          <button type="button" className={showPiecewisePreview ? 'active piecewise' : ''} disabled={!piecewisePreview?.available} onClick={onTogglePiecewisePreview}>Piecewise</button>
          <button type="button" className={showMonteCarlo ? 'active uncertainty' : ''} disabled={!monteCarloOverlay} onClick={() => setShowMonteCarlo((value) => !value)}>P95不确定性</button>
          <button type="button" className={showCheckUncertainty ? 'active check-uncertainty' : ''} disabled={!checkUncertaintyOverlay.length} onClick={() => setShowCheckUncertainty((value) => !value)}>Check ±2σ</button>
          <button type="button" className={showSystematicStress ? 'active stress' : ''} disabled={!systematicStressOverlay} onClick={() => setShowSystematicStress((value) => !value)}>系统压力</button>
        </div>
        <div className="georef-modern-legend"><span><i className="fit" />拟合</span><span><i className="check" />检查</span><span><i className="boundary" />当前边界</span><span><i className="affine-boundary" />Affine</span><span><i className="projective-boundary" />Projective</span><span><i className="robust-boundary" />Robust</span><span><i className="huber-boundary" />Huber</span><span><i className="tukey-boundary" />Tukey</span><span><i className="piecewise-boundary" />Piecewise</span><span><i className="piecewise-seam" />Seam跳变</span><span><i className="uncertainty-circle" />P95包络</span><span><i className="check-uncertainty-circle" />Check ±2σ</span><span><i className="stress-boundary" />压力边界</span><span><i className="stress-vector" />系统位移</span><span><i className="unstable-segment" />最不稳定段</span><span><i className="error-vector" />检查误差</span></div>
      </div>
      <div className="georef-modern-map-wrap">
        <div ref={containerRef} className="georef-modern-map" />
        {status === 'missing-key' && <div className="georef-modern-notice"><b>等待高德 Key</b><span>未配置时，历史图、拟合、QA、GeoJSON 与晋升流程仍可继续使用。</span></div>}
        {status === 'loading' && <div className="georef-modern-notice"><b>正在加载高德地图</b></div>}
        {status === 'error' && <div className="georef-modern-notice"><b>高德地图加载失败</b><span>{error}</span></div>}
        <div className={`georef-modern-pick-hint ${groundPickEnabled ? 'enabled' : ''}`}>
          {groundPickEnabled ? '已在历史图选择像素：点击现代地图写入对应 ground point' : '先在历史图“控制点模式”点击像素，再到这里点击对应真实地物'}
        </div>
      </div>
      <footer className="georef-modern-footer">
        <span>{controls.length} 个控制点 · {projectedBoundary.length >= 4 ? '边界投影已显示' : '拟合并描边后显示实时 Polygon'}{showPiecewisePreview && piecewisePreview?.available ? ` · Piecewise seam max ${piecewisePreview.seamMaxM.toFixed(1)}m` : ''}{showMonteCarlo && monteCarlo?.available && monteCarlo.boundary ? ` · MC P95 max ${monteCarlo.boundary.maxP95M.toFixed(1)}m` : ''}{showCheckUncertainty && uncertainCheck?.available ? ` · check max ${uncertainCheck.maxStandardizedResidual.toFixed(1)}σ` : ''}{showSystematicStress && systematicStressOverlay ? ` · Stress ${systematicStressOverlay.scenarioLabel} / ${systematicStressOverlay.variantLabel}` : ''}</span>
        {lastPick && <span>最近点击 GCJ-02 {lastPick.gcj02.lng.toFixed(6)}, {lastPick.gcj02.lat.toFixed(6)}</span>}
      </footer>
    </section>
  )
}
