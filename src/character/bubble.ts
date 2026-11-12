// What the character says and shows above its head in each state, and where
// its speech bubble goes. Rules only: nothing here knows about time passing or
// about the 3D scene.
import { MESSAGES } from '../agent/messages'
import { CHARACTER_HEIGHT, type Vec3 } from '../scene/layout'
import { SEAT_LIFT } from './clips/shared'
import type { CharMachine, CharState } from './stateMachine'
import type { BadgeStatus } from './StatusBadge'

type Queued = CharMachine['queued']

/** How long the character keeps saying that it is stopping after a task was cancelled. */
export const CANCEL_BUBBLE_MS = 2000

export interface BubbleContext {
  state: CharState
  queued: Queued
  /** The progress line of the task that is running, or null when there is none (yet). */
  message: string | null
  /** Milliseconds since a task was last cancelled; null when none was, or a task has started since. */
  sinceCancel: number | null
}

/**
 * The lines of the speech bubble, in the order they are said; empty when the
 * character has nothing to say. What the character is doing comes first; the
 * line about stopping only shows while nothing else is going on.
 */
export function bubbleFor({ state, queued, message, sinceCancel }: BubbleContext): string[] {
  switch (state) {
    case 'working':
      return message === null ? [] : [message]
    case 'standingUp':
    case 'walkingOut':
      return [MESSAGES.done[0]]
    case 'handingFile':
      return [...MESSAGES.done]
    case 'error':
      return [MESSAGES.error]
    case 'returning':
      // The next task is already running: its progress is the news.
      if (queued === 'work') return message === null ? [] : [message]
      break
    case 'resting':
    case 'watching':
    case 'greeting':
    case 'fidgeting':
      break
  }
  return sinceCancel !== null && sinceCancel < CANCEL_BUBBLE_MS ? [MESSAGES.cancel] : []
}

/** What a task queued during the hand-over has come to, as a badge. */
const QUEUED_BADGES = { work: 'working', done: 'done', failed: 'error' } as const satisfies Record<
  NonNullable<Queued>,
  BadgeStatus
>

/** The status icon above the head. On the way back to the desk it already shows what awaits there. */
export function badgeForState(state: CharState, queued: Queued): BadgeStatus {
  switch (state) {
    case 'resting':
    case 'watching':
    case 'greeting':
    case 'fidgeting':
      return 'idle'
    case 'working':
      return 'working'
    case 'standingUp':
    case 'walkingOut':
    case 'handingFile':
      return 'done'
    case 'error':
      return 'error'
    case 'returning':
      return queued === null ? 'idle' : QUEUED_BADGES[queued]
  }
}

// --- Where the bubble goes ---------------------------------------------------

/**
 * The bubble starts beside the top of the hood, to the right of the badge as
 * the camera sees it: this far (m) towards +x from the middle of the
 * character, and this far above the top of its head. Measured on the
 * reference screens, where the bubble's left edge is level with the edge of
 * the hood and its middle a little higher than the hood's top.
 */
const BUBBLE_OFFSET = { right: 0.3, up: 0.08 } as const

/**
 * How far (m) the character's body is above where it would be standing: the
 * height of the seat while it sits, none while it is on its feet. `sitting`
 * says whether a character on its way back has reached the chair and is
 * sitting down.
 */
export function bubbleLift(state: CharState, sitting: boolean): number {
  switch (state) {
    case 'standingUp':
    case 'walkingOut':
    case 'handingFile':
      return 0
    case 'returning':
      return sitting ? SEAT_LIFT : 0
    case 'resting':
    case 'watching':
    case 'greeting':
    case 'fidgeting':
    case 'working':
    case 'error':
      return SEAT_LIFT
  }
}

/**
 * The bubble's anchor in world space for a character on the ground point
 * `position` whose body is `lift` above standing: the point the left edge of
 * the bubble starts from, at the height of the bubble's middle. Written into
 * `into` when given, so that one tuple can follow the character.
 */
export function bubbleAnchorAt(
  position: Vec3,
  lift: number,
  into: [number, number, number] = [0, 0, 0],
): [number, number, number] {
  into[0] = position[0] + BUBBLE_OFFSET.right
  into[1] = position[1] + CHARACTER_HEIGHT + BUBBLE_OFFSET.up + lift
  into[2] = position[2]
  return into
}
