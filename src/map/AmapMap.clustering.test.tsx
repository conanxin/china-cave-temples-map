import { act, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CaveTempleSite } from '../data/types'
import { AmapMap } from './AmapMap'

interface MarkerState {
  content: HTMLElement
  map: unknown
}

const harness = vi.hoisted(() => ({
  markers: [] as MarkerState[],
  listeners: {} as Record<string, (() => void) | undefined>,
  map: undefined as any,
}))

vi.mock('./amapLoader', () => ({
  loadAmap: vi.fn(async () => {
    class FakeMap {
      zoom = 4.1
      constructor(_container: unknown, _options: unknown) { harness.map = this }
      getZoom() { return this.zoom }
      setZoomAndCenter() {}
      setFitView() {}
      on(event: string, handler: () => void) { harness.listeners[event] = handler }
      off(event: string, handler: () => void) {
        if (harness.listeners[event] === handler) harness.listeners[event] = undefined
      }
    }

    class FakeMarker {
      private state: MarkerState
      constructor(options: { content: HTMLElement }) {
        this.state = { content: options.content, map: null }
        harness.markers.push(this.state)
      }
      on() {}
      setMap(map: unknown) { this.state.map = map }
    }

    class FakePixel {
      constructor(_x: number, _y: number) {}
    }

    const AMap = { Map: FakeMap, Marker: FakeMarker, Pixel: FakePixel }
    window.AMap = AMap
    return AMap
  }),
}))

function site(id: number, code: string, lng: number, lat: number): CaveTempleSite {
  return {
    id,
    code,
    name: `遗址${code}`,
    aliases: [],
    regionGroup: 'north',
    province: '山西省',
    prefecture: '大同市',
    county: '测试区',
    heritageBatch: 1,
    religion: 'buddhist',
    siteType: 'cave-temple',
    mainPeriods: [],
    siteExtent: 'single',
    coordinateConfidence: 'verified',
    lng,
    lat,
    amapQuery: `遗址${code}`,
  }
}

function activeContents() {
  return harness.markers
    .filter((marker) => marker.map != null)
    .map((marker) => marker.content)
}

afterEach(() => {
  delete window.AMap
  harness.markers.length = 0
  harness.listeners = {}
  harness.map = undefined
  vi.unstubAllEnvs()
})

describe('AMap marker clustering', () => {
  it('renders cluster counts with a distinct 处 suffix while preserving the selected site code', async () => {
    vi.stubEnv('VITE_AMAP_KEY', 'test-public-key')
    render(<AmapMap
      sites={[
        site(1, '01', 112.8, 34.7),
        site(2, '02', 113.1, 34.9),
        site(3, '03', 113.2, 35.0),
      ]}
      selectedId={1}
      onSelect={() => {}}
    />)

    await waitFor(() => expect(activeContents()).toHaveLength(2))
    const contents = activeContents()
    expect(contents.some((element) => element.classList.contains('amap-site-marker') && element.textContent === '01')).toBe(true)
    expect(contents.some((element) => element.classList.contains('amap-site-cluster') && element.textContent === '2处')).toBe(true)
    expect(contents.some((element) => element.classList.contains('amap-site-cluster') && element.textContent === '2')).toBe(false)
  })

  it('re-renders clusters as individual markers after zooming to detail level', async () => {
    vi.stubEnv('VITE_AMAP_KEY', 'test-public-key')
    render(<AmapMap
      sites={[
        site(1, '01', 112.8, 34.7),
        site(2, '02', 113.1, 34.9),
        site(3, '03', 113.2, 35.0),
      ]}
      selectedId={1}
      onSelect={() => {}}
    />)

    await waitFor(() => expect(activeContents()).toHaveLength(2))
    expect(harness.listeners.zoomend).toBeTypeOf('function')

    act(() => {
      harness.map.zoom = 7
      harness.listeners.zoomend?.()
    })

    await waitFor(() => expect(activeContents()).toHaveLength(3))
    expect(activeContents().map((element) => element.textContent).sort()).toEqual(['01', '02', '03'])
    expect(activeContents().some((element) => element.classList.contains('amap-site-cluster'))).toBe(false)
  })
})
