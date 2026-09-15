import { describe, expect, it } from 'vitest'
import baseStyles from './styles.css?raw'
import viewportStyles from './viewport-layout.css?raw'

const styles = `${baseStyles}\n${viewportStyles}`

describe('viewport-bounded workspace layout', () => {
  it('keeps the desktop shell within the viewport and makes the site list scroll internally', () => {
    const appShellRules = [...styles.matchAll(/\.app-shell\s*\{([^}]*)\}/g)].map((match) => match[1]).join('\n')
    const siteListRules = [...styles.matchAll(/\.site-list\s*\{([^}]*)\}/g)].map((match) => match[1]).join('\n')

    expect(appShellRules).toMatch(/height:\s*100dvh/)
    expect(appShellRules).toMatch(/overflow:\s*hidden/)
    expect(viewportStyles).toMatch(/\.workspace\s*\{[^}]*height:\s*auto/s)
    expect(siteListRules).toMatch(/flex:\s*1/)
    expect(siteListRules).toMatch(/min-height:\s*0/)
    expect(siteListRules).toMatch(/overflow:\s*auto/)
  })
})
