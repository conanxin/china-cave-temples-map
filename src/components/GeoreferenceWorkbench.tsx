import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { AmapGeoreferenceQaMap, type DualMapGroundPick } from './AmapGeoreferenceQaMap'
import type { CaveTempleSite } from '../data/types'
import { getSpatialMapTargetsForSite } from '../data/spatialMapTargets'
import { buildSessionGeoJson } from '../georef/workbench'
import { evaluateSessionQa } from '../georef/advancedQa'
import { compareAreaHa, geodesicPolygonAreaHa } from '../georef/areaQa'
import { transformPixelPolygon } from '../georef/geojson'
import { assessReviewReadiness } from '../georef/reviewReadiness'
import { createSession, parseSession, serializeSession, sessionStorageKey } from '../georef/session'
import { clearGroundProvenance, createAmapLinkedControlPoint, createManualControlPoint } from '../georef/mapLinkedControl'
import type { GeoreferenceAdvancedQaResult, GeoreferenceCalibrationBasis, GeoreferenceFitResult, GeoreferenceGroundEvidence, GeoreferencePixelEvidence, GeoreferenceSession, GeoreferenceUncertaintyReviewStatus, PixelPoint } from '../georef/types'
import { approveCanonicalExtentPatch, approvalTokenForPatch, buildCanonicalExtentPatch, type CanonicalExtentPatch } from '../georef/canonicalExtentPatch'
import { analyzeCheckErrorField } from '../georef/errorField'
import { compareGeoreferenceModels } from '../georef/modelComparison'
import { analyzeFitPointInfluence } from '../georef/controlInfluence'
import { influenceTone, sortInfluenceRecords } from '../georef/controlInfluenceView'
import { analyzeRobustGeoreference } from '../georef/robustRansac'
import { robustPointDisplay } from '../georef/robustOverlay'
import { analyzeIrlsGeoreference } from '../georef/robustIrls'
import { combineIrlsPointDiagnostics, irlsCombinedDisplay } from '../georef/irlsView'
import { combineControlReviewPriority } from '../georef/controlReviewPriority'
import { analyzeLocalDistortion, compareLocalDistortionAnalyses, type LocalDistortionModelAnalysis } from '../georef/localDistortion'
import { simulatePiecewiseRegistration, type PiecewiseLayout } from '../georef/piecewiseRegistration'
import { buildPiecewisePreview } from '../georef/piecewisePreview'
import { choosePiecewisePreviewLayout, piecewisePreviewTone } from '../georef/piecewisePreviewView'
import { evaluateSpatialCrossValidation } from '../georef/spatialCrossValidation'
import { analyzeMonteCarloUncertainty } from '../georef/monteCarloUncertainty'
import { analyzeSystematicStress, type SystematicStressScenarioId } from '../georef/systematicStress'
import { resolveControlUncertainty, summarizeControlUncertainty } from '../georef/controlUncertainty'
import { analyzeUncertainCheckHoldout } from '../georef/checkUncertainty'
import { checkInterpretationDisplay, sortUncertainChecks } from '../georef/checkUncertaintyView'
import { auditControlUncertaintyEvidence, summarizeUncertaintyEvidenceAudit } from '../georef/uncertaintyEvidenceAudit'
import { uncertaintyEvidenceGradeDisplay } from '../georef/uncertaintyEvidenceAuditView'
import { buildEvidenceResearchBacklog } from '../georef/evidenceResearchBacklog'
import { evidenceBacklogActionLabel, evidenceBacklogPriorityDisplay } from '../georef/evidenceResearchBacklogView'

interface Props {
  site: CaveTempleSite
  onClose: () => void
}

type CaptureMode = 'control' | 'boundary'

