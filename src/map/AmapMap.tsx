import { useEffect, useMemo, useRef, useState } from 'react'
import type { CaveTempleSite } from '../data/types'
import { loadAmap } from './amapLoader'
import { getMapDisplayPoints, type CandidateMapPoint } from './getMapDisplayPoints'
import { getGroupRelationLines } from './getGroupRelationLines'
import { getSpatialExtentPolygons } from './getSpatialExtentPolygons'
import { spatialExtentStyle } from './spatialExtentPresentation'

interface Props {
  sites: CaveTempleSite[]
  selectedId?: number
  onSelect: (id: number) => void
}

const CACHE_KEY = 'china-cave-temples-amap-candidates-v1'

export function AmapMap({ sites, selectedId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])
  const relationLinesRef = useRef<any[]>([])
  const spatialExtentPolygonsRef = useRef<any[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'missing-key' | 'error'>('idle')
  const [error, setError] = useState('')
  const [resolved, setResolved] = useState<Record<number, CandidateMapPoint>>(() => readCache())
  const [showCandidates, setShowCandidates] = useState(false)
  const [showGroupRelations, setShowGroupRelations] = useState(false)
  const [showSpatialExtents, setShowSpatialExtents] = useState(false)
  const key = import.meta.env.VITE_AMAP_KEY ?? ''

  const verifiedSiteCount = useMemo(() => sites.filter((site) => (site.coordinateConfidence === 'verified' && site.lng != null && site.lat != null) || site.subpoints?.some((point) => point.coordinateConfidence === 'verified')).length, [sites])
  const verifiedMarkerCount = useMemo(() => getMapDisplayPoints(sites, {}, false).length, [sites])
  const displayPoints = useMemo(() => getMapDisplayPoints(sites, resolved, showCandidates), [sites, resolved, showCandidates])
  const groupRelations = useMemo(() => getGroupRelationLines(sites), [sites])
  const spatialExtentPolygons = useMemo(() => getSpatialExtentPolygons(sites), [sites])

  useEffect(() => {
    let cancelled = false
    if (!key || key === 'AMAP_KEY') {
      setStatus('missing-key')
      return
    }
    setStatus('loading')
    loadAmap(key).then((AMap) => {
      if (cancelled || !containerRef.current) return
      if (!mapRef.current) {
        mapRef.current = new AMap.Map(containerRef.current, {
          zoom: 4.3,
          center: [105.5, 35.8],
          viewMode: '2D',
          mapStyle: 'amap://styles/normal',
        })
      }
      setStatus('ready')
    }).catch((reason) => {
      if (cancelled) return
      setStatus('error')
      setError(reason instanceof Error ? reason.message : String(reason))
    })
    return () => { cancelled = true }
  }, [key])

  useEffect(() => {
    if (status !== 'ready' || !mapRef.current || !window.AMap) return
    markersRef.current.forEach((marker) => marker.setMap(null))
    markersRef.current = displayPoints.map(({ site, point }) => {
      const el = document.createElement('button')
      el.className = `amap-site-marker ${point.confidence} ${selectedId === site.id ? 'selected' : ''}`
      el.textContent = point.markerLabel
      el.title = point.subpointName ? `${point.markerLabel} ${point.subpointName} · ${site.name}` : `${site.code} ${site.name}`
      const marker = new window.AMap.Marker({
        position: [point.lng, point.lat],
        content: el,
        offset: new window.AMap.Pixel(-17, -17),
        zIndex: selectedId === site.id ? 160 : 110,
      })
      marker.on('click', () => onSelect(site.id))
      marker.setMap(mapRef.current)
      return marker
    })
  }, [displayPoints, onSelect, selectedId, status])

  useEffect(() => {
    if (status !== 'ready' || !mapRef.current || !window.AMap) return
    relationLinesRef.current.forEach((line) => line.setMap(null))
    relationLinesRef.current = []
    if (!showGroupRelations) return

    relationLinesRef.current = groupRelations.map((relation) => {
      const line = new window.AMap.Polyline({
        path: relation.path,
        strokeColor: '#6f6256',
        strokeOpacity: 0.62,
        strokeWeight: 2,
        strokeStyle: 'dashed',
        zIndex: 70,
      })
      line.setMap(mapRef.current)
      return line
    })
  }, [groupRelations, showGroupRelations, status])

  useEffect(() => {
    if (status !== 'ready' || !mapRef.current || !window.AMap) return
    spatialExtentPolygonsRef.current.forEach((polygon) => polygon.setMap(null))
    spatialExtentPolygonsRef.current = []
    if (!showSpatialExtents) return

    spatialExtentPolygonsRef.current = spatialExtentPolygons.map((extent) => {
      const style = spatialExtentStyle(extent.kind)
      const polygon = new window.AMap.Polygon({
        path: extent.path,
        strokeColor: style.strokeColor,
        strokeOpacity: 0.9,
        strokeWeight: 2,
        strokeStyle: style.strokeStyle,
        fillColor: style.fillColor,
        fillOpacity: style.fillOpacity,
        zIndex: 55,
      })
      polygon.setExtData?.(extent)
      polygon.on?.('click', () => onSelect(extent.siteId))
      polygon.setMap(mapRef.current)
      return polygon
    })
  }, [onSelect, showSpatialExtents, spatialExtentPolygons, status])

  useEffect(() => {
    if (status !== 'ready' || !window.AMap) return
    const unresolved = sites.filter((site) => site.coordinateConfidence !== 'verified' && !resolved[site.id])
    if (!unresolved.length) return
    let stopped = false

    const run = async () => {
      const next = { ...resolved }
      for (const site of unresolved) {
        if (stopped) break
        const point = await resolveWithAmap(window.AMap, site)
        if (point) {
          next[site.id] = point
          setResolved({ ...next })
          writeCache(next)
        }
        await delay(120)
      }
    }
    void run()
    return () => { stopped = true }
  }, [sites, status]) // intentional: resolution cache drives rendering, not a restart loop

  useEffect(() => {
    if (!selectedId || status !== 'ready' || !mapRef.current) return
    const target = displayPoints.find(({ site }) => site.id === selectedId)
    if (target) {
      mapRef.current.setZoomAndCenter(Math.max(mapRef.current.getZoom(), 8), [target.point.lng, target.point.lat], false, 350)
    }
  }, [selectedId, status, displayPoints])

  const fit = () => {
    if (mapRef.current && markersRef.current.length) mapRef.current.setFitView(markersRef.current, false, [54, 54, 54, 54], 10)
  }

  return (
    <section className="map-panel">
      <div className="map-toolbar">
        <div>
          <strong>高德地图工作台</strong>
          <span>{verifiedSiteCount}/{sites.length} 个当前结果至少有1个核验点 · 已发布 {verifiedMarkerCount} 个核验标记 · 候选缓存 {Object.keys(resolved).length}{showCandidates ? ` · 正在预览 ${displayPoints.filter(({ point }) => point.confidence === 'probable').length} 个候选` : ''}</span>
        </div>
        <div className="map-toolbar-actions">
          <button type="button" className={showSpatialExtents ? 'active extent-active' : ''} onClick={() => setShowSpatialExtents((value) => !value)} disabled={!spatialExtentPolygons.length} title="只显示已有可靠几何证据的空间范围；研究分布范围与法定保护范围严格区分">{showSpatialExtents ? '隐藏范围' : `空间范围 ${spatialExtentPolygons.length}`}</button>
          <button type="button" className={showGroupRelations ? 'active relation-active' : ''} onClick={() => setShowGroupRelations((value) => !value)} disabled={!groupRelations.length} title="虚线只表示同属一个遗址群项目，不是保护范围边界">{showGroupRelations ? '隐藏关系' : `组内关系 ${groupRelations.length}`}</button>
          <button type="button" className={showCandidates ? 'active' : ''} onClick={() => setShowCandidates((value) => !value)} disabled={!Object.keys(resolved).length}>{showCandidates ? '隐藏候选' : '预览候选'}</button>
          <button type="button" onClick={fit} disabled={!displayPoints.length}>适配当前结果</button>
        </div>
      </div>
      <div className="map-stage">
        <div ref={containerRef} className="amap-container" />
        {status === 'missing-key' && <MapNotice title="等待高德 Key" text="浏览器端需要 VITE_AMAP_KEY；生产代理的 AMAP_SECURITY_CODE 在部署平台服务端配置。文字数据库、筛选和详情不依赖 Key。" />}
        {status === 'loading' && <MapNotice title="正在加载高德地图" text="地图加载完成后会逐项使用名称 + 行政区检索候选 POI，并把结果缓存到本机浏览器。" />}
        {status === 'error' && <MapNotice title="高德地图加载失败" text={`错误：${error}`} />}
        {status === 'ready' && Object.keys(resolved).length < sites.filter((site) => site.coordinateConfidence !== 'verified').length && (
          <div className="map-progress">后台候选检索中 · 已缓存 {Object.keys(resolved).length} 条；候选不会直接发布为 Marker</div>
        )}
        {status === 'ready' && <div className="map-legend"><span><i className="legend-dot verified" />人工核验·已发布</span><span><i className="legend-dot probable" />高德候选{showCandidates ? '·审阅模式显示' : '·默认隐藏'}</span><span><i className="legend-area research" />公开经纬研究范围·非国保边界</span><span><i className="legend-line" />遗址群组成关系·非保护边界</span></div>}
      </div>
    </section>
  )
}

