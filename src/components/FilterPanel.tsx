import type { HeritageBatch, RegionGroup, Religion, SiteFilters, SiteType } from '../data/types'

const regionOptions: Array<[RegionGroup, string]> = [
  ['xinjiang', '新疆地区'], ['qingzang', '青藏地区'], ['north', '中原北方'], ['south', '南方地区'],
]
const batchOptions: Array<[HeritageBatch, string]> = [
  [1, '第一批'], [2, '第二批'], [3, '第三批'], [4, '第四批'], [5, '第五批'], ['5-supplement', '第五批增补'], [6, '第六批'], [7, '第七批'], [8, '第八批'],
]
const typeOptions: Array<[SiteType, string]> = [
  ['cave-temple', '石窟寺'], ['cliff-carving', '摩崖/石刻'], ['giant-buddha', '巨型造像'], ['mixed', '复合遗址'],
]
const religionOptions: Array<[Religion, string]> = [
  ['buddhist', '佛教'], ['daoist', '道教'], ['mixed', '混合'], ['other', '其他'],
]

interface Props {
  filters: SiteFilters
  onChange: (next: SiteFilters) => void
  onReset: () => void
}

function toggle<T>(list: T[], value: T) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}

export function FilterPanel({ filters, onChange, onReset }: Props) {
  return (
    <section className="filter-panel" aria-label="筛选">
      <div className="search-wrap">
        <span className="search-icon">⌕</span>
        <input
          aria-label="搜索遗址"
          placeholder="搜索编号、名称、地点…"
          value={filters.query}
          onChange={(event) => onChange({ ...filters, query: event.target.value })}
        />
      </div>

      <FilterGroup title="学术区系">
        {regionOptions.map(([value, label]) => (
          <Chip key={value} active={filters.regions.includes(value)} onClick={() => onChange({ ...filters, regions: toggle(filters.regions, value) })}>{label}</Chip>
        ))}
      </FilterGroup>

      <FilterGroup title="国保批次">
        {batchOptions.map(([value, label]) => (
          <Chip key={String(value)} active={filters.batches.includes(value)} onClick={() => onChange({ ...filters, batches: toggle(filters.batches, value) })}>{label}</Chip>
        ))}
      </FilterGroup>

      <FilterGroup title="遗址形态">
        {typeOptions.map(([value, label]) => (
          <Chip key={value} active={filters.types.includes(value)} onClick={() => onChange({ ...filters, types: toggle(filters.types, value) })}>{label}</Chip>
        ))}
      </FilterGroup>

      <FilterGroup title="宗教属性">
        {religionOptions.map(([value, label]) => (
          <Chip key={value} active={filters.religions.includes(value)} onClick={() => onChange({ ...filters, religions: toggle(filters.religions, value) })}>{label}</Chip>
        ))}
      </FilterGroup>

      <label className="switch-row">
        <input
          type="checkbox"
          checked={filters.verifiedOnly}
          onChange={(event) => onChange({ ...filters, verifiedOnly: event.target.checked })}
        />
        <span>只看人工核验坐标</span>
      </label>

      <button className="reset-button" type="button" onClick={onReset}>重置筛选</button>
    </section>
  )
}

function FilterGroup({ title, children }: { title: string, children: React.ReactNode }) {
  return <div className="filter-group"><div className="filter-title">{title}</div><div className="chip-grid">{children}</div></div>
}

function Chip({ active, onClick, children }: { active: boolean, onClick: () => void, children: React.ReactNode }) {
  return <button type="button" className={`chip ${active ? 'active' : ''}`} onClick={onClick}>{children}</button>
}
