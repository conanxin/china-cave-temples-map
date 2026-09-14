import { describe, expect, it } from 'vitest'
import { loadAmap } from './amapLoader'

describe('AMap loader', () => {
  it('refuses to load without a configured key', async () => {
    await expect(loadAmap('', '')).rejects.toThrow('AMAP_KEY_MISSING')
  })
})
