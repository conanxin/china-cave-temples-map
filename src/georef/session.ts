import { DEFAULT_QA_THRESHOLDS } from './qa.ts'
import type { GeoreferenceSession } from './types.ts'

interface CreateSessionOptions {
  id?: string
  targetId?: string
  siteId?: number
  now?: string
}

function generateSessionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `georef-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function createSession(options: CreateSessionOptions = {}): GeoreferenceSession {
  const now = options.now ?? new Date().toISOString()
  return {
    schemaVersion: 1,
    id: options.id ?? generateSessionId(),
    ...(options.targetId ? { targetId: options.targetId } : {}),
    ...(options.siteId != null ? { siteId: options.siteId } : {}),
    method: 'affine',
    controls: [],
    boundaryPixels: [],
    qaThresholds: { ...DEFAULT_QA_THRESHOLDS },
    createdAt: now,
    updatedAt: now,
  }
}

export function sessionStorageKey(sessionId: string) {
  return `china-cave-georef-session:${sessionId}`
}

export function serializeSession(session: GeoreferenceSession) {
  validateSession(session)
  return JSON.stringify(session, null, 2)
}

export function parseSession(json: string): GeoreferenceSession {
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch {
    throw new Error('session JSON is invalid')
  }
  validateSession(value)
  return value as GeoreferenceSession
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function validateSession(value: unknown): asserts value is GeoreferenceSession {
  if (!value || typeof value !== 'object') throw new Error('session must be an object')
  const session = value as Partial<GeoreferenceSession>
  if (session.schemaVersion !== 1) throw new Error('unsupported session schemaVersion')
  if (typeof session.id !== 'string' || !session.id.trim()) throw new Error('session id is required')
  if (session.method !== 'affine' && session.method !== 'projective') throw new Error('session method is invalid')
  if (!Array.isArray(session.controls)) throw new Error('session controls must be an array')
  for (const control of session.controls) {
    if (!control || typeof control !== 'object' || typeof control.id !== 'string') throw new Error('control point id is invalid')
    if (!control.pixel || !finite(control.pixel.x) || !finite(control.pixel.y)) throw new Error('control point pixel coordinates are invalid')
    if (control.role != null && control.role !== 'fit' && control.role !== 'check') throw new Error('control point role is invalid')
    if (!control.ground || !finite(control.ground.lng) || !finite(control.ground.lat)) throw new Error('control point ground coordinates are invalid')
    if (control.ground.lng < -180 || control.ground.lng > 180 || control.ground.lat < -90 || control.ground.lat > 90) throw new Error('control point ground coordinates are outside WGS84 range')
    if (control.groundSource != null && control.groundSource !== 'manual' && control.groundSource !== 'amap-click') throw new Error('control point ground source is invalid')
    if (control.groundSourceCrs != null && control.groundSourceCrs !== 'WGS84' && control.groundSourceCrs !== 'GCJ-02') throw new Error('control point ground source CRS is invalid')
    if (control.groundSourceOriginal != null) {
      if (!finite(control.groundSourceOriginal.lng) || !finite(control.groundSourceOriginal.lat)) throw new Error('control point original ground coordinates are invalid')
      if (control.groundSourceOriginal.lng < -180 || control.groundSourceOriginal.lng > 180 || control.groundSourceOriginal.lat < -90 || control.groundSourceOriginal.lat > 90) throw new Error('control point original ground coordinates are outside range')
    }
    if (control.groundSource === 'amap-click' && (control.groundSourceCrs !== 'GCJ-02' || !control.groundSourceOriginal)) throw new Error('AMap control point provenance is incomplete')
    if (control.uncertainty != null) {
      const u = control.uncertainty
      const pixelEvidence = ['exact-corner', 'clear-feature', 'fuzzy-feature', 'approximate-zone', 'unknown']
      const groundEvidence = ['official-survey-gis', 'field-gps', 'official-coordinate', 'amap-poi', 'manual-crosscheck', 'osm-wikidata', 'unknown']
      if (u.pixelEvidence != null && !pixelEvidence.includes(u.pixelEvidence)) throw new Error('control point pixel uncertainty evidence is invalid')
      if (u.groundEvidence != null && !groundEvidence.includes(u.groundEvidence)) throw new Error('control point ground uncertainty evidence is invalid')
      if (u.pixelSigmaPx != null && (!finite(u.pixelSigmaPx) || u.pixelSigmaPx < 0)) throw new Error('control point pixel uncertainty sigma is invalid')
      if (u.groundSigmaM != null && (!finite(u.groundSigmaM) || u.groundSigmaM < 0)) throw new Error('control point ground uncertainty sigma is invalid')
      const calibrationBasis = ['metadata', 'measured', 'heuristic', 'manual-override']
      const reviewStatus = ['unreviewed', 'reviewed']
      if (u.evidenceRef != null && (typeof u.evidenceRef !== 'string' || !u.evidenceRef.trim())) throw new Error('control point uncertainty evidence reference is invalid')
      if (u.evidenceDate != null && (typeof u.evidenceDate !== 'string' || Number.isNaN(Date.parse(u.evidenceDate)))) throw new Error('control point uncertainty evidence date is invalid')
      if (u.calibrationBasis != null && !calibrationBasis.includes(u.calibrationBasis)) throw new Error('control point uncertainty calibration basis is invalid')
      if (u.reviewStatus != null && !reviewStatus.includes(u.reviewStatus)) throw new Error('control point uncertainty review status is invalid')
      if (u.reviewedAt != null && (typeof u.reviewedAt !== 'string' || Number.isNaN(Date.parse(u.reviewedAt)))) throw new Error('control point uncertainty reviewed timestamp is invalid')
      if (u.note != null && typeof u.note !== 'string') throw new Error('control point uncertainty note is invalid')
    }
  }
  if (!Array.isArray(session.boundaryPixels)) throw new Error('session boundaryPixels must be an array')
  for (const point of session.boundaryPixels) {
    if (!point || !finite(point.x) || !finite(point.y)) throw new Error('boundary pixel coordinates are invalid')
  }
  const qa = session.qaThresholds
  if (!qa || !finite(qa.passRmseM) || !finite(qa.passMaxM) || !finite(qa.reviewRmseM) || !finite(qa.reviewMaxM)) throw new Error('session QA thresholds are invalid')
  if (qa.passRmseM < 0 || qa.passMaxM < 0 || qa.reviewRmseM < qa.passRmseM || qa.reviewMaxM < qa.passMaxM) throw new Error('session QA thresholds are inconsistent')
  if (session.imageName != null && typeof session.imageName !== 'string') throw new Error('session imageName is invalid')
  if ((session.imageWidth != null && (!finite(session.imageWidth) || session.imageWidth <= 0)) || (session.imageHeight != null && (!finite(session.imageHeight) || session.imageHeight <= 0))) throw new Error('session image dimensions are invalid')
  if (typeof session.createdAt !== 'string' || typeof session.updatedAt !== 'string') throw new Error('session timestamps are invalid')
  if (session.siteId != null && (!Number.isInteger(session.siteId) || session.siteId <= 0)) throw new Error('session siteId is invalid')
  if (session.boundaryExtentId != null && (typeof session.boundaryExtentId !== 'string' || !session.boundaryExtentId.trim())) throw new Error('session boundaryExtentId is invalid')
}
