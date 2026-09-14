import { useEffect, useRef, useState } from 'react'
import type { CaveTempleSite } from '../data/types'
import type { GroundPoint } from '../georef/types'
import { gcj02ToWgs84 } from '../geo/gcj02ToWgs84'
import { getAmapPickerCenter } from '../georef/amapPicker'
import { loadAmap } from '../map/amapLoader'

export interface AmapGroundPick {
  gcj02: GroundPoint
  wgs84: GroundPoint
}

interface Props {
  site: CaveTempleSite
  onUse: (pick: AmapGroundPick) => void
  onClose: () => void
}

export function AmapGroundPointPicker({ site, onUse, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing-key' | 'error'>('loading')
  const [error, setError] = useState('')
  const [pick, setPick] = useState<AmapGroundPick>()
  const key = import.meta.env.VITE_AMAP_KEY ?? ''
  const security = import.meta.env.VITE_AMAP_SECURITY_CODE ?? ''

  useEffect(() => {
    let cancelled = false
    if (!key || key === 'AMAP_KEY') {
      setStatus('missing-key')
      return
    }
    loadAmap(key, security).then((AMap) => {
      if (cancelled || !containerRef.current) return
      const center = getAmapPickerCenter(site)
      const map = new AMap.Map(containerRef.current, { center, zoom: center[0] === 105.5 && center[1] === 35.8 ? 4.5 : 15, viewMode: '2D', mapStyle: 'amap://styles/normal' })
      mapRef.current = map
      map.on('click', (event: any) => {
        const lng = Number(event.lnglat?.getLng?.() ?? event.lnglat?.lng)
        const lat = Number(event.lnglat?.getLat?.() ?? event.lnglat?.lat)
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) return
        const [wgsLng, wgsLat] = gcj02ToWgs84(lng, lat)
        const next = { gcj02: { lng, lat }, wgs84: { lng: wgsLng, lat: wgsLat } }
        setPick(next)
        if (markerRef.current) markerRef.current.setMap(null)
        markerRef.current = new AMap.Marker({ position: [lng, lat], zIndex: 200 })
        markerRef.current.setMap(map)
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
      if (markerRef.current) markerRef.current.setMap(null)
      mapRef.current?.destroy?.()
      mapRef.current = undefined
    }
  }, [key, security, site])

  return (
    <div className="georef-amap-picker-overlay" role="dialog" aria-modal="true" aria-label="高德地图控制点取点">
      <div className="georef-amap-picker-shell">
        <header><div><strong>现代高德底图取点</strong><span>{site.code} · {site.name}</span></div><button type="button" onClick={onClose}>关闭</button></header>
        <div className="georef-amap-picker-map" ref={containerRef} />
        {status === 'missing-key' && <div className="georef-amap-picker-notice">尚未配置高德 Web(JS API) Key。可继续手工输入 WGS84 经纬度。</div>}
        {status === 'error' && <div className="georef-amap-picker-notice">高德地图加载失败：{error}</div>}
        {status === 'loading' && <div className="georef-amap-picker-notice">正在加载高德地图…</div>}
        <footer>
          <div className="georef-amap-picker-coords">
            {pick ? <>
              <span><b>GCJ-02</b> {pick.gcj02.lng.toFixed(6)}, {pick.gcj02.lat.toFixed(6)}</span>
              <span><b>WGS84</b> {pick.wgs84.lng.toFixed(6)}, {pick.wgs84.lat.toFixed(6)}</span>
            </> : <span>点击现代底图中的对应真实地物；点击本身不会自动写入控制点。</span>}
          </div>
          <button type="button" disabled={!pick} onClick={() => pick && onUse(pick)}>使用此位置</button>
        </footer>
      </div>
    </div>
  )
}
