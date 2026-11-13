import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createChatActivityStore, useChatActivity } from './chatActivity'

/** The time `performance.now()` reports, in ms. */
let clock = 0

beforeEach(() => {
  clock = 5_000
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('chat activity', () => {
  it('starts with a chat that has never been used', () => {
    expect(createChatActivityStore().getState().at).toBe(-Infinity)
  })

  it('notes when the chat was used, on the clock the character goes by', () => {
    const store = createChatActivityStore()
    store.getState().report()
    expect(store.getState().at).toBe(5_000)
  })

  it('changes with every report: two reports give two changes', () => {
    const store = createChatActivityStore()
    const seen: number[] = []
    store.subscribe((state, previous) => {
      if (state.at !== previous.at) seen.push(state.at)
    })

    store.getState().report()
    clock = 5_040
    store.getState().report()

    expect(seen).toEqual([5_000, 5_040])
  })

  it('gives each store its own record, and the page one to share', () => {
    const first = createChatActivityStore()
    const second = createChatActivityStore()
    first.getState().report()
    expect(second.getState().at).toBe(-Infinity)
    expect(useChatActivity.getState().at).toBe(-Infinity)
    expect(typeof useChatActivity.getState().report).toBe('function')
  })
})
