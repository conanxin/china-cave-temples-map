import { useCallback, useMemo, useState } from 'react'
import { FilterPanel } from './components/FilterPanel'
import { SiteDetail } from './components/SiteDetail'
import { SiteIndex } from './components/SiteIndex'
import { GeoreferenceWorkbench } from './components/GeoreferenceWorkbench'
import { sites } from './data/sites'
import type { SiteFilters } from './data/types'
import { filterSites } from './features/sites/filterSites'
import { AmapMap } from './map/AmapMap'

const emptyFilters: SiteFilters = {
  query: '', regions: [], batches: [], types: [], religions: [], verifiedOnly: false,
}

export default function App() {
  const [filters, setFilters] = useState<SiteFilters>(emptyFilters)
  const [selectedId, setSelectedId] = useState<number>(1)
  const [mapFocusId, setMapFocusId] = useState<number | undefined>(undefined)
  const [mobilePane, setMobilePane] = useState<'map' | 'index' | 'detail'>('map')
  const [georefOpen, setGeorefOpen] = useState(false)
  const filtered = useMemo(() => filterSites(sites, filters), [filters])
  const selected = sites.find((site) => site.id === selectedId)
  const verifiedCount = sites.filter((site) => site.coordinateConfidence === 'verified' || site.subpoints?.some((point) => point.coordinateConfidence === 'verified')).length
  const select = useCallback((id: number) => {
    setSelectedId(id)
    setMapFocusId(id)
    if (window.innerWidth < 920) setMobilePane('detail')
  }, [])

  return (
    <main className="app-shell">
      <header className="masthead">
        <div>
          <div className="eyebrow">NATIONAL MUSEUM WALL MAP · DIGITAL RESEARCH EDITION</div>
          <h1>中国代表性石窟寺互动地图</h1>
          <p>国博展墙 01–112 点数字化研究版 · 高德地图工作台</p>
        </div>
        <div className="masthead-actions">
          <button type="button" onClick={() => setGeorefOpen(true)}>配准工作台</button>
        </div>
        <div className="masthead-stats">
          <div><strong>{sites.length}</strong><span>展墙遗址</span></div>
          <div><strong>{filtered.length}</strong><span>当前结果</span></div>
          <div><strong>{verifiedCount}</strong><span>至少1点已核验</span></div>
        </div>
      </header>

      <nav className="mobile-tabs" aria-label="移动端视图">
        {(['map', 'index', 'detail'] as const).map((pane) => <button key={pane} className={mobilePane === pane ? 'active' : ''} onClick={() => setMobilePane(pane)}>{pane === 'map' ? '地图' : pane === 'index' ? '索引' : '详情'}</button>)}
      </nav>

      <div className="workspace">
        <aside className={`left-rail mobile-${mobilePane === 'index' ? 'show' : 'hide'}`}>
          <FilterPanel filters={filters} onChange={setFilters} onReset={() => setFilters(emptyFilters)} />
          <SiteIndex sites={filtered} selectedId={selectedId} onSelect={select} />
        </aside>
        <div className={`map-column mobile-${mobilePane === 'map' ? 'show' : 'hide'}`}>
          <AmapMap sites={filtered} selectedId={selectedId} focusId={mapFocusId} selectedSite={selected} onSelect={select} />
        </div>
        <div className={`detail-column mobile-${mobilePane === 'detail' ? 'show' : 'hide'}`}>
          <SiteDetail site={selected} />
        </div>
      </div>

      {georefOpen && selected && <GeoreferenceWorkbench site={selected} onClose={() => setGeorefOpen(false)} />}

      <footer className="footer-note">
        <span>数据原则：不以行政区中心伪装遗址坐标。</span>
        <span>保护范围只有在取得可核验几何后才绘制；文字四至不会被伪造成精确 Polygon。</span>
      </footer>
    </main>
  )
}