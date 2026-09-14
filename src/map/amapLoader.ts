let promise: Promise<any> | undefined

export function loadAmap(key: string, securityCode: string) {
  if (!key || key === 'AMAP_KEY') return Promise.reject(new Error('AMAP_KEY_MISSING'))
  if (typeof window === 'undefined') return Promise.reject(new Error('AMAP_BROWSER_ONLY'))
  if (window.AMap) return Promise.resolve(window.AMap)
  if (promise) return promise

  window._AMapSecurityConfig = securityCode && securityCode !== 'AMAP_SECURITY_CODE'
    ? { securityJsCode: securityCode }
    : undefined

  promise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}&plugin=AMap.PlaceSearch`
    script.async = true
    script.onload = () => window.AMap ? resolve(window.AMap) : reject(new Error('AMAP_GLOBAL_MISSING'))
    script.onerror = () => reject(new Error('AMAP_SCRIPT_LOAD_FAILED'))
    document.head.appendChild(script)
  })
  return promise
}
