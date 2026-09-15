export {}

declare global {
  interface Window {
    AMap?: any
    _AMapSecurityConfig?: {
      serviceHost?: string
    }
  }
}
