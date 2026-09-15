import { describe, expect, it } from 'vitest'
import styles from './styles.css?raw'

describe('viewport-bounded workspace layout', () => {
  it('keeps the desktop shell within the viewport and makes the site list scroll internally', () => {
    const appShellRule = styles.match(/\.app-shell\s*\{([^}]*)\}/)?.[1] ?? ''
    const siteListRule = styles.match(/\.site-list\s*\{([^}]*)\}/)?.[1] ?? ''

    expect(appShellRule).toMatch(/height:\s*100dvh/)
    expect(appShellRule).toMatch(/overflow:\s*hidden/)
    expect(styles).not.toContain('height: calc(100vh - 158px)')
    expect(styles).not.toContain('height: calc(100vh - 177px)')
    expect(siteListRule).toMatch(/flex:\s*1/)
    expect(siteListRule).toMatch(/min-height:\s*0/)
    expect(siteListRule).toMatch(/overflow:\s*auto/)
  })
})
