import { describe, expect, it } from 'vitest'
import { sites } from './sites'

describe('canonical exhibition dataset', () => {
  it('contains exactly 112 entries', () => {
    expect(sites).toHaveLength(112)
  })

  it('has continuous ids and zero-padded unique codes', () => {
    expect(sites.map((site) => site.id)).toEqual(Array.from({ length: 112 }, (_, index) => index + 1))
    expect(new Set(sites.map((site) => site.code)).size).toBe(112)
    expect(sites[0].code).toBe('01')
    expect(sites.at(-1)?.code).toBe('112')
  })

  it('preserves key names visible on the exhibition wall', () => {
    expect(sites[0].name).toBe('云冈石窟')
    expect(sites[46].name).toBe('阿尔寨石窟')
    expect(sites[82].name).toBe('睏佛寺摩崖造像')
    expect(sites[111].name).toBe('童子寺石窟')
  })
})
