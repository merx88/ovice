import { describe, expect, it } from 'vitest'
import { tokens } from './tokens'

describe('tokens', () => {
  it('defines exactly the agreed color keys', () => {
    expect(Object.keys(tokens).sort()).toEqual(
      [
        'badgeGreen',
        'badgeGrey',
        'badgeOrange',
        'badgeRed',
        'badgeYellow',
        'bg',
        'black',
        'bookBlue',
        'bookOlive',
        'bookRed',
        'bubbleBottom',
        'bubbleTop',
        'chrome',
        'cream',
        'danger',
        'floor',
        'laptopGray',
        'mint',
        'navy',
        'orange',
        'pink',
        'plantGreen',
        'skyblue',
        'uiBlack',
        'uiButton',
        'uiChipEdge',
        'uiDark',
        'uiField',
        'uiFocus',
        'uiGrey',
        'uiOrange',
        'uiSend',
        'uiSilver',
        'white',
        'yellow',
      ].sort(),
    )
  })

  it.each(Object.entries(tokens))('%s is a #RRGGBB color', (_key, value) => {
    expect(value).toMatch(/^#[0-9A-F]{6}$/i)
  })

  it('gives the status symbols the colours of the pictures they were modelled on', () => {
    expect(tokens.badgeRed).toBe('#E93A3C')
    expect(tokens.badgeGrey).toBe('#7A7A7A')
    expect(tokens.badgeOrange).toBe('#D98C32')
    expect(tokens.badgeYellow).toBe('#E0CD74')
    expect(tokens.badgeGreen).toBe('#CDDC61')
  })

  it('hands over a file in the orange of the desk chair', () => {
    expect(tokens.orange).toBe('#F5570A')
  })
})
