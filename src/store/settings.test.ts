import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSettingsStore, useSettings } from './settings'

const KEY = 'ovice.settings.v1'

function stored(): unknown {
  const raw = localStorage.getItem(KEY)
  return raw === null ? null : JSON.parse(raw)
}

function stubReducedMotion(matches: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)' && matches,
  }))
}

describe('settings store', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  describe('defaults', () => {
    it('starts in prototype mode with parallax on', () => {
      const { mode, parallax } = createSettingsStore().getState()
      expect(mode).toBe('prototype')
      expect(parallax).toBe(true)
    })

    it('leaves reduceMotion off when matchMedia is unavailable', () => {
      vi.stubGlobal('matchMedia', undefined)
      expect(createSettingsStore().getState().reduceMotion).toBe(false)
    })

    it('leaves reduceMotion off when matchMedia throws', () => {
      vi.stubGlobal('matchMedia', () => {
        throw new Error('unsupported')
      })
      expect(createSettingsStore().getState().reduceMotion).toBe(false)
    })

    it('takes reduceMotion from the OS reduced-motion preference', () => {
      stubReducedMotion(true)
      expect(createSettingsStore().getState().reduceMotion).toBe(true)

      stubReducedMotion(false)
      expect(createSettingsStore().getState().reduceMotion).toBe(false)
    })
  })

  describe('setMode', () => {
    it("refuses 'real' and stays in prototype mode", () => {
      const store = createSettingsStore()
      expect(store.getState().setMode('real')).toEqual({ ok: false })
      expect(store.getState().mode).toBe('prototype')
    })

    it("accepts 'prototype'", () => {
      const store = createSettingsStore()
      expect(store.getState().setMode('prototype')).toEqual({ ok: true })
      expect(store.getState().mode).toBe('prototype')
    })
  })

  describe('persistence', () => {
    it('saves a parallax change and restores it in a new store', () => {
      createSettingsStore().getState().setParallax(false)

      expect(stored()).toMatchObject({ parallax: false })
      expect(createSettingsStore().getState().parallax).toBe(false)
    })

    it('saves a reduceMotion change and restores it in a new store', () => {
      createSettingsStore().getState().setReduceMotion(true)

      expect(stored()).toMatchObject({ reduceMotion: true })
      expect(createSettingsStore().getState().reduceMotion).toBe(true)
    })

    it('lets a stored reduceMotion override the OS preference', () => {
      stubReducedMotion(true)
      createSettingsStore().getState().setReduceMotion(false)

      expect(createSettingsStore().getState().reduceMotion).toBe(false)
    })

    it('keeps following the OS preference until reduceMotion is chosen', () => {
      stubReducedMotion(false)
      createSettingsStore().getState().setParallax(false)

      stubReducedMotion(true)
      expect(createSettingsStore().getState().reduceMotion).toBe(true)
    })

    it('treats choosing the value the OS already has as a choice', () => {
      stubReducedMotion(true)
      createSettingsStore().getState().setReduceMotion(true)

      stubReducedMotion(false)
      expect(createSettingsStore().getState().reduceMotion).toBe(true)
    })

    it('keeps a chosen reduceMotion when other settings change later', () => {
      stubReducedMotion(true)
      createSettingsStore().getState().setReduceMotion(false)
      createSettingsStore().getState().setParallax(false)

      expect(createSettingsStore().getState().reduceMotion).toBe(false)
    })

    it('stores only setting values, never functions', () => {
      const store = createSettingsStore()
      store.getState().setParallax(false)
      store.getState().setReduceMotion(true)

      expect(stored()).toEqual({ mode: 'prototype', parallax: false, reduceMotion: true })
    })

    it('does not write anything until a setting changes', () => {
      createSettingsStore()
      expect(stored()).toBeNull()
    })

    it("ignores a stored 'real' mode", () => {
      localStorage.setItem(KEY, JSON.stringify({ mode: 'real', parallax: false }))
      const state = createSettingsStore().getState()
      expect(state.mode).toBe('prototype')
      expect(state.parallax).toBe(false)
    })

    it.each([
      ['broken JSON', '{"parallax":'],
      ['null', 'null'],
      ['a string', '"nope"'],
      ['an array', '[false]'],
      ['wrongly typed fields', '{"mode":7,"parallax":"no","reduceMotion":"yes"}'],
    ])('falls back to defaults when the stored value is %s', (_label, raw) => {
      localStorage.setItem(KEY, raw)
      const state = createSettingsStore().getState()
      expect(state.mode).toBe('prototype')
      expect(state.parallax).toBe(true)
      expect(state.reduceMotion).toBe(false)
    })

    it('keeps working in memory when localStorage throws', () => {
      const fail = () => {
        throw new DOMException('denied', 'SecurityError')
      }
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(fail)
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(fail)

      const store = createSettingsStore()
      expect(() => store.getState().setParallax(false)).not.toThrow()
      expect(store.getState().parallax).toBe(false)
    })
  })

  describe('default instance', () => {
    it('is usable outside React', () => {
      const seen: boolean[] = []
      const unsubscribe = useSettings.subscribe((state) => seen.push(state.parallax))
      const initial = useSettings.getState().parallax

      useSettings.getState().setParallax(!initial)
      unsubscribe()
      useSettings.getState().setParallax(initial)

      expect(seen).toEqual([!initial])
    })

    it('is usable as a React hook with a selector', () => {
      const { result } = renderHook(() => useSettings((state) => state.parallax))
      const initial = result.current

      act(() => useSettings.getState().setParallax(!initial))
      expect(result.current).toBe(!initial)

      act(() => useSettings.getState().setParallax(initial))
    })
  })
})
