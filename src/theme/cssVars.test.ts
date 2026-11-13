import { describe, expect, it } from 'vitest'
import { applyCssVars, cssVarName } from './cssVars'
import { tokens } from './tokens'

describe('cssVarName', () => {
  it('names a token the way a stylesheet refers to it', () => {
    expect(cssVarName('bg')).toBe('--c-bg')
    expect(cssVarName('uiOrange')).toBe('--c-ui-orange')
    expect(cssVarName('bubbleBottom')).toBe('--c-bubble-bottom')
  })
})

describe('applyCssVars', () => {
  it('sets every colour token as a custom property on the element given', () => {
    const root = document.createElement('div')
    applyCssVars(root)
    for (const [key, value] of Object.entries(tokens)) {
      expect(root.style.getPropertyValue(cssVarName(key))).toBe(value)
    }
  })

  it('sets them on the page itself by default', () => {
    applyCssVars()
    expect(document.documentElement.style.getPropertyValue('--c-ui-dark')).toBe(tokens.uiDark)
  })
})