export function GeoreferenceWorkbench({ site, onClose }: Props) {
  const targets = useMemo(() => getSpatialMapTargetsForSite(site.id), [site.id])
  const initialTarget = targets[0]
  const initialTargetId = initialTarget?.id
  const [session, setSession] = useState<GeoreferenceSession>(() => loadSession(site.id, initialTargetId, initialTarget?.linkedExtentIds[0]))
  const [imageUrl, setImageUrl] = useState<string>()
  const imageUrlRef = useRef<string>()
  const [captureMode, setCaptureMode] = useState<CaptureMode>('control')
  const [pendingPixel, setPendingPixel] = useState<PixelPoint>()
  const [pendingLng, setPendingLng] = useState('')
  const [pendingLat, setPendingLat] = useState('')
  const [pendingRole, setPendingRole] = useState<'fit' | 'check'>('fit')
  const [pendingAmapPick, setPendingAmapPick] = useState<DualMapGroundPick>()
  const [selectedControlId, setSelectedControlId] = useState<string>()
  const [overlayOpacity, setOverlayOpacity] = useState(0.18)
  const [showLocalDistortionField, setShowLocalDistortionField] = useState(true)
  const [showPiecewisePreview, setShowPiecewisePreview] = useState(true)
  const [piecewisePreviewRequestedLayout, setPiecewisePreviewRequestedLayout] = useState<PiecewiseLayout>()
  const [systematicStressScenarioId, setSystematicStressScenarioId] = useState<SystematicStressScenarioId>()
  const [fit, setFit] = useState<GeoreferenceFitResult>()
  const [advancedQa, setAdvancedQa] = useState<GeoreferenceAdvancedQaResult>()
  const [fitError, setFitError] = useState<string>()
  const [importError, setImportError] = useState<string>()
  const [canonicalDraft, setCanonicalDraft] = useState<CanonicalExtentPatch>()
  const [canonicalApproved, setCanonicalApproved] = useState<CanonicalExtentPatch>()
  const [canonicalApprovalInput, setCanonicalApprovalInput] = useState('')
  const [canonicalPatchError, setCanonicalPatchError] = useState<string>()

  const target = targets.find((item) => item.id === session.targetId)
  const minimumControls = session.method === 'affine' ? 3 : 4
  const fitControlCount = session.controls.filter((item) => item.role !== 'check').length
  const checkControlCount = session.controls.filter((item) => item.role === 'check').length
  const uncertaintyById = useMemo(() => new Map(session.controls.map((control) => [control.id, resolveControlUncertainty(control)])), [session.controls])
  const uncertaintySummary = useMemo(() => summarizeControlUncertainty(session.controls), [session.controls])
  const uncertaintyAuditRecords = useMemo(() => session.controls.map(auditControlUncertaintyEvidence).sort((a, b) => { const rank = { fallback: 0, heuristic: 1, 'evidence-backed': 2, reviewed: 3 }; return rank[a.grade] - rank[b.grade] || a.controlId.localeCompare(b.controlId) }), [session.controls])
  const uncertaintyAuditById = useMemo(() => new Map(uncertaintyAuditRecords.map((item) => [item.controlId, item])), [uncertaintyAuditRecords])
  const uncertaintyAuditSummary = useMemo(() => summarizeUncertaintyEvidenceAudit(session.controls), [session.controls])
  const selectedControlIndex = selectedControlId ? session.controls.findIndex((control) => control.id === selectedControlId) : -1
  const selectedControl = selectedControlIndex >= 0 ? session.controls[selectedControlIndex] : undefined
  const selectedControlAudit = selectedControl ? uncertaintyAuditById.get(selectedControl.id) : undefined
  const residualById = new Map([
    ...(advancedQa?.fit.residuals ?? []),
    ...(advancedQa?.holdout?.residuals ?? []),
  ].map((item) => [item.controlId, item]))
  const boundaryExtentOptions = useMemo(() => {
    const linked = target?.linkedExtentIds ?? []
    const all = site.spatialExtents ?? []
    return (linked.length ? linked.map((id) => all.find((extent) => extent.id === id)).filter(Boolean) : all.filter((extent) => extent.areaHa != null)) as NonNullable<typeof site.spatialExtents>
  }, [site.spatialExtents, target])
  const selectedExtent = boundaryExtentOptions.find((extent) => extent.id === session.boundaryExtentId)
  const areaComparison = useMemo(() => {
    if (!fit || session.boundaryPixels.length < 3 || !selectedExtent?.areaHa) return undefined
    try {
      const wgsPolygon = transformPixelPolygon(fit.model, session.boundaryPixels)
      return compareAreaHa(geodesicPolygonAreaHa(wgsPolygon), selectedExtent.areaHa)
    } catch { return undefined }
  }, [fit, selectedExtent, session.boundaryPixels])
  const readiness = useMemo(() => advancedQa ? assessReviewReadiness(advancedQa, {
    boundaryTraced: session.boundaryPixels.length >= 3,
    officialAreaExpected: Boolean(selectedExtent?.areaHa),
    areaComparison,
  }) : undefined, [advancedQa, areaComparison, selectedExtent, session.boundaryPixels.length])
  const errorField = useMemo(() => fit ? analyzeCheckErrorField(session, fit.model) : undefined, [fit, session])
  const modelComparison = useMemo(() => compareGeoreferenceModels(session), [session])
  const controlInfluence = useMemo(() => fit ? analyzeFitPointInfluence(session) : undefined, [fit, session])
  const influenceRecords = useMemo(() => controlInfluence?.available ? sortInfluenceRecords(controlInfluence.points) : [], [controlInfluence])
  const influenceById = useMemo(() => new Map(influenceRecords.map((item) => [item.controlId, item])), [influenceRecords])
  const robust = useMemo(() => fit ? analyzeRobustGeoreference(session) : undefined, [fit, session])
  const robustRecords = useMemo(() => robust?.available ? [...robust.points].sort((a, b) => { const rank = { outlier: 0, ambiguous: 1, inlier: 2 }; return rank[a.status] - rank[b.status] || b.outlierVoteRate - a.outlierVoteRate }) : [], [robust])
  const robustById = useMemo(() => new Map(robustRecords.map((item) => [item.controlId, item])), [robustRecords])
  const irls = useMemo(() => fit ? analyzeIrlsGeoreference(session) : undefined, [fit, session])
  const localDistortion = useMemo(() => fit ? analyzeLocalDistortion(session, fit.model) : undefined, [fit, session])
  const localDistortionAnalyses = useMemo<LocalDistortionModelAnalysis[]>(() => {
    const models: Array<{ id: string; label: string; model: GeoreferenceFitResult['model'] }> = []
    if (modelComparison.available) {
      models.push({ id: 'affine', label: 'Affine', model: modelComparison.affine.model })
      models.push({ id: 'projective', label: 'Projective', model: modelComparison.projective.model })
    } else if (fit) {
      models.push({ id: 'current', label: session.method === 'affine' ? 'Current Affine' : 'Current Projective', model: fit.model })
    }
    if (robust?.available) models.push({ id: 'robust', label: 'RANSAC', model: robust.robustModel })
    if (irls?.available) {
      models.push({ id: 'huber', label: 'Huber', model: irls.huber.model })
      models.push({ id: 'tukey', label: 'Tukey', model: irls.tukey.model })
    }
    return models.map((item) => ({ ...item, analysis: analyzeLocalDistortion(session, item.model) }))
  }, [fit, irls, modelComparison, robust, session])
  const localDistortionComparison = useMemo(() => compareLocalDistortionAnalyses(localDistortionAnalyses, session.qaThresholds.passRmseM), [localDistortionAnalyses, session.qaThresholds.passRmseM])
  const piecewise = useMemo(() => simulatePiecewiseRegistration(session), [session])
  const spatialCv = useMemo(() => evaluateSpatialCrossValidation(session), [session])
  const monteCarlo = useMemo(() => fit ? analyzeMonteCarloUncertainty(session) : undefined, [fit, session])
  const systematicStress = useMemo(() => fit ? analyzeSystematicStress(session) : undefined, [fit, session])
  const uncertainCheck = useMemo(() => fit ? analyzeUncertainCheckHoldout(session, fit.model) : undefined, [fit, session])
  const uncertainCheckRecords = useMemo(() => uncertainCheck?.available ? sortUncertainChecks(uncertainCheck.checks) : [], [uncertainCheck])
  const spatialCvBestGlobal = useMemo(() => spatialCv.available ? spatialCv.models.find((model) => model.id === spatialCv.bestGlobalModelId && model.available) : undefined, [spatialCv])
  const spatialCvBestPiecewise = useMemo(() => spatialCv.available && spatialCv.bestPiecewiseModelId ? spatialCv.models.find((model) => model.id === spatialCv.bestPiecewiseModelId && model.available) : undefined, [spatialCv])
  const piecewisePreviewLayout = useMemo(() => choosePiecewisePreviewLayout(piecewise, piecewisePreviewRequestedLayout), [piecewise, piecewisePreviewRequestedLayout])
  const piecewisePreview = useMemo(() => piecewisePreviewLayout ? buildPiecewisePreview(session, piecewisePreviewLayout) : undefined, [piecewisePreviewLayout, session])
  const irlsRecords = useMemo(() => combineIrlsPointDiagnostics(irls ?? { available: false, reason: 'not evaluated' }), [irls])
  const irlsById = useMemo(() => new Map(irlsRecords.map((item) => [item.controlId, item])), [irlsRecords])
  const reviewPriorityById = useMemo(() => new Map(session.controls.map((control) => {
    const influence = influenceById.get(control.id)
    const robustPoint = robustById.get(control.id)
    const irlsPoint = irlsById.get(control.id)
    return [control.id, combineControlReviewPriority({ influence: influence?.status, ransac: robustPoint?.status, irls: irlsPoint?.status })]
  })), [influenceById, irlsById, robustById, session.controls])
  const highPriorityReviewCount = useMemo(() => [...reviewPriorityById.values()].filter((item) => item.priority === 'high').length, [reviewPriorityById])
  const evidenceBacklog = useMemo(() => buildEvidenceResearchBacklog(session.controls, { influence: controlInfluence, robust, irls, uncertainCheck }), [controlInfluence, irls, robust, session.controls, uncertainCheck])
  const errorFieldUnavailableReason = errorField && !errorField.available ? errorField.reason : '执行拟合后分析'
  const exports = useMemo(() => {
    if (!fit || session.boundaryPixels.length < 3) return undefined
    try { return buildSessionGeoJson(session, fit, { advancedQa, areaComparison, errorField, modelComparison, controlInfluence, robust, irls, localDistortion, localDistortionComparison, piecewise, spatialCv, monteCarlo, systematicStress, uncertainCheck }) } catch { return undefined }
  }, [advancedQa, areaComparison, controlInfluence, errorField, fit, irls, localDistortion, localDistortionComparison, modelComparison, monteCarlo, piecewise, robust, session, spatialCv, systematicStress, uncertainCheck])

  useEffect(() => {
    try { localStorage.setItem(sessionStorageKey(session.id), serializeSession(session)) } catch { /* local-only best effort */ }
  }, [session])

  useEffect(() => () => {
    if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current)
  }, [])

  function mutate(mutator: (current: GeoreferenceSession) => GeoreferenceSession) {
    setSession((current) => ({ ...mutator(current), updatedAt: new Date().toISOString() }))
    setFit(undefined)
    setAdvancedQa(undefined)
    setFitError(undefined)
    setCanonicalDraft(undefined)
    setCanonicalApproved(undefined)
    setCanonicalApprovalInput('')
    setCanonicalPatchError(undefined)
  }

  function switchTarget(targetId: string) {
    const nextTarget = targets.find((item) => item.id === targetId)
    setSession(loadSession(site.id, targetId || undefined, nextTarget?.linkedExtentIds[0]))
    setFit(undefined)
    setPendingPixel(undefined)
    setPendingAmapPick(undefined)
    setSelectedControlId(undefined)
    clearImage()
  }

  function resetSession() {
    const id = session.id
    const next = { ...createSession({ id, targetId: session.targetId, siteId: site.id }), boundaryExtentId: session.boundaryExtentId }
    setSession(next)
    setFit(undefined)
    setAdvancedQa(undefined)
    setFitError(undefined)
    setPendingPixel(undefined)
    setPendingAmapPick(undefined)
    setSelectedControlId(undefined)
  }

  function clearImage() {
    if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current)
    imageUrlRef.current = undefined
    setImageUrl(undefined)
  }

  function loadImage(file?: File) {
    if (!file) return
    clearImage()
    const url = URL.createObjectURL(file)
    imageUrlRef.current = url
    setImageUrl(url)
    mutate((current) => ({ ...current, imageName: file.name }))
  }

  function capturePixel(event: MouseEvent<HTMLImageElement>) {
    const image = event.currentTarget
    const rect = image.getBoundingClientRect()
    const pixel = {
      x: ((event.clientX - rect.left) / rect.width) * image.naturalWidth,
      y: ((event.clientY - rect.top) / rect.height) * image.naturalHeight,
    }
    if (captureMode === 'boundary') {
      mutate((current) => ({ ...current, boundaryPixels: [...current.boundaryPixels, pixel] }))
    } else {
      setPendingPixel(pixel)
      setPendingAmapPick(undefined)
      setPendingLng('')
      setPendingLat('')
    }
  }

  function addControl() {
    const lng = Number.parseFloat(pendingLng)
    const lat = Number.parseFloat(pendingLat)
    if (!pendingPixel || !Number.isFinite(lng) || !Number.isFinite(lat) || lng < -180 || lng > 180 || lat < -90 || lat > 90) return
    const controlId = `cp-${Date.now()}-${session.controls.length + 1}`
    mutate((current) => {
      const common = {
        id: controlId,
        label: `CP${current.controls.length + 1}`,
        role: pendingRole,
        pixel: pendingPixel,
      }
      const control = pendingAmapPick
        ? createAmapLinkedControlPoint({ ...common, gcj02: pendingAmapPick.gcj02 })
        : createManualControlPoint({ ...common, ground: { lng, lat } })
      return { ...current, controls: [...current.controls, control] }
    })
    setSelectedControlId(controlId)
    setPendingPixel(undefined)
    setPendingLng('')
    setPendingLat('')
    setPendingAmapPick(undefined)
  }

  function updateControlRole(index: number, role: 'fit' | 'check') {
    mutate((current) => ({
      ...current,
      controls: current.controls.map((control, i) => i === index ? { ...control, role } : control),
    }))
  }

  function updatePixelUncertaintyEvidence(index: number, pixelEvidence: GeoreferencePixelEvidence) {
    mutate((current) => ({
      ...current,
      controls: current.controls.map((control, i) => i === index
        ? { ...control, uncertainty: { ...(control.uncertainty ?? {}), pixelEvidence } }
        : control),
    }))
  }

  function updateGroundUncertaintyEvidence(index: number, groundEvidence: GeoreferenceGroundEvidence) {
    mutate((current) => ({
      ...current,
      controls: current.controls.map((control, i) => i === index
        ? { ...control, uncertainty: { ...(control.uncertainty ?? {}), groundEvidence } }
        : control),
    }))
  }

  function updateControlUncertaintySigma(index: number, field: 'pixelSigmaPx' | 'groundSigmaM', raw: string) {
    mutate((current) => ({
      ...current,
      controls: current.controls.map((control, i) => {
        if (i !== index) return control
        const uncertainty = { ...(control.uncertainty ?? {}) }
        if (!raw.trim()) delete uncertainty[field]
        else {
          const value = Number.parseFloat(raw)
          if (!Number.isFinite(value) || value < 0) return control
          uncertainty[field] = value
        }
        return { ...control, uncertainty: Object.keys(uncertainty).length ? uncertainty : undefined }
      }),
    }))
  }

  function updateControlUncertaintyText(index: number, field: 'evidenceRef' | 'evidenceDate' | 'note', raw: string) {
    mutate((current) => ({
      ...current,
      controls: current.controls.map((control, i) => {
        if (i !== index) return control
        const uncertainty = { ...(control.uncertainty ?? {}) }
        if (!raw.trim()) delete uncertainty[field]
        else uncertainty[field] = raw
        return { ...control, uncertainty: Object.keys(uncertainty).length ? uncertainty : undefined }
      }),
    }))
  }

  function updateControlCalibrationBasis(index: number, calibrationBasis: GeoreferenceCalibrationBasis | '') {
    mutate((current) => ({
      ...current,
      controls: current.controls.map((control, i) => {
        if (i !== index) return control
        const uncertainty = { ...(control.uncertainty ?? {}) }
        if (!calibrationBasis) delete uncertainty.calibrationBasis
        else uncertainty.calibrationBasis = calibrationBasis
        return { ...control, uncertainty: Object.keys(uncertainty).length ? uncertainty : undefined }
      }),
    }))
  }

  function updateControlUncertaintyReviewStatus(index: number, reviewStatus: GeoreferenceUncertaintyReviewStatus) {
    mutate((current) => ({
      ...current,
      controls: current.controls.map((control, i) => {
        if (i !== index) return control
        const uncertainty = { ...(control.uncertainty ?? {}), reviewStatus }
        if (reviewStatus === 'reviewed') uncertainty.reviewedAt = uncertainty.reviewedAt ?? new Date().toISOString()
        else delete uncertainty.reviewedAt
        return { ...control, uncertainty }
      }),
    }))
  }

  function updatePixelControl(index: number, field: 'x' | 'y', raw: string) {
    const value = Number.parseFloat(raw)
    if (!Number.isFinite(value)) return
    mutate((current) => ({
      ...current,
      controls: current.controls.map((control, i) => i === index
        ? { ...control, pixel: { ...control.pixel, [field]: value } }
        : control),
    }))
  }

  function updateGroundControl(index: number, field: 'lng' | 'lat', raw: string) {
    const value = Number.parseFloat(raw)
    if (!Number.isFinite(value)) return
    mutate((current) => ({
      ...current,
      controls: current.controls.map((control, i) => i === index
        ? clearGroundProvenance({ ...control, ground: { ...control.ground, [field]: value } })
        : control),
    }))
  }

  function updateThreshold(field: keyof GeoreferenceSession['qaThresholds'], raw: string) {
    const value = Number.parseFloat(raw)
    if (!Number.isFinite(value) || value < 0) return
    mutate((current) => {
      const qa = { ...current.qaThresholds, [field]: value }
      if (field === 'passRmseM' && qa.reviewRmseM < value) qa.reviewRmseM = value
      if (field === 'reviewRmseM' && qa.passRmseM > value) qa.passRmseM = value
      if (field === 'passMaxM' && qa.reviewMaxM < value) qa.reviewMaxM = value
      if (field === 'reviewMaxM' && qa.passMaxM > value) qa.passMaxM = value
      return { ...current, qaThresholds: qa }
    })
  }

  function removeControl(index: number) {
    const removedId = session.controls[index]?.id
    mutate((current) => ({ ...current, controls: current.controls.filter((_, i) => i !== index) }))
    if (removedId && selectedControlId === removedId) setSelectedControlId(undefined)
  }

  function runFit() {
    setCanonicalDraft(undefined)
    setCanonicalApproved(undefined)
    setCanonicalApprovalInput('')
    setCanonicalPatchError(undefined)
    try {
      const result = evaluateSessionQa(session)
      setAdvancedQa(result)
      setFit(result.fit)
      setFitError(undefined)
    } catch (error) {
      setFit(undefined)
      setFitError(error instanceof Error ? error.message : String(error))
    }
  }

  function importSession(file?: File) {
    if (!file) return
    file.text().then((text) => {
      try {
        const parsed = parseSession(text)
        if (parsed.siteId != null && parsed.siteId !== site.id) throw new Error(`会话属于 site ${parsed.siteId}，当前遗址为 ${site.id}`)
        if (parsed.targetId && !targets.some((item) => item.id === parsed.targetId)) throw new Error('会话中的官方地图目标不属于当前遗址')
        setSession(parsed)
        setFit(undefined)
        setAdvancedQa(undefined)
        setImportError(undefined)
        setCanonicalDraft(undefined)
        setCanonicalApproved(undefined)
        setCanonicalApprovalInput('')
        setCanonicalPatchError(undefined)
        clearImage()
        setPendingAmapPick(undefined)
        setSelectedControlId(undefined)
      } catch (error) {
        setImportError(error instanceof Error ? error.message : String(error))
      }
    })
  }


  function generateCanonicalDraft() {
    if (!advancedQa || !readiness) return
    try {
      const patch = buildCanonicalExtentPatch({ site, session, advancedQa, readiness, areaComparison, controlInfluence, robust, irls, localDistortion, localDistortionComparison, piecewise, spatialCv, monteCarlo, systematicStress, uncertainCheck })
      setCanonicalDraft(patch)
      setCanonicalApproved(undefined)
      setCanonicalApprovalInput('')
      setCanonicalPatchError(undefined)
    } catch (error) {
      setCanonicalDraft(undefined)
      setCanonicalApproved(undefined)
      setCanonicalPatchError(error instanceof Error ? error.message : String(error))
    }
  }

  function approveAndDownloadCanonicalPatch() {
    if (!canonicalDraft) return
    try {
      const approved = approveCanonicalExtentPatch(canonicalDraft, canonicalApprovalInput)
      setCanonicalApproved(approved)
      setCanonicalPatchError(undefined)
      downloadText(`${site.code}-${canonicalDraft.extentId}.approved-patch.json`, JSON.stringify(approved, null, 2), 'application/json')
    } catch (error) {
      setCanonicalApproved(undefined)
      setCanonicalPatchError(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <div className="georef-overlay" role="dialog" aria-modal="true" aria-label="地图配准工作台">
      <div className="georef-shell">
        <header className="georef-header">
          <div>
            <div className="eyebrow">GEOREFERENCE WORKBENCH · DRAFT GEOMETRY ONLY</div>
            <h2>地图配准工作台</h2>
            <p>{site.code} · {site.name} · 控制点目标坐标统一使用 WGS84</p>
          </div>
          <div className="georef-header-actions">
            <button type="button" onClick={() => downloadText(`${session.id}.json`, serializeSession(session), 'application/json')}>导出会话</button>
            <label className="georef-button-label">导入会话<input type="file" accept="application/json,.json" onChange={(event) => importSession(event.target.files?.[0])} /></label>
            <button type="button" onClick={onClose}>关闭</button>
          </div>
        </header>

        <div className="georef-warning">工作台输出始终标记为 <b>draft-unreviewed</b>。右侧高德叠加只用于视觉空间验收；视觉吻合、RMSE 合格都 ≠ 官方边界已验证，也不会绕过人工晋升流程。</div>

        <div className="georef-toolbar">
          <label>官方地图目标
            <select value={session.targetId ?? ''} onChange={(event) => switchTarget(event.target.value)}>
              {!targets.length && <option value="">当前遗址无预登记地图目标</option>}
              {targets.map((item) => <option value={item.id} key={item.id}>{item.officialReference} · {item.mapTitle ?? item.id}</option>)}
            </select>
          </label>
          <label>变换模型
            <select value={session.method} onChange={(event) => mutate((current) => ({ ...current, method: event.target.value as GeoreferenceSession['method'] }))}>
              <option value="affine">Affine · 至少3点</option>
              <option value="projective">Projective · 至少4点</option>
            </select>
          </label>
          <label className="georef-button-label">载入地图图片<input type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" onChange={(event) => loadImage(event.target.files?.[0])} /></label>
          <label>投影透明度 <span>{Math.round(overlayOpacity * 100)}%</span><input type="range" min="0.05" max="0.6" step="0.01" value={overlayOpacity} onChange={(event) => setOverlayOpacity(Number(event.target.value))} /></label>
          <button type="button" onClick={resetSession}>重置当前会话</button>
        </div>

        {target && <div className="georef-target-note"><b>{target.officialReference}</b><span>{target.mapTitle}</span><span>{target.pageStatus}</span><span>{target.georeferenceStatus}</span></div>}
        {importError && <div className="georef-error">导入失败：{importError}</div>}

        <div className="georef-main">
          <section className="georef-image-column">
            <div className="georef-mode-bar">
              <button className={captureMode === 'control' ? 'active' : ''} onClick={() => setCaptureMode('control')}>控制点模式</button>
              <button className={captureMode === 'boundary' ? 'active' : ''} onClick={() => setCaptureMode('boundary')}>边界采点模式</button>
              <button className={showLocalDistortionField ? 'active distortion' : ''} disabled={!localDistortion?.available} onClick={() => setShowLocalDistortionField((value) => !value)}>局部形变场</button>
              <button className={showPiecewisePreview ? 'active piecewise' : ''} disabled={!piecewisePreview?.available} onClick={() => setShowPiecewisePreview((value) => !value)}>Piecewise预演</button>
              <span>{captureMode === 'control' ? '点击图像定位像素，再填写 WGS84 经纬度。' : '连续点击图像记录边界像素点。'}</span>
            </div>

            <div className="georef-image-stage">
              {imageUrl ? (
                <div className="georef-image-wrap">
                  <img
                    src={imageUrl}
                    alt="待配准官方地图页"
                    onClick={capturePixel}
                    onLoad={(event) => mutate((current) => ({ ...current, imageWidth: event.currentTarget.naturalWidth, imageHeight: event.currentTarget.naturalHeight }))}
                  />
                  {showLocalDistortionField && localDistortion?.available && session.imageWidth && session.imageHeight && (
                    <div className="georef-local-distortion-overlay" aria-label="独立检查点局部形变热区">
                      {localDistortion.gridCells.map((cell) => <span
                        key={`${cell.row}-${cell.col}`}
                        className={`georef-local-distortion-cell ${cell.severity}`}
                        title={`${cell.region} · local ${cell.magnitudeM.toFixed(1)}m · support ${(cell.supportScore * 100).toFixed(0)}%`}
                        style={{
                          left: `${cell.col / 4 * 100}%`,
                          top: `${cell.row / 4 * 100}%`,
                          width: '25%',
                          height: '25%',
                          opacity: Math.min(0.62, 0.08 + cell.supportScore * 0.18 + Math.min(1, cell.magnitudeM / Math.max(session.qaThresholds.reviewRmseM, 1)) * 0.32),
                        }}
                      ><b>{cell.magnitudeM >= 8 ? `${cell.magnitudeM.toFixed(0)}m` : ''}</b></span>)}
                    </div>
                  )}
                  {showPiecewisePreview && piecewisePreview?.available && session.imageWidth && session.imageHeight && (
                    <div className="georef-piecewise-image-overlay" aria-label={`Piecewise ${piecewiseLayoutLabel(piecewisePreview.layout)} 分区预演`}>
                      {piecewisePreview.imageRegions.map((region) => <span
                        key={region.id}
                        className={`georef-piecewise-image-region ${region.foldOverRisk ? 'foldover' : ''}`}
                        title={`${region.id} · local orientation ${region.orientationSign} · global ${region.globalOrientationSign}${region.foldOverRisk ? ' · FOLD-OVER RISK' : ''}`}
                        style={{
                          left: `${region.minX / session.imageWidth! * 100}%`,
                          top: `${region.minY / session.imageHeight! * 100}%`,
                          width: `${(region.maxX - region.minX) / session.imageWidth! * 100}%`,
                          height: `${(region.maxY - region.minY) / session.imageHeight! * 100}%`,
                        }}
                      ><b>{region.id}</b>{region.foldOverRisk && <em>FOLD</em>}</span>)}
                    </div>
                  )}
                  {session.imageWidth && session.imageHeight && session.boundaryPixels.length > 1 && (
                    <svg className="georef-boundary-overlay" viewBox={`0 0 ${session.imageWidth} ${session.imageHeight}`} preserveAspectRatio="none">
                      <polyline points={session.boundaryPixels.map((point) => `${point.x},${point.y}`).join(' ')} />
                    </svg>
                  )}
                  {session.imageWidth && session.imageHeight && session.controls.map((control, index) => {
                    const influence = influenceById.get(control.id)
                    return <button type="button" key={control.id} aria-label={`选择控制点 ${index + 1}`} onClick={(event) => { event.stopPropagation(); setSelectedControlId(control.id) }} className={`georef-dot ${control.role === 'check' ? 'check' : 'control'} ${influence ? `influence-${influence.status}` : ''} ${robustById.get(control.id) ? `robust-${robustById.get(control.id)!.status}` : ''} ${irlsById.get(control.id) ? `irls-${irlsById.get(control.id)!.status}` : ''} ${reviewPriorityById.get(control.id)?.priority !== 'none' ? `review-${reviewPriorityById.get(control.id)!.priority}` : ''} ${selectedControlId === control.id ? 'selected' : ''}`} style={{ left: `${control.pixel.x / session.imageWidth! * 100}%`, top: `${control.pixel.y / session.imageHeight! * 100}%` }}>{index + 1}</button>
                  })}
                  {session.imageWidth && session.imageHeight && session.boundaryPixels.map((point, index) => <span key={`${point.x}-${point.y}-${index}`} className="georef-dot boundary" style={{ left: `${point.x / session.imageWidth! * 100}%`, top: `${point.y / session.imageHeight! * 100}%` }}>{index + 1}</span>)}
                  {pendingPixel && session.imageWidth && session.imageHeight && <span className="georef-dot pending" style={{ left: `${pendingPixel.x / session.imageWidth * 100}%`, top: `${pendingPixel.y / session.imageHeight * 100}%` }}>+</span>}
                </div>
              ) : (
                <div className="georef-image-empty"><strong>载入 PNG / JPEG 地图页</strong><span>图片仅使用本地 Object URL，不上传。</span>{session.imageName && <small>上次会话图片：{session.imageName}（需重新选择本地文件）</small>}</div>
              )}
            </div>

            {pendingPixel && <div className="georef-pending-control">
              <span>像素 X {pendingPixel.x.toFixed(1)} · Y {pendingPixel.y.toFixed(1)}</span>
              <input aria-label="控制点经度" placeholder="WGS84 经度" value={pendingLng} onChange={(event) => { setPendingLng(event.target.value); setPendingAmapPick(undefined) }} />
              <input aria-label="控制点纬度" placeholder="WGS84 纬度" value={pendingLat} onChange={(event) => { setPendingLat(event.target.value); setPendingAmapPick(undefined) }} />
              <select aria-label="控制点用途" value={pendingRole} onChange={(event) => setPendingRole(event.target.value as 'fit' | 'check')}><option value="fit">拟合点</option><option value="check">独立检查点</option></select>
              <span className={`georef-dual-pick-status ${pendingAmapPick ? 'linked' : ''}`}>{pendingAmapPick ? '右侧高德点已联动' : '到右侧高德地图点击对应真实地物'}</span>
              <button type="button" onClick={addControl}>加入控制点</button>
              <button type="button" onClick={() => { setPendingPixel(undefined); setPendingAmapPick(undefined) }}>取消</button>
              {pendingAmapPick && <small className="georef-amap-source">高德 GCJ-02 {pendingAmapPick.gcj02.lng.toFixed(6)}, {pendingAmapPick.gcj02.lat.toFixed(6)} → WGS84</small>}
            </div>}
          </section>

          <AmapGeoreferenceQaMap
            site={site}
            session={session}
            fit={fit}
            selectedControlId={selectedControlId}
            overlayOpacity={overlayOpacity}
            groundPickEnabled={Boolean(pendingPixel)}
            onSelectControl={setSelectedControlId}
            onGroundPick={(pick) => {
              if (!pendingPixel) return
              setPendingAmapPick(pick)
              setPendingLng(pick.wgs84.lng.toFixed(8))
              setPendingLat(pick.wgs84.lat.toFixed(8))
            }}
            errorField={errorField}
            modelComparison={modelComparison}
            controlInfluence={controlInfluence}
            robust={robust}
            irls={irls}
            piecewisePreview={piecewisePreview}
            monteCarlo={monteCarlo}
            systematicStress={systematicStress}
            uncertainCheck={uncertainCheck}
            systematicStressScenarioId={systematicStressScenarioId}
            showPiecewisePreview={showPiecewisePreview}
            onTogglePiecewisePreview={() => setShowPiecewisePreview((value) => !value)}
          />

          <aside className="georef-data-column">
            <section className="georef-panel">
              <div className="georef-panel-head"><strong>控制点</strong><span>拟合 {fitControlCount} / 检查 {checkControlCount} · 最少拟合 {minimumControls}</span></div>
              <div className="georef-control-table-wrap">
                <table className="georef-control-table">
                  <thead><tr><th>#</th><th>用途</th><th>来源</th><th>图像证据 / σpx</th><th>地面证据 / σm</th><th>px X</th><th>px Y</th><th>WGS84 lng</th><th>WGS84 lat</th><th>残差</th><th>影响</th><th>RANSAC</th><th>IRLS</th><th>复查</th><th /></tr></thead>
                  <tbody>{session.controls.map((control, index) => {
                    const influence = influenceById.get(control.id)
                    const robustPoint = robustById.get(control.id)
                    const irlsPoint = irlsById.get(control.id)
                    const reviewPriority = reviewPriorityById.get(control.id)
                    const uncertainty = uncertaintyById.get(control.id)
                    return <tr key={control.id} className={`${selectedControlId === control.id ? 'selected' : ''} ${influence ? `influence-${influence.status}` : ''} ${robustPoint ? `robust-${robustPoint.status}` : ''} ${irlsPoint ? `irls-${irlsPoint.status}` : ''} ${reviewPriority && reviewPriority.priority !== 'none' ? `review-${reviewPriority.priority}` : ''}`} onClick={() => setSelectedControlId(control.id)}>
                    <td>{index + 1}</td>
                    <td><select value={control.role ?? 'fit'} onChange={(event) => updateControlRole(index, event.target.value as 'fit' | 'check')}><option value="fit">拟合</option><option value="check">检查</option></select></td>
                    <td><span className={`georef-source-badge ${control.groundSource ?? 'manual'}`}>{control.groundSource === 'amap-click' ? '高德' : '手工'}</span></td>
                    <td><div className="georef-uncertainty-cell">
                      <select value={uncertainty?.pixelEvidence ?? 'unknown'} onChange={(event) => updatePixelUncertaintyEvidence(index, event.target.value as GeoreferencePixelEvidence)}>
                        <option value="unknown">未校准</option><option value="exact-corner">清晰角点</option><option value="clear-feature">清晰地物</option><option value="fuzzy-feature">模糊地物</option><option value="approximate-zone">近似区域</option>
                      </select>
                      <input type="number" min="0" step="0.1" value={control.uncertainty?.pixelSigmaPx ?? ''} placeholder={`σ ${uncertainty?.pixelSigmaPx.toFixed(1) ?? '—'}`} onChange={(event) => updateControlUncertaintySigma(index, 'pixelSigmaPx', event.target.value)} />
                    </div></td>
                    <td><div className="georef-uncertainty-cell">
                      <select value={uncertainty?.groundEvidence ?? 'unknown'} onChange={(event) => updateGroundUncertaintyEvidence(index, event.target.value as GeoreferenceGroundEvidence)}>
                        <option value="unknown">未校准</option><option value="official-survey-gis">官方GIS</option><option value="field-gps">现场GPS</option><option value="official-coordinate">官方坐标</option><option value="amap-poi">高德POI</option><option value="manual-crosscheck">人工交叉核</option><option value="osm-wikidata">OSM/Wikidata</option>
                      </select>
                      <input type="number" min="0" step="0.5" value={control.uncertainty?.groundSigmaM ?? ''} placeholder={`σ ${uncertainty?.groundSigmaM.toFixed(1) ?? '—'}`} onChange={(event) => updateControlUncertaintySigma(index, 'groundSigmaM', event.target.value)} />
                    </div></td>
                    <td><input type="number" value={control.pixel.x} onChange={(event) => updatePixelControl(index, 'x', event.target.value)} /></td>
                    <td><input type="number" value={control.pixel.y} onChange={(event) => updatePixelControl(index, 'y', event.target.value)} /></td>
                    <td><input type="number" step="0.000001" value={control.ground.lng} onChange={(event) => updateGroundControl(index, 'lng', event.target.value)} /></td>
                    <td><input type="number" step="0.000001" value={control.ground.lat} onChange={(event) => updateGroundControl(index, 'lat', event.target.value)} /></td>
                    <td>{residualById.get(control.id) ? `${residualById.get(control.id)!.residualM.toFixed(1)}m` : '—'}</td>
                    <td>{influence ? <span className={`georef-influence-badge ${influence.status}`}>{influenceTone(influence.status).label}</span> : '—'}</td>
                    <td>{robustPoint ? <span className={`georef-robust-badge ${robustPoint.status}`}>{robustPointDisplay(robustPoint.status).label}</span> : '—'}</td>
                    <td>{irlsPoint ? <span className={`georef-irls-badge ${irlsPoint.status}`}>{irlsCombinedDisplay(irlsPoint.minWeight).label}</span> : '—'}</td>
                    <td>{reviewPriority && reviewPriority.priority !== 'none' ? <span className={`georef-review-priority ${reviewPriority.priority}`}>{reviewPriority.label}</span> : '—'}</td>
                    <td><button type="button" onClick={() => removeControl(index)}>×</button></td>
                  </tr>})}</tbody>
                </table>
              </div>
              {selectedControl && selectedControlAudit && <div className="georef-evidence-audit-editor">
                <div className="georef-panel-head"><strong>Uncertainty evidence audit · {selectedControl.label ?? selectedControl.id}</strong><span className={`georef-evidence-grade ${uncertaintyEvidenceGradeDisplay(selectedControlAudit.grade).tone}`}>{uncertaintyEvidenceGradeDisplay(selectedControlAudit.grade).label}</span></div>
                <div className="georef-evidence-audit-grid">
                  <label>Evidence ref<input value={selectedControl.uncertainty?.evidenceRef ?? ''} placeholder="URL / 文献号 / GIS layer / GPS log" onChange={(event) => updateControlUncertaintyText(selectedControlIndex, 'evidenceRef', event.target.value)} /></label>
                  <label>Evidence date<input type="date" value={selectedControl.uncertainty?.evidenceDate ?? ''} onChange={(event) => updateControlUncertaintyText(selectedControlIndex, 'evidenceDate', event.target.value)} /></label>
                  <label>Calibration basis<select value={selectedControl.uncertainty?.calibrationBasis ?? ''} onChange={(event) => updateControlCalibrationBasis(selectedControlIndex, event.target.value as GeoreferenceCalibrationBasis | '')}><option value="">未指定</option><option value="metadata">Metadata</option><option value="measured">Measured</option><option value="heuristic">Heuristic</option><option value="manual-override">Manual override</option></select></label>
                  <label>Audit status<select value={selectedControl.uncertainty?.reviewStatus ?? 'unreviewed'} onChange={(event) => updateControlUncertaintyReviewStatus(selectedControlIndex, event.target.value as GeoreferenceUncertaintyReviewStatus)}><option value="unreviewed">Unreviewed</option><option value="reviewed">Reviewed</option></select></label>
                  <label className="wide">Calibration note<textarea value={selectedControl.uncertainty?.note ?? ''} placeholder="说明 σ 的依据、元数据、设备、比例尺、DPI 或人工 override 理由" onChange={(event) => updateControlUncertaintyText(selectedControlIndex, 'note', event.target.value)} /></label>
                </div>
                <div className="georef-evidence-audit-meta"><span>reviewedAt: {selectedControl.uncertainty?.reviewedAt ?? '—'}</span><span>{selectedControlAudit.issues.length ? selectedControlAudit.issues.join('；') : '审计字段完整'}</span></div>
              </div>}
              <button className="georef-fit-button" type="button" disabled={fitControlCount < minimumControls} onClick={runFit}>执行 {session.method === 'affine' ? 'Affine' : 'Projective'} 拟合</button>
              {fitError && <div className="georef-error">拟合失败：{fitError}</div>}
            </section>

            <section className="georef-panel">
              <div className="georef-panel-head"><strong>配准 QA</strong><span className={`qa-verdict ${fit?.verdict ?? 'idle'}`}>{fit ? fit.verdict.toUpperCase() : '未拟合'}</span></div>
              {fit && advancedQa ? <>
                <div className="georef-metrics"><div><b>{fit.rmseM.toFixed(2)} m</b><span>拟合 RMSE</span></div><div><b>{fit.maxResidualM.toFixed(2)} m</b><span>拟合 max</span></div><div><b>{advancedQa.fit.fitControlCount}</b><span>拟合点</span></div></div>
                <div className="georef-qa-grid">
                  <QaCard title="独立检查点" verdict={advancedQa.holdout?.verdict ?? 'unavailable'} primary={advancedQa.holdout ? `${advancedQa.holdout.rmseM.toFixed(2)} m RMSE` : '未设置'} secondary={advancedQa.holdout ? `${advancedQa.holdout.count} 点 · max ${advancedQa.holdout.maxResidualM.toFixed(2)}m` : '至少建议2个，不参与拟合'} />
                  <QaCard title="Leave-one-out" verdict={advancedQa.leaveOneOut.available ? advancedQa.leaveOneOut.verdict : 'unavailable'} primary={advancedQa.leaveOneOut.available ? `${advancedQa.leaveOneOut.rmseM.toFixed(2)} m RMSE` : '不可用'} secondary={advancedQa.leaveOneOut.available ? `max ${advancedQa.leaveOneOut.maxResidualM.toFixed(2)}m` : advancedQa.leaveOneOut.reason} />
                  <QaCard title="控制点分布" verdict={advancedQa.spatialDistribution.available ? advancedQa.spatialDistribution.verdict : 'unavailable'} primary={advancedQa.spatialDistribution.available ? `${advancedQa.spatialDistribution.score}/100` : '不可用'} secondary={advancedQa.spatialDistribution.available ? `span ${(advancedQa.spatialDistribution.xSpanRatio * 100).toFixed(0)}% × ${(advancedQa.spatialDistribution.ySpanRatio * 100).toFixed(0)}% · hull ${(advancedQa.spatialDistribution.hullAreaRatio * 100).toFixed(1)}%` : advancedQa.spatialDistribution.reason} />
                  <QaCard title="进入人工审核" verdict={readiness?.verdict ?? 'unavailable'} primary={readiness ? readiness.verdict.toUpperCase() : '未评估'} secondary={readiness?.reasons.length ? readiness.reasons.join('；') : '仅表示研究型审核建议，不会自动发布'} />
                </div>
                <div className="georef-diagnostic-grid">
                  <DiagnosticCard
                    title="检查点误差向量场"
                    tone={!errorField?.available ? 'idle' : errorField.pattern === 'stable' ? 'pass' : errorField.pattern === 'global-shift' ? 'review' : 'fail'}
                    primary={!errorField?.available ? '需要 ≥2 个 check points' : errorPatternLabel(errorField.pattern)}
                    secondary={!errorField?.available ? errorFieldUnavailableReason : `系统偏移 ${errorField.systematicMagnitudeM.toFixed(1)}m · ${errorField.systematicBearingDeg.toFixed(0)}° · coherence ${errorField.directionalCoherence.toFixed(2)} · local RMS ${errorField.localRmsM.toFixed(1)}m${errorField.hotspotQuadrant ? ` · hotspot ${errorField.hotspotQuadrant}` : ''}`}
                  />
                  <DiagnosticCard
                    title="Affine vs Projective"
                    tone={!modelComparison.available ? 'idle' : modelComparison.recommendation === 'affine' || modelComparison.recommendation === 'projective' ? 'pass' : modelComparison.recommendation === 'controls' ? 'fail' : 'review'}
                    primary={!modelComparison.available ? '暂不可比较' : modelRecommendationLabel(modelComparison.recommendation)}
                    secondary={!modelComparison.available ? modelComparison.reason : `Affine holdout ${formatDiagnosticRmse(modelComparison.affine.holdout?.rmseM)} · Projective ${formatDiagnosticRmse(modelComparison.projective.holdout?.rmseM)}${modelComparison.boundaryDivergence ? ` · 边界分离 mean ${modelComparison.boundaryDivergence.meanM.toFixed(1)}m / max ${modelComparison.boundaryDivergence.maxM.toFixed(1)}m` : ''} · ${modelComparison.reasons.join('；')}`}
                  />
                  <DiagnosticCard
                    title="局部形变场"
                    tone={!localDistortion?.available ? 'idle' : localDistortion.pattern === 'stable' ? 'pass' : localDistortion.pattern === 'structured-gradient' ? 'review' : 'fail'}
                    primary={!localDistortion?.available ? '需要 ≥4 个独立 check points' : localDistortionPatternLabel(localDistortion.pattern)}
                    secondary={!localDistortion?.available ? (localDistortion?.reason ?? '执行拟合后分析') : `field variation ${localDistortion.fieldVariationM.toFixed(1)}m · explained ${(localDistortion.gradientExplainedFraction * 100).toFixed(0)}% · post-field RMS ${localDistortion.postFieldRmsM.toFixed(1)}m${localDistortion.hotspotRegion ? ` · hotspot ${localDistortion.hotspotRegion}` : ''}`}
                  />
                  <DiagnosticCard
                    title="跨模型局部形变"
                    tone={localDistortionComparison.recommendation === 'global-model-sufficient' ? 'pass' : localDistortionComparison.recommendation === 'consider-piecewise' ? 'fail' : 'review'}
                    primary={localDistortionRecommendationLabel(localDistortionComparison.recommendation)}
                    secondary={`${localDistortionComparison.bestModelId ? `best ${localDistortionComparison.bestModelId}` : '暂无可比较模型'}${localDistortionComparison.persistentHotspotRegion ? ` · persistent hotspot ${localDistortionComparison.persistentHotspotRegion}` : ''} · ${localDistortionComparison.reasons.join('；')}`}
                  />
                  <DiagnosticCard
                    title="Piecewise candidate"
                    tone={!piecewise.available ? 'idle' : piecewise.recommendation === 'consider-piecewise' ? 'review' : piecewise.recommendation === 'global-preferred' ? 'pass' : 'review'}
                    primary={!piecewise.available ? '暂不可模拟' : piecewiseRecommendationLabel(piecewise.recommendation)}
                    secondary={!piecewise.available ? piecewise.reason : `${piecewise.bestLayout ? `best ${piecewiseLayoutLabel(piecewise.bestLayout)}` : '暂无合格分区'} · baseline ${piecewise.baselineHoldoutRmseM.toFixed(1)}m · ${piecewise.reasons.join('；')}`}
                  />
                  <DiagnosticCard
                    title="Piecewise visual preview"
                    tone={!piecewisePreview?.available ? 'idle' : piecewisePreviewTone({ foldOverCount: piecewisePreview.foldOverRegionIds.length, seamMaxM: piecewisePreview.seamMaxM }, session.qaThresholds)}
                    primary={!piecewisePreview?.available ? '等待可预演候选' : piecewiseLayoutLabel(piecewisePreview.layout)}
                    secondary={!piecewisePreview?.available ? (piecewisePreview?.reason ?? '需要可用 Piecewise candidate') : `seam mean/max ${piecewisePreview.seamMeanM.toFixed(1)}/${piecewisePreview.seamMaxM.toFixed(1)}m · 全局↔分区边界 ${piecewisePreview.globalDivergence.meanM.toFixed(1)}/${piecewisePreview.globalDivergence.maxM.toFixed(1)}m · fold-over ${piecewisePreview.foldOverRegionIds.length ? piecewisePreview.foldOverRegionIds.join(', ') : 'none'}`}
                  />
                  <DiagnosticCard
                    title="Spatial CV + Complexity"
                    tone={!spatialCv.available ? 'idle' : spatialCv.recommendation === 'global-preferred' ? 'pass' : spatialCv.recommendation === 'overfit-risk' ? 'fail' : 'review'}
                    primary={!spatialCv.available ? '暂不可交叉验证' : spatialCvRecommendationLabel(spatialCv.recommendation)}
                    secondary={!spatialCv.available ? spatialCv.reason : `grid ${spatialCv.gridColumns}×${spatialCv.gridRows} · global ${spatialCv.bestGlobalModelId}${spatialCvBestGlobal && spatialCvBestGlobal.available ? ` ${spatialCvBestGlobal.cvRmseM.toFixed(1)}m` : ''}${spatialCv.bestPiecewiseModelId ? ` · piecewise ${spatialCv.bestPiecewiseModelId.replace('piecewise-', '')}${spatialCvBestPiecewise && spatialCvBestPiecewise.available ? ` ${spatialCvBestPiecewise.cvRmseM.toFixed(1)}m` : ''}` : ''} · adjusted gain ${spatialCv.adjustedImprovementPercent.toFixed(0)}%`}
                  />
                  <DiagnosticCard
                    title="Fit-point uncertainty calibration"
                    tone={uncertaintySummary.fallbackControlCount === 0 && uncertaintySummary.fitControlCount > 0 ? 'pass' : uncertaintySummary.profiledControlCount > 0 ? 'review' : 'idle'}
                    primary={`${uncertaintySummary.profiledControlCount}/${uncertaintySummary.fitControlCount} 个 fit 点有证据 profile`}
                    secondary={`fallback ${uncertaintySummary.fallbackControlCount} · σpx ${uncertaintySummary.pixelSigmaRangePx[0].toFixed(1)}–${uncertaintySummary.pixelSigmaRangePx[1].toFixed(1)} · σground ${uncertaintySummary.groundSigmaRangeM[0].toFixed(1)}–${uncertaintySummary.groundSigmaRangeM[1].toFixed(1)}m · 只用于拟合扰动传播`}
                  />
                  <DiagnosticCard
                    title="Uncertainty evidence audit"
                    tone={uncertaintyAuditSummary.totalControlCount === 0 ? 'idle' : uncertaintyAuditSummary.fallbackCount > 0 ? 'fail' : uncertaintyAuditSummary.heuristicCount > 0 ? 'review' : 'pass'}
                    primary={`${uncertaintyAuditSummary.evidenceBackedCount}/${uncertaintyAuditSummary.totalControlCount} 可追溯 · ${uncertaintyAuditSummary.reviewedCount} 已复核`}
                    secondary={`fallback ${uncertaintyAuditSummary.fallbackCount} · heuristic ${uncertaintyAuditSummary.heuristicCount} · fit backed ${uncertaintyAuditSummary.fitEvidenceBackedCount}/${uncertaintyAuditSummary.fitControlCount} · check backed ${uncertaintyAuditSummary.checkEvidenceBackedCount}/${uncertaintyAuditSummary.checkControlCount}${uncertaintyAuditSummary.weakestControlIds.length ? ` · weakest ${uncertaintyAuditSummary.weakestControlIds.join(', ')}` : ''}`}
                  />
                  <DiagnosticCard
                    title="Evidence research queue"
                    tone={evidenceBacklog.highCount > 0 ? 'fail' : evidenceBacklog.mediumCount > 0 ? 'review' : evidenceBacklog.items.length > 0 ? 'pass' : 'pass'}
                    primary={evidenceBacklog.items.length ? `${evidenceBacklog.items.length} 个待补证任务 · 高 ${evidenceBacklog.highCount} / 中 ${evidenceBacklog.mediumCount} / 低 ${evidenceBacklog.lowCount}` : '当前证据 backlog 已清空'}
                    secondary={evidenceBacklog.items.length ? `fit ${evidenceBacklog.fitTaskCount} · check ${evidenceBacklog.checkTaskCount} · top ${evidenceBacklog.topControlIds.join(', ')} · 队列只排序研究工作，不自动改 σ/控制点/模型` : '所有控制点均已 reviewed 且未触发诊断冲突；仍不代表 canonical 自动通过。'}
                  />
                  <DiagnosticCard
                    title="Check-point evidence uncertainty"
                    tone={!uncertainCheck?.available ? 'idle' : uncertainCheck.overallInterpretation === 'compatible' ? 'pass' : uncertainCheck.overallInterpretation === 'tension' ? 'review' : 'fail'}
                    primary={!uncertainCheck?.available ? '需要 ≥2 个独立 check points' : checkInterpretationLabel(uncertainCheck.overallInterpretation)}
                    secondary={!uncertainCheck?.available ? (uncertainCheck?.reason ?? '执行拟合后分析') : `${uncertainCheck.profiledCheckCount}/${uncertainCheck.checkCount} profiled · fallback ${uncertainCheck.fallbackCheckCount} · effective σ ${uncertainCheck.effectiveSigmaRangeM[0].toFixed(1)}–${uncertainCheck.effectiveSigmaRangeM[1].toFixed(1)}m · normalized RMS ${uncertainCheck.normalizedRms.toFixed(2)}σ · max ${uncertainCheck.maxStandardizedResidual.toFixed(2)}σ`}
                  />
                  <DiagnosticCard
                    title="Monte Carlo uncertainty"
                    tone={!monteCarlo?.available ? 'idle' : monteCarlo.recommendation === 'global-stable' ? 'pass' : monteCarlo.recommendation === 'piecewise-stable' ? 'review' : 'fail'}
                    primary={!monteCarlo?.available ? '暂不可传播不确定性' : monteCarloRecommendationLabel(monteCarlo.recommendation)}
                    secondary={!monteCarlo?.available ? (monteCarlo?.reason ?? '至少需要2个独立检查点') : `${monteCarlo.trials} trials · raw winner ${monteCarlo.winnerModelId} ${(monteCarlo.winnerRate * 100).toFixed(0)}%${monteCarlo.evidenceWinnerModelId ? ` · evidence winner ${monteCarlo.evidenceWinnerModelId} ${((monteCarlo.evidenceWinnerRate ?? 0) * 100).toFixed(0)}%${monteCarlo.evidenceWinnerModelId !== monteCarlo.winnerModelId ? ' · ⚠ winner differs' : ''}` : ''} · fit σground ${monteCarlo.uncertaintySummary.groundSigmaRangeM[0].toFixed(1)}–${monteCarlo.uncertaintySummary.groundSigmaRangeM[1].toFixed(1)}m${monteCarlo.boundary ? ` · boundary P95 max ${monteCarlo.boundary.maxP95M.toFixed(1)}m` : ''}`}
                  />
                  <DiagnosticCard
                    title="Fit point influence"
                    tone={!controlInfluence?.available ? 'idle' : controlInfluence.suspectCount > 0 ? 'fail' : 'pass'}
                    primary={!controlInfluence?.available ? '暂不可诊断' : controlInfluence.suspectCount > 0 ? `${controlInfluence.suspectCount} 个拟合点需复查` : '未发现显著可疑拟合点'}
                    secondary={!controlInfluence?.available ? (controlInfluence?.reason ?? '执行拟合后分析') : `baseline holdout ${controlInfluence.baselineHoldoutRmseM.toFixed(1)}m${controlInfluence.topSuspectControlId ? ` · top suspect ${controlInfluence.topSuspectControlId}` : ''} · 删除模拟只用于复查优先级，不自动删点`}
                  />
                  <DiagnosticCard
                    title="Robust / RANSAC"
                    tone={!robust?.available ? 'idle' : robust.recommendation === 'review-outliers' ? 'fail' : robust.recommendation === 'robust-improves' ? 'review' : 'pass'}
                    primary={!robust?.available ? '暂不可诊断' : robustRecommendationLabel(robust.recommendation)}
                    secondary={!robust?.available ? (robust?.reason ?? '执行拟合后分析') : `LS holdout ${robust.baselineHoldout.rmseM.toFixed(1)}m · Robust ${robust.robustHoldout.rmseM.toFixed(1)}m · outliers ${robust.outlierCount} · threshold ${robust.thresholdM.toFixed(0)}m · 边界分离 max ${robust.boundaryDivergence.maxM.toFixed(1)}m`}
                  />
                  <DiagnosticCard
                    title="Huber / Tukey IRLS"
                    tone={!irls?.available ? 'idle' : irls.recommendation === 'review-downweighted' ? 'fail' : irls.recommendation === 'irls-improves' ? 'review' : 'pass'}
                    primary={!irls?.available ? '暂不可诊断' : irlsRecommendationLabel(irls.recommendation)}
                    secondary={!irls?.available ? (irls?.reason ?? '执行拟合后分析') : `LS holdout ${irls.baselineHoldout.rmseM.toFixed(1)}m · Huber ${irls.huber.holdout.rmseM.toFixed(1)}m · Tukey ${irls.tukey.holdout.rmseM.toFixed(1)}m · severe ${Math.max(irls.huber.severeCount, irls.tukey.severeCount)} · 边界分离 max ${Math.max(irls.huber.boundaryDivergence.maxM, irls.tukey.boundaryDivergence.maxM).toFixed(1)}m`}
                  />
                  <DiagnosticCard
                    title="多证据一致性"
                    tone={highPriorityReviewCount > 0 ? 'fail' : 'pass'}
                    primary={highPriorityReviewCount > 0 ? `${highPriorityReviewCount} 个高优先复查点` : '无三证据同时指向的控制点'}
                    secondary="只有 Influence=SUSPECT + RANSAC=OUTLIER + IRLS=严重降权同时成立才升级为高优先；仅改变人工复查顺序。"
                  />
                </div>
                {evidenceBacklog.items.length > 0 && <div className="georef-evidence-backlog-block">
                  <div className="georef-panel-head"><strong>Evidence Backlog / Research Queue</strong><span>证据缺口 × 模型影响 × check 冲突 · 动态任务，不单独维护完成状态</span></div>
                  <div className="georef-influence-table-wrap"><table className="georef-influence-table georef-evidence-backlog-table">
                    <thead><tr><th>Priority</th><th>Control</th><th>Role</th><th>Audit</th><th>Score</th><th>Evidence gap</th><th>Diagnostic</th><th>Recommended action</th><th>Why</th></tr></thead>
                    <tbody>{evidenceBacklog.items.map((item) => { const priority = evidenceBacklogPriorityDisplay(item.priority); return <tr key={item.controlId} className={`${item.priority} ${selectedControlId === item.controlId ? 'selected' : ''}`} onClick={() => setSelectedControlId(item.controlId)}>
                      <td><span className={`georef-evidence-backlog-priority ${priority.tone}`}>{priority.label}</span></td>
                      <td><b>{item.label ?? item.controlId}</b></td>
                      <td>{item.role}</td>
                      <td>{item.auditGrade}</td>
                      <td>{item.score.toFixed(0)}</td>
                      <td>{item.evidenceGapScore.toFixed(0)}</td>
                      <td>{item.diagnosticScore.toFixed(0)}</td>
                      <td>{evidenceBacklogActionLabel(item.recommendedAction)}</td>
                      <td>{item.reasons.join('；')}</td>
                    </tr>})}</tbody>
                  </table></div>
                  <div className="georef-piecewise-note">点击任务会选中对应控制点，并回到上方 provenance 编辑器补 evidenceRef / basis / review。任务随真实证据状态自动降级或消失，不会因为“手工勾完成”而与 Session 事实脱节。</div>
                </div>}
                {uncertaintyAuditRecords.length > 0 && <div className="georef-evidence-audit-block">
                  <div className="georef-panel-head"><strong>Uncertainty evidence provenance</strong><span>σ 数字与其证据出处分开审计 · 不参与 readiness 自动晋升</span></div>
                  <div className="georef-influence-table-wrap"><table className="georef-influence-table georef-evidence-audit-table">
                    <thead><tr><th>Control</th><th>Role</th><th>Grade</th><th>Basis</th><th>Evidence ref</th><th>Status</th><th>Issues</th></tr></thead>
                    <tbody>{uncertaintyAuditRecords.map((item) => { const display = uncertaintyEvidenceGradeDisplay(item.grade); return <tr key={item.controlId} className={`${item.grade} ${selectedControlId === item.controlId ? 'selected' : ''}`} onClick={() => setSelectedControlId(item.controlId)}>
                      <td><b>{session.controls.find((control) => control.id === item.controlId)?.label ?? item.controlId}</b></td><td>{item.role}</td><td><span className={`georef-evidence-grade ${display.tone}`}>{display.label}</span></td><td>{item.calibrationBasis ?? '—'}</td><td>{item.evidenceRef ?? '—'}</td><td>{item.reviewed ? 'reviewed' : 'unreviewed'}</td><td>{item.issues.length ? item.issues.join('；') : '—'}</td>
                    </tr>})}</tbody>
                  </table></div>
                </div>}
                {uncertainCheck?.available && <div className="georef-check-uncertainty-block">
                  <div className="georef-panel-head"><strong>Independent check evidence</strong><span>raw Holdout 保留 · uncertainty 只解释 residual 与证据精度的关系</span></div>
                  <div className="georef-influence-table-wrap"><table className="georef-influence-table georef-check-uncertainty-table">
                    <thead><tr><th>Check</th><th>Raw residual</th><th>Effective σ</th><th>Standardized</th><th>Evidence</th><th>Interpretation</th></tr></thead>
                    <tbody>{uncertainCheckRecords.map((item) => {
                      const display = checkInterpretationDisplay(item.interpretation)
                      return <tr key={item.controlId} className={`${item.interpretation} ${selectedControlId === item.controlId ? 'selected' : ''}`} onClick={() => setSelectedControlId(item.controlId)}>
                        <td><b>{item.label ?? item.controlId}</b></td>
                        <td>{item.residualM.toFixed(1)}m</td>
                        <td>{item.effectiveSigmaM.toFixed(1)}m</td>
                        <td>{item.standardizedResidual.toFixed(2)}σ</td>
                        <td>{item.calibrationSource}</td>
                        <td><span className={`georef-check-uncertainty-badge ${display.tone}`}>{display.label}</span></td>
                      </tr>
                    })}</tbody>
                  </table></div>
                  <div className="georef-piecewise-note">compatible/tension/inconsistent 只是 evidence-normalized 解释；上方 raw Holdout RMSE / max / PASS-REVIEW-FAIL 不被替换，也不会自动改变 readiness。</div>
                </div>}
                {localDistortion?.available && <div className="georef-local-distortion-block">
                  <div className="georef-panel-head"><strong>局部形变空间场</strong><span>仅使用独立 check points · 热区不是统计显著性结论</span></div>
                  <div className="georef-local-distortion-summary">
                    <span>梯度解释率 <b>{(localDistortion.gradientExplainedFraction * 100).toFixed(0)}%</b></span>
                    <span>场变化 <b>{localDistortion.fieldVariationM.toFixed(1)}m</b></span>
                    <span>残余 RMS <b>{localDistortion.postFieldRmsM.toFixed(1)}m</b></span>
                    <span>divergence <b>{localDistortion.gradient.divergenceM.toFixed(1)}m</b></span>
                    <span>rotation <b>{localDistortion.gradient.rotationM.toFixed(1)}m</b></span>
                    <span>shear <b>{localDistortion.gradient.shearM.toFixed(1)}m</b></span>
                  </div>
                  <div className="georef-influence-table-wrap"><table className="georef-influence-table georef-local-model-table">
                    <thead><tr><th>模型</th><th>模式</th><th>mean residual</th><th>field variation</th><th>解释率</th><th>hotspot</th></tr></thead>
                    <tbody>{localDistortionAnalyses.map((item) => item.analysis.available ? <tr key={item.id} className={item.analysis.pattern === 'stable' ? 'stable' : 'distorted'}>
                      <td><b>{item.label}</b></td>
                      <td>{localDistortionPatternLabel(item.analysis.pattern)}</td>
                      <td>{item.analysis.meanResidualM.toFixed(1)}m</td>
                      <td>{item.analysis.fieldVariationM.toFixed(1)}m</td>
                      <td>{(item.analysis.gradientExplainedFraction * 100).toFixed(0)}%</td>
                      <td>{item.analysis.hotspotRegion ?? '—'}</td>
                    </tr> : <tr key={item.id}><td><b>{item.label}</b></td><td colSpan={5}>不可用：{item.analysis.reason}</td></tr>)}</tbody>
                  </table></div>
                  <div className={`georef-local-distortion-recommendation ${localDistortionComparison.recommendation === 'consider-piecewise' ? 'piecewise' : ''}`}><b>{localDistortionRecommendationLabel(localDistortionComparison.recommendation)}</b><span>{localDistortionComparison.reasons.join('；')}</span></div>
                </div>}
                {piecewise.available && <div className="georef-piecewise-block">
                  <div className="georef-panel-head"><strong>Piecewise / Segmented 候选模拟</strong><span>仅局部 Affine 候选 · 不自动采用</span></div>
                  <div className="georef-influence-table-wrap"><table className="georef-influence-table georef-piecewise-table">
                    <thead><tr><th>布局</th><th>状态</th><th>Holdout</th><th>改善</th><th>Seam mean/max</th><th>Fold-over</th><th>预演</th></tr></thead>
                    <tbody>{piecewise.candidates.map((candidate) => candidate.available ? <tr key={candidate.layout} className={`${candidate.recommendation} ${piecewisePreviewLayout === candidate.layout ? 'preview-selected' : ''}`}>
                      <td><b>{piecewiseLayoutLabel(candidate.layout)}</b></td>
                      <td>{piecewiseCandidateLabel(candidate.recommendation)}</td>
                      <td>{candidate.holdoutRmseM.toFixed(1)}m · {candidate.holdoutVerdict}</td>
                      <td>{candidate.improvementPercent >= 0 ? '+' : ''}{candidate.improvementPercent.toFixed(0)}%</td>
                      <td>{candidate.seamMeanM.toFixed(1)} / {candidate.seamMaxM.toFixed(1)}m</td>
                      <td>{candidate.foldOverRisk ? '风险' : '未发现'}</td>
                      <td><button type="button" className={piecewisePreviewLayout === candidate.layout ? 'active' : ''} onClick={() => { setPiecewisePreviewRequestedLayout(candidate.layout); setShowPiecewisePreview(true) }}>{piecewisePreviewLayout === candidate.layout ? '显示中' : '预演'}</button></td>
                    </tr> : <tr key={candidate.layout}><td><b>{piecewiseLayoutLabel(candidate.layout)}</b></td><td colSpan={6}>不可用：{candidate.reason}</td></tr>)}</tbody>
                  </table></div>
                  <div className="georef-piecewise-note">分区模型只做诊断模拟；seam 关系、fold-over 与每区独立 check coverage 必须人工复核，当前不会写入 canonical geometry。</div>
                </div>}
                {spatialCv.available && <div className="georef-spatial-cv-block">
                  <div className="georef-panel-head"><strong>Spatial block cross-validation</strong><span>3×2 空间留块 · complexity-adjusted · 不改变当前模型</span></div>
                  <div className="georef-influence-table-wrap"><table className="georef-influence-table georef-spatial-cv-table">
                    <thead><tr><th>模型</th><th>参数</th><th>Spatial CV</th><th>Adjusted</th><th>Coverage</th><th>Fold稳定性</th><th>Worst fold</th><th>Independent check</th></tr></thead>
                    <tbody>{spatialCv.models.map((model) => model.available ? <tr key={model.id} className={`${model.id === spatialCv.bestGlobalModelId ? 'best-global' : ''} ${model.id === spatialCv.bestPiecewiseModelId ? 'best-piecewise' : ''}`}>
                      <td><b>{model.label}</b></td>
                      <td>{model.parameterCount}</td>
                      <td>{model.cvRmseM.toFixed(1)}m</td>
                      <td>{model.adjustedCvRmseM.toFixed(1)}m <small>(+{model.complexitySurchargePercent.toFixed(1)}%)</small></td>
                      <td>{(model.coverageRatio * 100).toFixed(0)}%</td>
                      <td>σ {model.foldRmseStdM.toFixed(1)}m · CV {model.foldStabilityRatio.toFixed(2)}</td>
                      <td>{model.worstFoldId}</td>
                      <td>{model.independentCheckRmseM == null ? '—' : `${model.independentCheckRmseM.toFixed(1)}m`}</td>
                    </tr> : <tr key={model.id} className="unavailable"><td><b>{model.label}</b></td><td>{model.parameterCount}</td><td colSpan={6}>不可完整验证：{model.reason} · coverage {(model.coverageRatio * 100).toFixed(0)}%</td></tr>)}</tbody>
                  </table></div>
                  <div className={`georef-spatial-cv-recommendation ${spatialCv.recommendation}`}><b>{spatialCvRecommendationLabel(spatialCv.recommendation)}</b><span>{spatialCv.reasons.join('；')}</span></div>
                  <div className="georef-piecewise-note">复杂度惩罚为项目启发式 surcharge：相对6参数 Affine，按参数量对 Spatial-CV RMSE 轻度上调；它不是 AIC/BIC，也不是法定测绘模型选择标准。</div>
                </div>}
                {monteCarlo?.available && <div className="georef-monte-carlo-block">
                  <div className="georef-panel-head"><strong>Monte Carlo / Bootstrap 不确定性传播</strong><span>固定 check truth · 200次默认扰动 · 不改变当前模型</span></div>
                  <div className="georef-influence-table-wrap"><table className="georef-influence-table georef-monte-carlo-table">
                    <thead><tr><th>模型</th><th>Valid</th><th>Raw wins</th><th>Raw rate</th><th>Mean holdout</th><th>Evidence wins</th><th>Evidence rate</th><th>Mean normalized</th></tr></thead>
                    <tbody>{monteCarlo.models.map((model) => <tr key={model.id} className={`${model.id === monteCarlo.winnerModelId ? 'winner' : ''} ${model.id === monteCarlo.evidenceWinnerModelId ? 'evidence-winner' : ''}`}>
                      <td><b>{model.label}</b></td>
                      <td>{model.validTrials}/{monteCarlo.trials}</td>
                      <td>{model.wins}</td>
                      <td>{(model.winRate * 100).toFixed(0)}%</td>
                      <td>{model.meanHoldoutRmseM == null ? '—' : `${model.meanHoldoutRmseM.toFixed(1)}m`}</td>
                      <td>{model.evidenceWins ?? '—'}</td>
                      <td>{model.evidenceWinRate == null ? '—' : `${(model.evidenceWinRate * 100).toFixed(0)}%`}</td>
                      <td>{model.meanNormalizedHoldout == null ? '—' : `${model.meanNormalizedHoldout.toFixed(2)}σ`}</td>
                    </tr>)}</tbody>
                  </table></div>
                  {monteCarlo.boundary && <div className="georef-monte-carlo-boundary"><b>当前 {session.method} 边界不确定性</b><span>P95 mean/max {monteCarlo.boundary.meanP95M.toFixed(1)} / {monteCarlo.boundary.maxP95M.toFixed(1)}m · observed max {monteCarlo.boundary.maxObservedM.toFixed(1)}m · 最不稳定段 V{monteCarlo.boundary.mostUnstableSegment.startVertexIndex + 1}–V{monteCarlo.boundary.mostUnstableSegment.endVertexIndex + 1}</span></div>}
                  <div className={`georef-monte-carlo-recommendation ${monteCarlo.recommendation}`}><b>{monteCarloRecommendationLabel(monteCarlo.recommendation)}</b><span>{monteCarlo.reasons.join('；')}</span></div>
                  <div className="georef-piecewise-note">{monteCarlo.uncertaintyMode === 'evidence-profiled' ? `证据校准模式：${monteCarlo.uncertaintySummary.profiledControlCount}/${monteCarlo.uncertaintySummary.fitControlCount} 个 fit 点已有 profile，${monteCarlo.uncertaintySummary.fallbackControlCount} 个仍回退到 1.5px / 10m。` : `统一 σ override：${monteCarlo.pixelSigmaPx.toFixed(1)}px / ${monteCarlo.groundSigmaM.toFixed(1)}m。`} 这些 σ 是研究误差假设，不是官方测绘精度或控制点真实误差的直接测量。</div>
                </div>}
                {systematicStress?.available && <div className="georef-systematic-stress-block">
                  <div className="georef-panel-head"><strong>Correlated / Systematic Error Stress Test</strong><span>结构化误差情景 · fixed check truth · 不改变当前模型</span></div>
                  <div className="georef-systematic-stress-summary">
                    <span><b>Baseline winner</b>{systematicStressModelLabel(systematicStress.baselineWinnerModelId)}</span>
                    <span><b>最大 Holdout 增量</b>{systematicStress.maxHoldoutIncreaseM.toFixed(1)}m</span>
                    <span><b>最大边界漂移</b>{systematicStress.maxBoundaryShiftM.toFixed(1)}m</span>
                    <span><b>模型翻转</b>{systematicStress.modelFlipCount} 次</span>
                  </div>
                  <div className="georef-influence-table-wrap"><table className="georef-influence-table georef-systematic-stress-table">
                    <thead><tr><th>情景</th><th>最坏变体</th><th>Worst holdout</th><th>Holdout Δ</th><th>Boundary max</th><th>Model flips</th><th>地图</th></tr></thead>
                    <tbody>{systematicStress.scenarios.map((scenario) => <tr key={scenario.id} className={`${scenario.id === systematicStress.dominantScenarioId ? 'dominant' : ''} ${(systematicStressScenarioId ?? systematicStress.dominantScenarioId) === scenario.id ? 'preview-selected' : ''}`}>
                      <td><b>{scenario.label}</b></td>
                      <td>{scenario.worstVariant.label}</td>
                      <td>{scenario.maxHoldoutRmseM.toFixed(1)}m</td>
                      <td>+{scenario.maxHoldoutIncreaseM.toFixed(1)}m</td>
                      <td>{scenario.maxBoundaryShiftM.toFixed(1)}m</td>
                      <td>{scenario.modelFlipCount}</td>
                      <td><button type="button" className={(systematicStressScenarioId ?? systematicStress.dominantScenarioId) === scenario.id ? 'active' : ''} disabled={!scenario.worstVariant.boundary} onClick={() => setSystematicStressScenarioId(scenario.id)}>{(systematicStressScenarioId ?? systematicStress.dominantScenarioId) === scenario.id ? '显示中' : '预演'}</button></td>
                    </tr>)}</tbody>
                  </table></div>
                  <div className={`georef-systematic-stress-recommendation ${systematicStress.recommendation}`}><b>{systematicStressRecommendationLabel(systematicStress.recommendation)}</b><span>{systematicStress.reasons.join('；')}</span></div>
                  <div className="georef-piecewise-note">默认压力：旋转 ±{systematicStress.options.rotationDeg}° · X/Y 比例尺 ±{(systematicStress.options.anisotropicScaleFraction * 100).toFixed(2)}% · 全体地面偏移 {systematicStress.options.commonGroundShiftM}m · 区域相关偏移 {systematicStress.options.regionalGroundBiasM}m · 单点 gross error {systematicStress.options.singleControlGrossErrorM}m · 波浪形变 {systematicStress.options.pixelWaveAmplitudePx}px。压力只施加于 fit observations，独立 check 点与边界像素保持固定。</div>
                </div>}
                {controlInfluence?.available && <div className="georef-influence-block">
                  <div className="georef-panel-head"><strong>拟合点 Influence / Leverage</strong><span>逐点删除重拟合 · 只建议复查，不自动删除</span></div>
                  <div className="georef-influence-table-wrap"><table className="georef-influence-table">
                    <thead><tr><th>点</th><th>状态</th><th>移除后 holdout</th><th>改善 Δ</th><th>边界漂移 mean/max</th><th>移除后 LOO</th></tr></thead>
                    <tbody>{influenceRecords.map((item) => {
                      const tone = influenceTone(item.status)
                      return <tr key={item.controlId} className={`${item.status} ${selectedControlId === item.controlId ? 'selected' : ''}`} onClick={() => setSelectedControlId(item.controlId)}>
                        <td><b>{item.label ?? item.controlId}</b></td>
                        <td><span className={`georef-influence-badge ${item.status}`}>{tone.label}</span></td>
                        <td>{item.omittedHoldoutRmseM.toFixed(1)}m</td>
                        <td className={item.holdoutImprovementM > 0 ? 'improves' : item.holdoutImprovementM < 0 ? 'worsens' : ''}>{item.holdoutImprovementM >= 0 ? '+' : ''}{item.holdoutImprovementM.toFixed(1)}m · {item.holdoutImprovementPercent >= 0 ? '+' : ''}{item.holdoutImprovementPercent.toFixed(0)}%</td>
                        <td>{item.boundaryMeanShiftM.toFixed(1)} / {item.boundaryMaxShiftM.toFixed(1)}m</td>
                        <td>{item.omittedLeaveOneOut.available ? `${item.omittedLeaveOneOut.rmseM.toFixed(1)}m · ${item.omittedLeaveOneOut.verdict}` : '不可用'}</td>
                      </tr>
                    })}</tbody>
                  </table></div>
                </div>}
                {robust?.available && <div className="georef-robust-block">
                  <div className="georef-panel-head"><strong>Robust / RANSAC 共识</strong><span>最小样本稳健诊断 · outlier 只建议复查</span></div>
                  <div className="georef-influence-table-wrap"><table className="georef-influence-table georef-robust-table">
                    <thead><tr><th>点</th><th>共识状态</th><th>outlier vote</th><th>Robust residual</th></tr></thead>
                    <tbody>{robustRecords.map((item) => {
                      const display = robustPointDisplay(item.status)
                      return <tr key={item.controlId} className={`${item.status} ${selectedControlId === item.controlId ? 'selected' : ''}`} onClick={() => setSelectedControlId(item.controlId)}>
                        <td><b>{item.label ?? item.controlId}</b></td>
                        <td><span className={`georef-robust-badge ${display.tone}`}>{display.label}</span></td>
                        <td>{(item.outlierVoteRate * 100).toFixed(0)}%</td>
                        <td>{item.robustResidualM.toFixed(1)}m</td>
                      </tr>
                    })}</tbody>
                  </table></div>
                  <div className="georef-robust-summary">{robust.reasons.join('；')} · trials {robust.validTrialCount}/{robust.trialCount} · consensus {robust.robustInlierControlIds.length}/{robust.points.length}</div>
                </div>}
                {irls?.available && <div className="georef-irls-block">
                  <div className="georef-panel-head"><strong>Huber / Tukey IRLS 连续权重</strong><span>降权只用于复查 · 不自动删点</span></div>
                  <div className="georef-influence-table-wrap"><table className="georef-influence-table georef-irls-table">
                    <thead><tr><th>点</th><th>状态</th><th>Huber w</th><th>Tukey w</th><th>Huber residual</th><th>Tukey residual</th></tr></thead>
                    <tbody>{irlsRecords.map((item) => {
                      const display = irlsCombinedDisplay(item.minWeight)
                      return <tr key={item.controlId} className={`${item.status} ${selectedControlId === item.controlId ? 'selected' : ''}`} onClick={() => setSelectedControlId(item.controlId)}>
                        <td><b>{item.label ?? item.controlId}</b></td>
                        <td><span className={`georef-irls-badge ${display.tone}`}>{display.label}</span></td>
                        <td>{item.huberWeight.toFixed(2)}</td>
                        <td>{item.tukeyWeight.toFixed(2)}</td>
                        <td>{item.huberResidualM.toFixed(1)}m</td>
                        <td>{item.tukeyResidualM.toFixed(1)}m</td>
                      </tr>
                    })}</tbody>
                  </table></div>
                  <div className="georef-robust-summary">{irls.reasons.join('；')} · Huber iter {irls.huber.iterations}{irls.huber.converged ? ' converged' : ''} · Tukey iter {irls.tukey.iterations}{irls.tukey.converged ? ' converged' : ''}</div>
                </div>}
                <code className="georef-model">{JSON.stringify(fit.model)}</code>
              </> : <p className="georef-muted">默认研究提示阈值：PASS ≤ 25m RMSE / 50m max；REVIEW ≤ 75m / 150m。v0.16 要求独立检查点、LOO 与空间分布共同判断，阈值不是法定测绘规范。</p>}
              <div className="georef-threshold-grid">
                <label>PASS RMSE<input type="number" min="0" value={session.qaThresholds.passRmseM} onChange={(event) => updateThreshold('passRmseM', event.target.value)} /></label>
                <label>PASS max<input type="number" min="0" value={session.qaThresholds.passMaxM} onChange={(event) => updateThreshold('passMaxM', event.target.value)} /></label>
                <label>REVIEW RMSE<input type="number" min="0" value={session.qaThresholds.reviewRmseM} onChange={(event) => updateThreshold('reviewRmseM', event.target.value)} /></label>
                <label>REVIEW max<input type="number" min="0" value={session.qaThresholds.reviewMaxM} onChange={(event) => updateThreshold('reviewMaxM', event.target.value)} /></label>
              </div>
            </section>

            <section className="georef-panel">
              <div className="georef-panel-head"><strong>边界像素与面积</strong><span>{session.boundaryPixels.length} 点</span></div>
              {boundaryExtentOptions.length > 0 && <label className="georef-extent-select">对应官方范围
                <select value={session.boundaryExtentId ?? ''} onChange={(event) => mutate((current) => ({ ...current, boundaryExtentId: event.target.value || undefined }))}>
                  <option value="">不指定</option>
                  {boundaryExtentOptions.map((extent) => <option value={extent.id} key={extent.id}>{extent.label}{extent.areaHa ? ` · ${extent.areaHa} ha` : ''}</option>)}
                </select>
              </label>}
              {selectedExtent?.areaHa && fit && session.boundaryPixels.length >= 3 && <div className="georef-area-qa">
                {areaComparison ? <>
                  <span className={`qa-verdict ${areaComparison.verdict}`}>{areaComparison.verdict.toUpperCase()}</span>
                  <b>{areaComparison.computedAreaHa.toFixed(2)} ha</b>
                  <span>官方 {areaComparison.officialAreaHa.toFixed(2)} ha · 差异 {areaComparison.differencePercent.toFixed(2)}%</span>
                </> : <span>面积计算不可用</span>}
              </div>}
              <div className="georef-inline-actions"><button type="button" disabled={!session.boundaryPixels.length} onClick={() => mutate((current) => ({ ...current, boundaryPixels: current.boundaryPixels.slice(0, -1) }))}>撤销末点</button><button type="button" disabled={!session.boundaryPixels.length} onClick={() => mutate((current) => ({ ...current, boundaryPixels: [] }))}>清空</button></div>
              {exports ? <>
                <div className="georef-export-actions">
                  <button type="button" onClick={() => downloadText(`${session.id}.wgs84.geojson`, JSON.stringify(exports.wgs84, null, 2), 'application/geo+json')}>下载 WGS84 GeoJSON</button>
                  <button type="button" onClick={() => downloadText(`${session.id}.gcj02.geojson`, JSON.stringify(exports.gcj02, null, 2), 'application/geo+json')}>下载 GCJ-02 GeoJSON</button>
                </div>
                <details><summary>预览 WGS84 GeoJSON</summary><pre>{JSON.stringify(exports.wgs84, null, 2)}</pre></details>
              </> : <p className="georef-muted">需要成功拟合，并至少记录3个不同边界像素点，才能生成 draft GeoJSON。</p>}

              <div className="georef-promotion-card">
                <div className="georef-panel-head"><strong>Canonical 边界晋升</strong><span>{selectedExtent?.geometryStatus === 'verified' ? '已锁定' : readiness?.verdict === 'strong' ? '可生成草稿' : '等待 STRONG QA'}</span></div>
                <p>浏览器不会直接修改 canonical 数据。只有 STRONG QA + 未 verified 的目标范围才能生成 patch；仍需输入精确批准令牌，再由 CLI 写入 reviewed registry。</p>
                <button type="button" disabled={!advancedQa || readiness?.verdict !== 'strong' || !selectedExtent || selectedExtent.geometryStatus === 'verified' || session.boundaryPixels.length < 3} onClick={generateCanonicalDraft}>生成 canonical patch 草稿</button>
                {canonicalDraft && <div className="georef-promotion-review">
                  <div><span>批准令牌</span><code>{approvalTokenForPatch(canonicalDraft)}</code></div>
                  <button type="button" onClick={() => downloadText(`${site.code}-${canonicalDraft.extentId}.draft-patch.json`, JSON.stringify(canonicalDraft, null, 2), 'application/json')}>下载草稿</button>
                  <input aria-label="canonical patch 批准令牌" placeholder={approvalTokenForPatch(canonicalDraft)} value={canonicalApprovalInput} onChange={(event) => setCanonicalApprovalInput(event.target.value)} />
                  <button type="button" className="promotion-approve" disabled={canonicalApprovalInput !== approvalTokenForPatch(canonicalDraft)} onClick={approveAndDownloadCanonicalPatch}>人工确认并下载 approved patch</button>
                </div>}
                {canonicalApproved && <div className="georef-promotion-cli"><b>下一步写入 canonical registry：</b><code>python scripts/apply_reviewed_extent_patch.py {site.code}-{canonicalApproved.extentId}.approved-patch.json</code><span>该命令只更新 reviewedExtentPatches.json；下次构建时才合并进 SiteSpatialExtent.geometry。</span></div>}
                {canonicalPatchError && <div className="georef-error">晋升失败：{canonicalPatchError}</div>}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  )
}

function checkInterpretationLabel(value: 'compatible' | 'tension' | 'inconsistent') {
  if (value === 'compatible') return 'check residual 与证据精度兼容'
  if (value === 'tension') return 'check residual 与证据精度存在张力'
  return 'check residual 明显超过证据误差范围'
}

function errorPatternLabel(pattern: 'stable' | 'global-shift' | 'local-distortion' | 'mixed') {
  if (pattern === 'stable') return '整体稳定'
  if (pattern === 'global-shift') return '系统性整体偏移'
  if (pattern === 'local-distortion') return '局部/非一致畸变'
  return '混合误差模式'
}

function modelRecommendationLabel(value: 'affine' | 'projective' | 'controls' | 'insufficient') {
  if (value === 'affine') return '优先 Affine'
  if (value === 'projective') return '优先 Projective'
  if (value === 'controls') return '优先调整控制点'
  return '需要更多独立检查点'
}

function localDistortionPatternLabel(value: 'stable' | 'structured-gradient' | 'localized-hotspot' | 'irregular') {
  if (value === 'stable') return '局部场稳定'
  if (value === 'structured-gradient') return '结构性梯度形变'
  if (value === 'localized-hotspot') return '局部热点形变'
  return '非规则局部形变'
}

function piecewiseLayoutLabel(layout: 'vertical-2' | 'horizontal-2' | 'quadrants-4') {
  if (layout === 'vertical-2') return '2×1 左右分区'
  if (layout === 'horizontal-2') return '1×2 上下分区'
  return '2×2 四象限'
}

function piecewiseCandidateLabel(value: 'promising' | 'review' | 'reject') {
  if (value === 'promising') return '值得继续研究'
  if (value === 'review') return '需人工复核'
  return '不建议采用'
}

function piecewiseRecommendationLabel(value: 'consider-piecewise' | 'review-piecewise' | 'global-preferred' | 'insufficient') {
  if (value === 'consider-piecewise') return '存在有前景的分区候选'
  if (value === 'review-piecewise') return '分区候选需要人工复核'
  if (value === 'global-preferred') return '当前仍优先全局模型'
  return '控制点分布不足'
}

function spatialCvRecommendationLabel(value: 'piecewise-supported' | 'piecewise-review' | 'overfit-risk' | 'global-preferred' | 'insufficient') {
  if (value === 'piecewise-supported') return '空间留块仍支持 Piecewise'
  if (value === 'piecewise-review') return 'Piecewise 有泛化收益 · 继续复核'
  if (value === 'overfit-risk') return '当前 Piecewise 存在过拟合风险'
  if (value === 'global-preferred') return '复杂度调整后优先全局模型'
  return '空间交叉验证证据不足'
}

function monteCarloRecommendationLabel(value: 'global-stable' | 'piecewise-stable' | 'model-uncertain' | 'boundary-uncertain') {
  if (value === 'global-stable') return '扰动下全局模型稳定'
  if (value === 'piecewise-stable') return '扰动下 Piecewise 稳定占优'
  if (value === 'boundary-uncertain') return '边界位置不确定性偏高'
  return '模型胜负对扰动敏感'
}

function systematicStressRecommendationLabel(value: 'stable' | 'model-sensitive' | 'boundary-sensitive' | 'systematic-fragile') {
  if (value === 'stable') return '系统性压力下仍稳定'
  if (value === 'model-sensitive') return '模型选择对系统误差敏感'
  if (value === 'boundary-sensitive') return '边界对系统误差敏感'
  return '系统性误差下脆弱 · 优先复查'
}

function systematicStressModelLabel(value: 'affine' | 'projective' | 'piecewise-vertical-2' | 'piecewise-horizontal-2' | 'piecewise-quadrants-4') {
  if (value === 'affine') return 'Global Affine'
  if (value === 'projective') return 'Global Projective'
  if (value === 'piecewise-vertical-2') return 'Piecewise 2×1'
  if (value === 'piecewise-horizontal-2') return 'Piecewise 1×2'
  return 'Piecewise 2×2'
}

function localDistortionRecommendationLabel(value: 'need-more-checks' | 'global-model-sufficient' | 'prefer-projective' | 'review-controls' | 'consider-piecewise' | 'inspect-local-distortion') {
  if (value === 'global-model-sufficient') return '全局模型已足够'
  if (value === 'prefer-projective') return '优先 Projective 再复核'
  if (value === 'review-controls') return '优先复查控制点'
  if (value === 'consider-piecewise') return '持续局部形变 · 考虑分区配准'
  if (value === 'inspect-local-distortion') return '继续检查局部形变'
  return '需要更多独立检查点'
}

function robustRecommendationLabel(value: 'agree' | 'review-outliers' | 'robust-improves' | 'least-squares' | 'insufficient') {
  if (value === 'review-outliers') return '存在稳定 RANSAC outlier · 优先复查'
  if (value === 'robust-improves') return 'Robust 泛化更好 · 继续复查控制点'
  if (value === 'least-squares') return '普通最小二乘表现更好'
  if (value === 'agree') return 'Robust 与最小二乘基本一致'
  return '证据不足'
}

function irlsRecommendationLabel(value: 'agree' | 'review-downweighted' | 'irls-improves' | 'least-squares' | 'insufficient') {
  if (value === 'review-downweighted') return '连续降权与 Holdout 同时提示 · 优先复查'
  if (value === 'irls-improves') return 'IRLS 泛化更好 · 继续复查权重'
  if (value === 'least-squares') return '普通最小二乘表现更好'
  if (value === 'agree') return 'IRLS 与最小二乘基本一致'
  return '证据不足'
}

function formatDiagnosticRmse(value?: number) {
  return value == null ? '—' : `${value.toFixed(1)}m`
}

function DiagnosticCard({ title, tone, primary, secondary }: { title: string, tone: 'pass' | 'review' | 'fail' | 'idle', primary: string, secondary: string }) {
  return <div className={`georef-diagnostic-card ${tone}`}><strong>{title}</strong><b>{primary}</b><small>{secondary}</small></div>
}

function QaCard({ title, verdict, primary, secondary }: { title: string, verdict: string, primary: string, secondary: string }) {
  const tone = verdict === 'pass' || verdict === 'good' || verdict === 'strong' ? 'pass' : verdict === 'review' ? 'review' : verdict === 'fail' || verdict === 'poor' ? 'fail' : 'idle'
  return <div className={`georef-qa-card ${tone}`}><div><strong>{title}</strong><span>{verdict.toUpperCase()}</span></div><b>{primary}</b><small>{secondary}</small></div>
}

function stableSessionId(siteId: number, targetId?: string) {
  return targetId ? `site-${siteId}:${targetId}` : `site-${siteId}:free`
}

function loadSession(siteId: number, targetId?: string, defaultBoundaryExtentId?: string) {
  const id = stableSessionId(siteId, targetId)
  try {
    const raw = localStorage.getItem(sessionStorageKey(id))
    if (raw) {
      const parsed = parseSession(raw)
      return parsed.boundaryExtentId || !defaultBoundaryExtentId ? parsed : { ...parsed, boundaryExtentId: defaultBoundaryExtentId }
    }
  } catch { /* browser storage may be disabled */ }
  return { ...createSession({ id, targetId, siteId }), ...(defaultBoundaryExtentId ? { boundaryExtentId: defaultBoundaryExtentId } : {}) }
}

function downloadText(name: string, text: string, type: string) {
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
