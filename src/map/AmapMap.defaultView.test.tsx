import { render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CaveTempleSite } from '../data/types'
import { AmapMap } from './AmapMap'

const harness = vi.hoisted(() => ({
  mapOptions: vi.fn(),
  zoomAndCenter: vi.fn(),
}))

vi.mock('./amapLoader', () => ({
  loadAmap: vi.fn(async () => {
    class FakeMap {
      constructor(_container: unknown, options: unknown) { harness.mapOptions(options) }
      getZoom() { return 4.3 }
      setZoomAndCenter(...args: unknown[]) { harness.zoomAndCenter(...args) }
      setFitView() {}
    }

    class FakeMarker {
      on() {}
      setMap() {}
    }

    class FakePixel {
      constructor(_x: number, _y: number) {}
    }

    const AMap = { Map: FakeMap, Marker: FakeMarker, Pixel: FakePixel }
    window.AMap = AMap
    return AMap
  }),
}))

const verifiedSite: CaveTempleSite = {
  id: 1,
  code: '01',
  name: '云冈石窟',
  aliases: [],
  regionGroup: 'north',
  province: '山西省',
  prefecture: '大同市',
  county: '云冈区',
  heritageBatch: 1,
  religion: 'buddhist',
  siteType: 'cave-temple',
  mainPeriods: [],
  siteExtent: 'single',
  coordinateConfidence: 'verified',
  lng: 113.121,
  lat: 40.109,
  amapQuery: '云冈石窟 大同市',
}

afterEach(() => {
  delete window.AMap
  harness.mapOptions.mockClear()
  harness.zoomAndCenter.mockClear()
  vi.unstubAllEnvs()
})

describe('AMap default China view', () => {
  it('keeps the national view on first load even when the detail panel has a default selected site', async () => {
    vi.stubEnv('VITE_AMAP_KEY', 'test-public-key')
    const view = render(<AmapMap sites={[verifiedSite]} selectedId={1} onSelect={() => {}} />)

    await waitFor(() => expect(harness.mapOptions).toHaveBeenCalledTimes(1))
    expect(harness.mapOptions).toHaveBeenCalledWith(expect.objectContaining({
      center: [105.5, 35.8],
      zoom: 4.3,
    }))
    expect(harness.zoomAndCenter).not.toHaveBeenCalled()

    view.rerender(<AmapMap sites={[verifiedSite]} selectedId={1} focusId={1} onSelect={() => {}} />)
    await waitFor(() => expect(harness.zoomAndCenter).toHaveBeenCalledTimes(1))
    expect(harness.zoomAndCenter).toHaveBeenCalledWith(8, [verifiedSite.lng, verifiedSite.lat], false, 350)
  })
})
