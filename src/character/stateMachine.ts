import { GREET_INTERVAL_MS, POINTER_STILL_MS } from './constants'

export type CharState =
  | 'resting'
  | 'watching'
  | 'greeting'
  | 'fidgeting'
  | 'working'
  | 'standingUp'
  | 'walkingOut'
  | 'handingFile'
  | 'returning'
  | 'error'

export type FidgetKind = 'sip' | 'stretch' | 'lookAround' | 'tap'

export type CharEvent =
  | { type: 'pointerMove' }
  | { type: 'pointerLeave' }
  | { type: 'tick'; now: number }
  | { type: 'taskStarted' }
  | { type: 'taskDone' }
  | { type: 'taskCancelled' }
  | { type: 'taskFailed' }
  | { type: 'clipFinished' }
  | { type: 'fileOpened' }
  | { type: 'viewerClosed' }

export interface CharMachine {
  state: CharState
  /** Which fidget is playing; set only while `state` is 'fidgeting'. */
  fidget: FidgetKind | null
  /**
   * What a task has come to that was submitted while the character could not
   * start on it. Only ever set while 'returning' and during a sip: the
   * character first sits down, or puts the cup back, and then acts on it.
   */
  queued: 'work' | 'done' | 'failed' | null
  /** Time of the last real pointer movement, recorded in every state. */
  lastPointerAt: number
  /** Time the last greeting started; -Infinity until the first one. */
  lastGreetAt: number
  /** Time the current state was entered. */
  enteredAt: number
}

export const FIDGETS: readonly FidgetKind[] = ['sip', 'stretch', 'lookAround', 'tap']

export function initialMachine(now: number): CharMachine {
  return {
    state: 'resting',
    fidget: null,
    queued: null,
    lastPointerAt: now,
    lastGreetAt: -Infinity,
    enteredAt: now,
  }
}

/** Moves to `state`. Every entry clears `fidget` and `queued` unless `patch` sets them. */
function enter(
  m: CharMachine,
  state: CharState,
  now: number,
  patch: Partial<CharMachine> = {},
): CharMachine {
  return { ...m, state, fidget: null, queued: null, enteredAt: now, ...patch }
}

function enterFidgeting(m: CharMachine, now: number, rand: () => number): CharMachine {
  const fidget = FIDGETS[Math.min(3, Math.floor(rand() * 4))]
  return enter(m, 'fidgeting', now, { fidget })
}

/** A sip is finished before anything else: the cup is in the hand and has to go back first. */
function isSipping(m: CharMachine): boolean {
  return m.state === 'fidgeting' && m.fidget === 'sip'
}

/** The pointer moved: note when, and look at it if the character is free to. */
function onPointerMove(m: CharMachine, now: number): CharMachine {
  const moved = m.lastPointerAt === now ? m : { ...m, lastPointerAt: now }
  const free = m.state === 'resting' || (m.state === 'fidgeting' && !isSipping(m))
  return free ? enter(moved, 'watching', now) : moved
}

/** Something happened to a task while the character cannot act on it: note what the task has come to. */
function queueTask(m: CharMachine, e: CharEvent): CharMachine {
  switch (e.type) {
    case 'taskStarted':
      return m.queued === 'work' ? m : { ...m, queued: 'work' }
    case 'taskDone':
      return m.queued === 'work' ? { ...m, queued: 'done' } : m
    case 'taskFailed':
      return m.queued === 'work' ? { ...m, queued: 'failed' } : m
    case 'taskCancelled':
      return m.queued === 'work' ? { ...m, queued: null } : m
    default:
      return m
  }
}

/** Seated again, or the cup is back on the desk: act on whatever the queued task has come to meanwhile. */
function actOnQueued(m: CharMachine, now: number): CharMachine {
  switch (m.queued) {
    case 'work':
      return enter(m, 'working', now)
    case 'done':
      return enter(m, 'standingUp', now)
    case 'failed':
      return enter(m, 'error', now)
    case null:
      return enter(m, 'resting', now)
  }
}

/**
 * The next machine for event `e` at time `now`. Pure: no clock, no timers, and `rand` is
 * only called when a fidget starts.
 *
 * An event the current state has no transition for returns `m` itself, so callers can
 * compare references to see whether anything changed. `now` is the only time used; the
 * `now` field on a tick event is not read.
 */
export function transition(
  m: CharMachine,
  e: CharEvent,
  now: number,
  rand: () => number = Math.random,
): CharMachine {
  if (e.type === 'pointerMove') return onPointerMove(m, now)

  switch (m.state) {
    case 'resting':
      return e.type === 'taskStarted' ? enter(m, 'working', now) : m

    case 'watching':
      switch (e.type) {
        case 'taskStarted':
          return enter(m, 'working', now)
        case 'tick':
          if (now - m.lastPointerAt < POINTER_STILL_MS) return m
          return now - m.lastGreetAt >= GREET_INTERVAL_MS
            ? enter(m, 'greeting', now, { lastGreetAt: now })
            : enterFidgeting(m, now, rand)
        default:
          return m
      }

    case 'greeting':
      switch (e.type) {
        case 'taskStarted':
          return enter(m, 'working', now)
        case 'clipFinished':
          return enterFidgeting(m, now, rand)
        default:
          return m
      }

    case 'fidgeting':
      // A task that arrives during a sip waits until the cup is back on the desk.
      if (isSipping(m)) return e.type === 'clipFinished' ? actOnQueued(m, now) : queueTask(m, e)
      switch (e.type) {
        case 'taskStarted':
          return enter(m, 'working', now)
        case 'clipFinished':
          return enter(m, 'resting', now)
        default:
          return m
      }

    case 'working':
      switch (e.type) {
        case 'taskDone':
          return enter(m, 'standingUp', now)
        case 'taskCancelled':
          return enter(m, 'resting', now)
        case 'taskFailed':
          return enter(m, 'error', now)
        default:
          return m
      }

    case 'standingUp':
      switch (e.type) {
        case 'taskStarted':
          return enter(m, 'returning', now, { queued: 'work' })
        case 'clipFinished':
          return enter(m, 'walkingOut', now)
        default:
          return m
      }

    case 'walkingOut':
      switch (e.type) {
        case 'taskStarted':
          return enter(m, 'returning', now, { queued: 'work' })
        case 'clipFinished':
          return enter(m, 'handingFile', now)
        default:
          return m
      }

    case 'handingFile':
      switch (e.type) {
        case 'taskStarted':
          return enter(m, 'returning', now, { queued: 'work' })
        case 'viewerClosed':
          return enter(m, 'returning', now)
        default:
          return m
      }

    case 'returning':
      return e.type === 'clipFinished' ? actOnQueued(m, now) : queueTask(m, e)

    case 'error':
      switch (e.type) {
        case 'taskStarted':
          return enter(m, 'working', now)
        case 'clipFinished':
          return enter(m, 'resting', now)
        default:
          return m
      }
  }
}
