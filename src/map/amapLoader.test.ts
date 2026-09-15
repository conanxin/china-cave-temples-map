import { afterEach, describe, expect, it, vi } from 'vitest'

async function freshLoader() {
  vi.resetModules()
  return import('./amapLoader')
}

afterEach(() => {
  document.querySelectorAll('script[src*="webapi.amap.com/maps"]').forEach((node) => node.remove())
  delete window.AMap
  delete window._AMapSecurityConfig
  vi.restoreAllMocks()
})

describe('AMap loader', () => {
  it('refuses to load without a configured key', async () => {
    const { loadAmap } = await freshLoader()
    await expect(loadAmap('')).rejects.toThrow('AMAP_KEY_MISSING')
  })

  it('configures a same-origin serviceHost without exposing a securityJsCode', async () => {
    const { loadAmap } = await freshLoader()
    const pending = loadAmap('public-web-key')
    const script = document.querySelector<HTMLScriptElement>('script[src*="webapi.amap.com/maps"]')

    expect(script).not.toBeNull()
    expect(window._AMapSecurityConfig).toEqual({
      serviceHost: `${window.location.origin}/_AMapService`,
    })
    expect('securityJsCode' in (window._AMapSecurityConfig ?? {})).toBe(false)
    expect(script!.src).toContain('key=public-web-key')
    expect(script!.src).toContain('plugin=AMap.PlaceSearch')

    window.AMap = { Map: class {} }
    script!.onload?.(new Event('load'))
    await expect(pending).resolves.toBe(window.AMap)
  })
})
