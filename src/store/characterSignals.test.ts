import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MESSAGES } from '../agent/messages'
import { bubbleAnchorAt } from '../character/bubble'
import { SEAT_LIFT } from '../character/clips/shared'
import { SEAT_GROUND_POS } from '../scene/layout'
import {
  createCharacterSignalsStore,
  useBadge,
  useBubble,
  useBubbleAnchor,
  useCharacterSignals,
  useCharState,
  type CharacterSignals,
} from './characterSignals'

const HANDING_OVER: CharacterSignals = { bubble: [...MESSAGES.done], badge: 'done', charState: 'handingFile' }

describe('character signals', () => {
  it('start with a character that rests and says nothing', () => {
    const { bubble, badge, charState } = createCharacterSignalsStore().getState()
    expect({ bubble, badge, charState }).toEqual({ bubble: [], badge: 'idle', charState: 'resting' })
  })

  it('start with the bubble anchored beside the seated character', () => {
    const { bubbleAnchor } = createCharacterSignalsStore().getState()
    expect(bubbleAnchor.current).toEqual(bubbleAnchorAt(SEAT_GROUND_POS, SEAT_LIFT))
  })

  it('take what is published', () => {
    const store = createCharacterSignalsStore()
    store.getState().publish(HANDING_OVER)
    const { bubble, badge, charState } = store.getState()
    expect({ bubble, badge, charState }).toEqual(HANDING_OVER)
  })

  it('tell subscribers nothing when the same values are published again', () => {
    const store = createCharacterSignalsStore()
    store.getState().publish(HANDING_OVER)
    const listener = vi.fn()
    store.subscribe(listener)

    store.getState().publish(HANDING_OVER)
    // The same lines in a list of their own are still the same bubble.
    store.getState().publish({ ...HANDING_OVER, bubble: [...MESSAGES.done] })

    expect(listener).not.toHaveBeenCalled()
  })

  it('keep the bubble they hold when the same lines are published in another list', () => {
    const store = createCharacterSignalsStore()
    store.getState().publish(HANDING_OVER)
    const held = store.getState().bubble

    store.getState().publish({ ...HANDING_OVER, badge: 'idle', bubble: [...MESSAGES.done] })

    expect(store.getState().badge).toBe('idle')
    expect(store.getState().bubble).toBe(held)
  })

  it.each<[string, Partial<CharacterSignals>]>([
    ['a line changes', { bubble: [MESSAGES.done[0], 'Something else.'] }],
    ['a line is added', { bubble: [...MESSAGES.done, 'One more.'] }],
    ['the lines go away', { bubble: [] }],
    ['the badge changes', { badge: 'error' }],
    ['the state changes', { charState: 'returning' }],
  ])('tell subscribers once when %s', (_, change) => {
    const store = createCharacterSignalsStore()
    store.getState().publish(HANDING_OVER)
    const listener = vi.fn()
    store.subscribe(listener)

    store.getState().publish({ ...HANDING_OVER, ...change })

    expect(listener).toHaveBeenCalledTimes(1)
    const { bubble, badge, charState } = store.getState()
    expect({ bubble, badge, charState }).toEqual({ ...HANDING_OVER, ...change })
  })

  it('keep one anchor for good, which can move without anyone being told', () => {
    const store = createCharacterSignalsStore()
    const { bubbleAnchor } = store.getState()
    const listener = vi.fn()
    store.subscribe(listener)

    bubbleAnchor.current[0] = 3
    store.getState().publish(HANDING_OVER)

    expect(store.getState().bubbleAnchor).toBe(bubbleAnchor)
    expect(store.getState().bubbleAnchor.current[0]).toBe(3)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('give each store an anchor of its own', () => {
    const first = createCharacterSignalsStore().getState().bubbleAnchor
    const second = createCharacterSignalsStore().getState().bubbleAnchor
    expect(first).not.toBe(second)
    expect(first.current).not.toBe(second.current)
  })
})

describe('the hooks for the interface', () => {
  it('read each signal of the shared store', () => {
    useCharacterSignals.getState().publish(HANDING_OVER)

    expect(renderHook(() => useBubble()).result.current).toEqual(HANDING_OVER.bubble)
    expect(renderHook(() => useBadge()).result.current).toBe('done')
    expect(renderHook(() => useCharState()).result.current).toBe('handingFile')
    expect(renderHook(() => useBubbleAnchor()).result.current).toBe(useCharacterSignals.getState().bubbleAnchor)

    useCharacterSignals.getState().publish({ bubble: [], badge: 'idle', charState: 'resting' })
  })

  it('do not render again when the anchor moves or the same values are published', () => {
    useCharacterSignals.getState().publish(HANDING_OVER)
    let renders = 0
    renderHook(() => {
      renders++
      return [useBubble(), useBadge(), useCharState(), useBubbleAnchor()]
    })
    const before = renders

    useCharacterSignals.getState().bubbleAnchor.current[1] += 1
    useCharacterSignals.getState().publish({ ...HANDING_OVER, bubble: [...MESSAGES.done] })

    expect(renders).toBe(before)
    useCharacterSignals.getState().bubbleAnchor.current[1] -= 1
    useCharacterSignals.getState().publish({ bubble: [], badge: 'idle', charState: 'resting' })
  })
})
