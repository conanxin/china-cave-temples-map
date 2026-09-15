import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CaveTempleSite } from '../data/types'
import { AmapMap } from './AmapMap'

const harness = vi.hoisted(() => ({
  search: vi.fn(),
  mapConstructed: vi.fn(),
}))

vi.mock('./amapLoader', () => ({
  loadAmap: vi.fn(async () => {
    class FakeMap {
      constructor() { harness.mapConstructed() }
      getZoom() { return 4 }
      setZoomAndCenter() {}
      setFitView() {}
    }

    class FakePlaceSearch {
      search(query: string, callback: (status: string, result: any) => void) {
        harness.search(query)
        const name = String(query).split(' ')[0]
        callback('complete', {
          poiList: {
            pois: [{
              name,
              location: { lng: 110, lat: 35 },
              pname: '测试省',
              cityname: '测试市',
              adname: '测试县',
              address: '测试县',
            }],
          },
        })
      }
    }

    const AMap = {
      Map: FakeMap,
      PlaceSearch: FakePlaceSearch,
    }
    window.AMap = AMap
    return AMap
  }),
}))

const CACHE_KEY = 'china-cave-temples-amap-candidates-v1'

function unresolvedSite(id: number, name: string): CaveTempleSite {
  return {
    id,
    code: String(id).padStart(2, '0'),
    name,
    aliases: [],
    regionGroup: 'north',
    province: '测试省',
    prefecture: '测试市',
    county: '测试县',
    heritageBatch: 1,
    religion: 'buddhist',
    siteType: 'cave-temple',
    mainPeriods: [],
    siteExtent: 'single',
    coordinateConfidence: 'unresolved',
    amapQuery: `${name} 测试市`,
  }
}

async function renderReady(sites: CaveTempleSite[], selectedId?: number) {
  render(<AmapMap sites={sites} selectedId={selectedId} onSelect={() => {}} />)
  await waitFor(() => expect(harness.mapConstructed).toHaveBeenCalledTimes(1))
}

afterEach(() => {
  localStorage.clear()
  delete window.AMap
  harness.search.mockClear()
  harness.mapConstructed.mockClear()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('AMap candidate cost guard', () => {
  it('does not automatically search unresolved sites after the map becomes ready', async () => {
    const sites = [unresolvedSite(101, '测试甲'), unresolvedSite(102, '测试乙')]
    await renderReady(sites, 101)

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })

    expect(harness.search).not.toHaveBeenCalled()
  })

  it('searches only the selected unresolved site when the single-site action is used', async () => {
    const sites = [unresolvedSite(101, '测试甲'), unresolvedSite(102, '测试乙')]
    await renderReady(sites, 101)

    fireEvent.click(screen.getByRole('button', { name: '检索当前遗址' }))

    await waitFor(() => expect(harness.search).toHaveBeenCalledTimes(1))
    expect(harness.search).toHaveBeenCalledWith('测试甲 测试市')
    expect(screen.getByText(/候选缓存 1/)).toBeInTheDocument()
  })

  it('shows the remaining batch call count and skips candidates already cached locally', async () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      101: {
        siteId: 101,
        lng: 110,
        lat: 35,
        confidence: 'probable',
        source: 'cached test candidate',
      },
    }))

    const sites = [unresolvedSite(101, '测试甲'), unresolvedSite(102, '测试乙')]
    await renderReady(sites, 101)

    expect(screen.getByRole('button', { name: '批量检索当前结果 1 项' })).toBeInTheDocument()
  })

  it('confirms the estimated calls, throttles batch search to at least 450ms, and can stop before another request', async () => {
    const sites = [
      unresolvedSite(101, '测试甲'),
      unresolvedSite(102, '测试乙'),
      unresolvedSite(103, '测试丙'),
    ]
    await renderReady(sites, 101)
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.useFakeTimers()

    fireEvent.click(screen.getByRole('button', { name: '批量检索当前结果 3 项' }))
    await act(async () => { await Promise.resolve() })

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('预计调用高德搜索 3 次'))
    expect(harness.search).toHaveBeenCalledTimes(1)

    await act(async () => {
      vi.advanceTimersByTime(449)
      await Promise.resolve()
    })
    expect(harness.search).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: '停止检索' }))
    await act(async () => {
      vi.advanceTimersByTime(2000)
      await Promise.resolve()
    })
    expect(harness.search).toHaveBeenCalledTimes(1)
  })
})
