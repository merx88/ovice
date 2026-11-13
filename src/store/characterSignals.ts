// What the character lets the interface know about itself: what it says, the
// status above its head, the state it is in, and where its speech bubble goes.
// Written by the character's driver, read by the interface.
import { create } from 'zustand'
import { bubbleAnchorAt } from '../character/bubble'
import { SEAT_LIFT } from '../character/clips/shared'
import type { CharState } from '../character/stateMachine'
import type { BadgeStatus } from '../character/statusSymbols'
import { SEAT_GROUND_POS } from '../scene/layout'

/**
 * Where the speech bubble goes, in world space: the point its left edge
 * starts from, at the height of its middle. That is beside the top of the
 * character's hood, to the right of the badge as the camera sees it.
 *
 * This is one object for the lifetime of the store. The driver changes the
 * numbers of `current` in place on every frame and nobody is told, so read it
 * from inside a frame callback instead of rendering from it.
 */
export interface BubbleAnchor {
  current: [number, number, number]
}

/** The signals that change rarely: subscribers are told when one of them does. */
export interface CharacterSignals {
  /** What the character says: one line at the most; empty when it says nothing. */
  bubble: string[]
  /** The status the icon above the character's head shows. */
  badge: BadgeStatus
  /** What the character is doing. */
  charState: CharState
}

export interface CharacterSignalsState extends CharacterSignals {
  bubbleAnchor: BubbleAnchor
  /**
   * For the character's driver: sets the signals that differ from the ones
   * held. Publishing what is already held tells subscribers nothing, and a
   * bubble with the same lines keeps the list already held.
   */
  publish: (next: CharacterSignals) => void
}

function sameLines(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((line, index) => line === b[index])
}

export function createCharacterSignalsStore() {
  return create<CharacterSignalsState>()((set, get) => ({
    bubble: [],
    badge: 'idle',
    charState: 'resting',
    bubbleAnchor: { current: bubbleAnchorAt(SEAT_GROUND_POS, SEAT_LIFT) },
    publish: (next) => {
      const held = get()
      const changed: Partial<CharacterSignals> = {}
      if (!sameLines(held.bubble, next.bubble)) changed.bubble = next.bubble
      if (held.badge !== next.badge) changed.badge = next.badge
      if (held.charState !== next.charState) changed.charState = next.charState
      if (Object.keys(changed).length > 0) set(changed)
    },
  }))
}

export const useCharacterSignals = createCharacterSignalsStore()

/** What the character says, one line at the most; renders again only when it changes. */
export const useBubble = (): string[] => useCharacterSignals((state) => state.bubble)

/** The status above the character's head; renders again only when it changes. */
export const useBadge = (): BadgeStatus => useCharacterSignals((state) => state.badge)

/** What the character is doing; renders again only when it changes. */
export const useCharState = (): CharState => useCharacterSignals((state) => state.charState)

/** The bubble's anchor: always the same object, to be read inside a frame callback (see `BubbleAnchor`). */
export const useBubbleAnchor = (): BubbleAnchor => useCharacterSignals((state) => state.bubbleAnchor)
