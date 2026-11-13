import { describe, expect, it } from 'vitest'
import { tokens } from '../theme/tokens'
import { chrome, glossy, matte, silver } from './materials'

describe('materials', () => {
  it('hand out one shared material per finish and color', () => {
    expect(glossy(tokens.orange)).toBe(glossy(tokens.orange))
    expect(matte(tokens.orange)).toBe(matte(tokens.orange))
    expect(glossy(tokens.orange)).not.toBe(glossy(tokens.black))
    expect(glossy(tokens.orange)).not.toBe(matte(tokens.orange))
  })

  it('give each material the color it was asked for', () => {
    expect(`#${glossy(tokens.orange).color.getHexString()}`).toBe(tokens.orange.toLowerCase())
    expect(`#${matte(tokens.plantGreen).color.getHexString()}`).toBe(tokens.plantGreen.toLowerCase())
  })

  it('go from the bookshelf frame, the shiniest, to matte, each finish softer than the one before', () => {
    const plastic = glossy(tokens.cream)
    const flat = matte(tokens.cream)
    expect(chrome.roughness).toBeLessThan(silver.roughness)
    expect(silver.roughness).toBeLessThan(plastic.roughness)
    expect(plastic.roughness).toBeLessThan(flat.roughness)
    expect(flat.roughness).toBeLessThan(1)
  })

  it('keep metal metal and plastic plastic', () => {
    expect(chrome.metalness).toBe(1)
    expect(silver.metalness).toBe(1)
    expect(glossy(tokens.cream).metalness).toBe(0)
    expect(matte(tokens.cream).metalness).toBe(0)
  })

  it('coat only the glossy finish, and softly: its coat is no sharper than the frame', () => {
    const plastic = glossy(tokens.cream)
    expect(plastic.clearcoat).toBeGreaterThan(0)
    expect(plastic.clearcoat).toBeLessThanOrEqual(1)
    expect(plastic.clearcoatRoughness).toBeGreaterThanOrEqual(chrome.roughness)
    expect('clearcoat' in matte(tokens.cream)).toBe(false)
  })
})
