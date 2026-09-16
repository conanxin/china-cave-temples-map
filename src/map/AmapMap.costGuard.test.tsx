import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CaveTempleSite } from '../data/types'
import { AmapMap } from './AmapMap'

const harness = vi.hoisted(() => ({
  search: vi.fn(),
  mapConstructed: vi.fn(),
  respond: undefined as undefined | ((callback: (status: string, result: any) => void) => void),
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
        if (harness.respond) return harness.respond(callback)
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
  vi.stubEnv('VITE_AMAP_KEY', 'test-public-key')
  const view = render(<AmapMap sites={sites} selectedId={selectedId} onSelect={() => {}} />)
  await waitFor(() => expect(harness.mapConstructed).toHaveBeenCalledTimes(1))
  return view
}

afterEach(() => {
  localStorage.clear()
  delete window.AMap
  harness.search.mockClear()
  harness.mapConstructed.mockClear()
  harness.respond = undefined
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe('AMap candidate cost guard', () => {
  it('recovers after 20 seconds without a callback and ignores a late result during a new search', async () => {
    const callbacks: Array<(status: string, result: any) => void> = []
    harness.respond = (callback) => { callbacks.push(callback) }
    await renderReady([unresolvedSite(101, '测试甲')], 101)
    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: '检索当前遗址' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(19999) })
    expect(screen.getByRole('button', { name: '检索当前遗址' })).toBeDisabled()
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(screen.getByRole('status')).toHaveTextContent('超时')
    expect(screen.getByRole('button', { name: '检索当前遗址' })).toBeEnabled()
    expect(harness.search).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: '检索当前遗址' }))
    await act(async () => { callbacks[0]('complete', candidateResult()) })
    expect(localStorage.getItem(CACHE_KEY)).toBeNull()
    expect(screen.getByRole('button', { name: '检索当前遗址' })).toBeDisabled()
    await act(async () => { callbacks[1]('complete', candidateResult()) })
    expect(screen.getByRole('status')).toHaveTextContent('找到候选')
    expect(JSON.parse(localStorage.getItem(CACHE_KEY)!)[101].confidence).toBe('probable')
    expect(screen.getByRole('button', { name: '预览候选' })).toBeEnabled()
  })

  it.each([
    ['no_data', {}, '无合适结果'],
    ['complete', { poiList: { pois: [] } }, '无合适结果'],
    ['error', { info: 'SERVICE_NOT_AVAILABLE' }, '请求失败'],
  ])('reports %s without automatic retries', async (status, result, message) => {
    harness.respond = (callback) => { callback(status, result) }
    await renderReady([unresolvedSite(101, '测试甲')], 101)
    fireEvent.click(screen.getByRole('button', { name: '检索当前遗址' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(message))
    expect(screen.getByRole('button', { name: '检索当前遗址' })).toBeEnabled()
    expect(harness.search).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem(CACHE_KEY)).toBeNull()
  })

  it('reports a synchronous SDK exception and restores the controls', async () => {
    harness.respond = () => { throw new Error('SDK unavailable') }
    await renderReady([unresolvedSite(101, '测试甲')], 101)
    fireEvent.click(screen.getByRole('button', { name: '检索当前遗址' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('请求失败'))
    expect(screen.getByRole('button', { name: '检索当前遗址' })).toBeEnabled()
  })

  it('stops a hung batch at timeout without starting remaining sites', async () => {
    harness.respond = () => {}
    await renderReady([unresolvedSite(101, '测试甲'), unresolvedSite(102, '测试乙')], 101)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: '批量检索当前结果 2 项' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(30000) })
    expect(harness.search).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status')).toHaveTextContent('超时')
    expect(screen.getByRole('button', { name: '批量检索当前结果 2 项' })).toBeEnabled()
  })

  it('preserves an in-flight result after stop and never sends the next request', async () => {
    let finish!: (status: string, result: any) => void
    harness.respond = (callback) => { finish = callback }
    await renderReady([unresolvedSite(101, '测试甲'), unresolvedSite(102, '测试乙')], 101)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: '批量检索当前结果 2 项' }))
    fireEvent.click(screen.getByRole('button', { name: '停止检索' }))
    expect(screen.getByRole('status')).toHaveTextContent('等待当前请求结束')
    await act(async () => { finish('complete', candidateResult()); await vi.advanceTimersByTimeAsync(30000) })
    expect(harness.search).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status')).toHaveTextContent('已停止')
    expect(JSON.parse(localStorage.getItem(CACHE_KEY)!)[101]).toBeDefined()
    expect(screen.getByRole('button', { name: '批量检索当前结果 1 项' })).toBeEnabled()
  })

  it('ends a batch on service failure without retrying or sending remaining sites', async () => {
    harness.respond = (callback) => { callback('error', {}) }
    await renderReady([unresolvedSite(101, '测试甲'), unresolvedSite(102, '测试乙')], 101)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: '批量检索当前结果 2 项' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('批量已结束'))
    expect(screen.getByRole('status')).toHaveTextContent('请求失败')
    expect(harness.search).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: '批量检索当前结果 2 项' })).toBeEnabled()
  })

  it('eventually releases stopped controls even if the in-flight callback never arrives', async () => {
    harness.respond = () => {}
    await renderReady([unresolvedSite(101, '测试甲'), unresolvedSite(102, '测试乙')], 101)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: '批量检索当前结果 2 项' }))
    fireEvent.click(screen.getByRole('button', { name: '停止检索' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(20000) })
    expect(screen.getByRole('button', { name: '检索当前遗址' })).toBeEnabled()
    expect(screen.getByRole('status')).toHaveTextContent('已停止')
    expect(screen.getByRole('status')).toHaveTextContent('超时')
    expect(harness.search).toHaveBeenCalledTimes(1)
  })

  it('does not cache a response or continue a batch after the map unmounts', async () => {
    let finish!: (status: string, result: any) => void
    harness.respond = (callback) => { finish = callback }
    const view = await renderReady([unresolvedSite(101, '测试甲'), unresolvedSite(102, '测试乙')], 101)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: '批量检索当前结果 2 项' }))
    view.unmount()
    await act(async () => { finish('complete', candidateResult()); await vi.advanceTimersByTimeAsync(30000) })
    expect(localStorage.getItem(CACHE_KEY)).toBeNull()
    expect(harness.search).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('waits 450ms after a delayed response before searching the next site', async () => {
    let finish!: (status: string, result: any) => void
    harness.respond = (callback) => { finish = callback }
    await renderReady([unresolvedSite(101, '测试甲'), unresolvedSite(102, '测试乙')], 101)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: '批量检索当前结果 2 项' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); finish('no_data', {}) })
    await act(async () => { await vi.advanceTimersByTimeAsync(449) })
    expect(harness.search).toHaveBeenCalledTimes(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(harness.search).toHaveBeenCalledTimes(2)
    await act(async () => { finish('no_data', {}) })
  })
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

  it('keeps selected-site lookup available when the selected site is outside the current filtered results', async () => {
    const selectedSite = unresolvedSite(101, '测试甲')
    vi.stubEnv('VITE_AMAP_KEY', 'test-public-key')
    const SelectedSiteAwareMap = AmapMap as any
    render(<SelectedSiteAwareMap sites={[]} selectedId={101} selectedSite={selectedSite} onSelect={() => {}} />)
    await waitFor(() => expect(harness.mapConstructed).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: '检索当前遗址' }))

    await waitFor(() => expect(harness.search).toHaveBeenCalledTimes(1))
    expect(harness.search).toHaveBeenCalledWith('测试甲 测试市')
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

  it('stops a running batch before another request when the current filtered sites change', async () => {
    const sites = [
      unresolvedSite(101, '测试甲'),
      unresolvedSite(102, '测试乙'),
      unresolvedSite(103, '测试丙'),
    ]
    const view = await renderReady(sites, 101)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.useFakeTimers()

    fireEvent.click(screen.getByRole('button', { name: '批量检索当前结果 3 项' }))
    await act(async () => { await Promise.resolve() })
    expect(harness.search).toHaveBeenCalledTimes(1)

    view.rerender(<AmapMap sites={[sites[0]]} selectedId={101} onSelect={() => {}} />)
    await act(async () => {
      await Promise.resolve()
      vi.advanceTimersByTime(2000)
      await Promise.resolve()
    })

    expect(harness.search).toHaveBeenCalledTimes(1)
  })
})

function candidateResult() {
  return { poiList: { pois: [{ name: '测试甲', location: { lng: 110, lat: 35 }, pname: '测试省', cityname: '测试市', adname: '测试县', address: '测试县' }] } }
}
