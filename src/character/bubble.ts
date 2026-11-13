// What the character says and shows above its head in each state, and where
// its speech bubble goes. Rules only: nothing here knows about time passing or
// about the 3D scene.
import { MESSAGES } from '../agent/messages'
import { CHARACTER_HEIGHT, type Vec3 } from '../scene/layout'
import type { AgentStep } from '../store/tasks'
import { isThinkingStep } from './clipForState'
import { SEAT_LIFT } from './clips/shared'
import type { CharMachine, CharState } from './stateMachine'
import type { BadgeStatus } from './statusSymbols'

type Queued = CharMachine['queued']

/** How long the character keeps saying that it is stopping after a task was cancelled. */
export const CANCEL_BUBBLE_MS = 2000

/**
 * How long the first of the two hand-over lines is said at the least. The
 * second takes its place when the character has arrived, but not before this
 * is up: without a walk it arrives before anybody could have read the first.
 */
export const DONE_FIRST_LINE_MS = 1500

export interface BubbleContext {
  state: CharState
  queued: Queued
  /** The progress line of the task that is running, or null when there is none (yet). */
  message: string | null
  /** Milliseconds since a task was last cancelled; null when none was, or a task has started since. */
  sinceCancel: number | null
  /** Milliseconds since the character began to announce the result it is bringing out; null when that is not known. */
  sinceDone: number | null
}

/**
 * What the character says: one line at the most, as a list, which is empty
 * when it has nothing to say. What the character is doing comes first; the
 * line about stopping only shows while nothing else is going on. The two
 * lines of a hand-over are said one after the other, never together.
 */
export function bubbleFor({ state, queued, message, sinceCancel, sinceDone }: BubbleContext): string[] {
  switch (state) {
    case 'working':
      return message === null ? [] : [message]
    case 'standingUp':
    case 'walkingOut':
      return [MESSAGES.done[0]]
    case 'handingFile':
      // Arrived: the second line takes the place of the first, once the first has had its time.
      return [sinceDone !== null && sinceDone < DONE_FIRST_LINE_MS ? MESSAGES.done[0] : MESSAGES.done[1]]
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

/** What a task at `step` has the character do, as a status: thinking it over, or at work on it. */
function workBadge(step: AgentStep | null): BadgeStatus {
  return isThinkingStep(step) ? 'thinking' : 'working'
}

/**
 * The status symbol above the head. `step` is what the running task is doing,
 * which only matters while the character works on it or has it queued: on the
 * way back to the desk the symbol already shows what awaits there.
 */
export function badgeForState(state: CharState, queued: Queued, step: AgentStep | null): BadgeStatus {
  switch (state) {
    case 'resting':
    case 'watching':
    case 'greeting':
    case 'fidgeting':
      return 'idle'
    case 'working':
      return workBadge(step)
    case 'standingUp':
    case 'walkingOut':
    case 'handingFile':
      return 'done'
    case 'error':
      return 'error'
    case 'returning':
      switch (queued) {
        case null:
          return 'idle'
        case 'work':
          return workBadge(step)
        case 'done':
          return 'done'
        case 'failed':
          return 'error'
      }
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
