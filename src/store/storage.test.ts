import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { safeLoad, safeSave } from './storage'

const KEY = 'ovice.test.v1'

function failingStorage(): void {
  const fail = () => {
    throw new DOMException('denied', 'SecurityError')
  }
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(fail)
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(fail)
}

describe('storage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('loads back what was saved', () => {
    safeSave(KEY, { a: 1, list: ['x'] })
    expect(safeLoad(KEY, null)).toEqual({ a: 1, list: ['x'] })
  })

  it('stores the value as JSON under the given key', () => {
    safeSave(KEY, { a: 1 })
    expect(localStorage.getItem(KEY)).toBe('{"a":1}')
  })

  it('returns the fallback when nothing is stored', () => {
    expect(safeLoad(KEY, 'fallback')).toBe('fallback')
  })

  it('returns the fallback when the stored JSON is broken', () => {
    localStorage.setItem(KEY, '{"a":')
    expect(safeLoad(KEY, 'fallback')).toBe('fallback')
  })

  it('returns the fallback when reading from localStorage throws', () => {
    failingStorage()
    expect(safeLoad(KEY, 'fallback')).toBe('fallback')
  })

  it('does not throw when writing to localStorage throws', () => {
    failingStorage()
    expect(() => safeSave(KEY, { a: 1 })).not.toThrow()
  })

  it('survives localStorage itself being inaccessible', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(safeLoad(KEY, 'fallback')).toBe('fallback')
    expect(() => safeSave(KEY, { a: 1 })).not.toThrow()
  })

  it('does not throw when the value cannot be serialized', () => {
    const circular: { self?: unknown } = {}
    circular.self = circular
    expect(() => safeSave(KEY, circular)).not.toThrow()
    expect(localStorage.getItem(KEY)).toBeNull()
  })
})
