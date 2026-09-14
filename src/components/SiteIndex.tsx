import type { CaveTempleSite } from '../data/types'

interface Props {
  sites: CaveTempleSite[]
  selectedId?: number
  onSelect: (id: number) => void
}

export function SiteIndex({ sites, selectedId, onSelect }: Props) {
  return (
    <section className="site-index" aria-label="遗址索引">
      <div className="index-heading">
        <span>编号索引</span><span>{sites.length} 项</span>
      </div>
      <div className="site-list">
        {sites.length === 0 ? <div className="empty-state">当前筛选没有匹配遗址。</div> : sites.map((site) => {
          const hasVerifiedComponent = site.subpoints?.some((point) => point.coordinateConfidence === 'verified') ?? false
          const status = site.coordinateConfidence === 'verified' ? 'verified' : hasVerifiedComponent ? 'partial' : site.coordinateConfidence
          const statusTitle = status === 'verified' ? '主点坐标已核验' : status === 'partial' ? '部分组成点已核验' : '等待坐标核验'
          return (
          <button
            type="button"
            key={site.id}
            className={`site-row ${selectedId === site.id ? 'selected' : ''}`}
            onClick={() => onSelect(site.id)}
          >
            <span className="site-code">{site.code}</span>
            <span className="site-row-main">
              <strong>{site.name}</strong>
              <small>{site.province.replace('省', '')} · {site.county}</small>
            </span>
            <span className={`status-dot ${status}`} title={statusTitle} />
          </button>
          )
        })}
      </div>
    </section>
  )
}
