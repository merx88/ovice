import { afterEach, describe, expect, it } from 'vitest'
import { fastMode } from '../app/env'
import { tokens } from './tokens'

describe('tokens', () => {
  it('defines exactly the agreed color keys', () => {
    expect(Object.keys(tokens).sort()).toEqual(
      [
        'bg',
        'black',
        'bookBlue',
        'bookOlive',
        'bookRed',
        'chrome',
        'cream',
        'danger',
        'floor',
        'folderBlue',
        'laptopGray',
        'mint',
        'navy',
        'orange',
        'pink',
        'plantGreen',
        'skyblue',
        'white',
        'yellow',
      ].sort(),
    )
  })

  it.each(Object.entries(tokens))('%s is a #RRGGBB color', (_key, value) => {
    expect(value).toMatch(/^#[0-9A-F]{6}$/i)
  })
})

describe('fastMode', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/')
  })

  it('is true when the URL has ?fast=1', () => {
    window.history.replaceState({}, '', '/?fast=1')
    expect(fastMode()).toBe(true)
  })

  it('is true when fast=1 is one of several query parameters', () => {
    window.history.replaceState({}, '', '/?mode=mock&fast=1')
    expect(fastMode()).toBe(true)
  })

  it('is false without a query string', () => {
    window.history.replaceState({}, '', '/')
    expect(fastMode()).toBe(false)
  })

  it('is false for other fast values', () => {
    window.history.replaceState({}, '', '/?fast=0')
    expect(fastMode()).toBe(false)
  })
})
