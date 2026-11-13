import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
})

describe('PAGE_LOADED_AT', () => {
  it("is what the wall clock read when the page's script started, read once", async () => {
    vi.resetModules()
    const wallClock = vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000)
    // Not the page's time origin, which is counted on another clock.
    vi.spyOn(performance, 'timeOrigin', 'get').mockReturnValue(1_700_000_000_000)

    const atStart = (await import('./env')).PAGE_LOADED_AT
    wallClock.mockReturnValue(1_800_000_090_000)
    const later = (await import('./env')).PAGE_LOADED_AT

    expect(atStart).toBe(1_800_000_000_000)
    expect(later).toBe(1_800_000_000_000)
  })
})