function MapNotice({ title, text }: { title: string, text: string }) {
  return <div className="map-notice"><div className="map-notice-mark">经</div><h3>{title}</h3><p>{text}</p></div>
}

function delay(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)) }

function resolveWithAmap(AMap: any, site: CaveTempleSite): Promise<CandidateMapPoint | null> {
  return new Promise((resolve) => {
    const place = new AMap.PlaceSearch({ pageSize: 8, pageIndex: 1, city: site.prefecture, citylimit: false })
    place.search(site.amapQuery, (status: string, result: any) => {
      if (status !== 'complete' || !result?.poiList?.pois?.length) return resolve(null)
      const candidates = result.poiList.pois as any[]
      const best = candidates
        .map((poi) => ({ poi, score: scorePoi(poi, site) }))
        .sort((a, b) => b.score - a.score)[0]
      if (!best || best.score < 3 || !best.poi.location) return resolve(null)
      resolve({
        siteId: site.id,
        lng: Number(best.poi.location.lng),
        lat: Number(best.poi.location.lat),
        confidence: 'probable',
        source: `高德 POI 候选：${best.poi.name ?? site.name}`,
      })
    })
  })
}

function scorePoi(poi: any, site: CaveTempleSite) {
  const name = String(poi.name ?? '').replace(/[\s（）()]/g, '')
  const canonical = site.name.replace(/[\s（）()]/g, '')
  let score = 0
  if (name === canonical) score += 8
  else if (name.includes(canonical) || canonical.includes(name)) score += 5
  if (site.aliases.some((alias) => name.includes(alias.replace(/[\s（）()]/g, '')))) score += 4
  const province = String(poi.pname ?? poi.address ?? '')
  const city = String(poi.cityname ?? poi.address ?? '')
  const district = String(poi.adname ?? poi.address ?? '')
  if (province.includes(site.province.replace(/[省市自治区维吾尔回族壮族]/g, ''))) score += 2
  if (city.includes(site.prefecture.replace(/[市地区自治州]/g, ''))) score += 2
  const countyCore = site.county.split(/[（/]/)[0].replace(/[市县区旗]/g, '')
  if (district.includes(countyCore) || String(poi.address ?? '').includes(countyCore)) score += 3
  return score
}

function readCache(): Record<number, CandidateMapPoint> {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}
function writeCache(value: Record<number, CandidateMapPoint>) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(value)) } catch { /* ignore private-mode quota */ }
}
