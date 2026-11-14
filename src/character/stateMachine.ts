import { GREET_INTERVAL_MS, POINTER_STILL_MS, SOFA_AFTER_MS } from './constants'

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
  | 'goingToSofa'
  | 'rushingToDesk'

export type FidgetKind = 'sip' | 'stretch' | 'lookAround' | 'tap'

/** Where the character waits for something to do: on its chair at the desk, or on the sofa. */
export type Place = 'desk' | 'sofa'

export type CharEvent =
  | { type: 'pointerMove' }
  | { type: 'pointerLeave' }
  /** A frame has passed. `canLounge` says whether the sofa is where the character may wait: in the picture. */
  | { type: 'tick'; now: number; canLounge: boolean }
  | { type: 'taskStarted' }
  | { type: 'taskDone' }
  | { type: 'taskCancelled' }
  | { type: 'taskFailed' }
  | { type: 'clipFinished' }
  | { type: 'fileOpened' }
  /**
   * The viewer was closed on the result the character is bringing out: it has
   * been read. Whoever drives the machine tells it of no other result's viewer.
   */
  | { type: 'viewerClosed' }
  /** The chat is being used: its field was focused or pressed, or its text changed. */
  | { type: 'chatActivity' }

export interface CharMachine {
  state: CharState
  /**
   * Where the character waits. It is 'sofa' exactly while it waits on the
   * sofa, in one of the four waiting states; on its way there it is still of
   * the desk, and it is of the desk again from the moment it is called back.
   */
  place: Place
  /** Which fidget is playing; set only while `state` is 'fidgeting'. */
  fidget: FidgetKind | null
  /**
   * What a task has come to that was submitted while the character could not
   * start on it. Only ever set on a way back to the chair ('returning',
   * 'rushingToDesk') and during a sip: the character first sits down, or puts
   * the cup back, and then acts on it.
   */
  queued: 'work' | 'done' | 'failed' | null
  /** Time of the last real pointer movement, recorded in every state. */
  lastPointerAt: number
  /** Time the last greeting started; -Infinity until the first one. */
  lastGreetAt: number
  /** Time the current state was entered. */
  enteredAt: number
  /**
   * Since when the character has been waiting at its desk with the chat left
   * alone: the later of the last chat input and the moment it came (back) to
   * rest there. `SOFA_AFTER_MS` after this it goes to the sofa.
   */
  idleSince: number
}

export const FIDGETS: readonly FidgetKind[] = ['sip', 'stretch', 'lookAround', 'tap']

/** The fidgets that have a form for the sofa: the cup and the desk to drum on are not within reach there. */
export const SOFA_FIDGETS: readonly FidgetKind[] = ['stretch', 'lookAround']

export function initialMachine(now: number): CharMachine {
  return {
    state: 'resting',
    place: 'desk',
    fidget: null,
    queued: null,
    lastPointerAt: now,
    lastGreetAt: -Infinity,
    enteredAt: now,
    idleSince: now,
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

/** Back at rest at the desk with nothing to do: the wait for the sofa is counted from here. */
function rest(m: CharMachine, now: number): CharMachine {
  return enter(m, 'resting', now, { idleSince: now })
}

function enterFidgeting(m: CharMachine, now: number, rand: () => number): CharMachine {
  const fidgets = m.place === 'sofa' ? SOFA_FIDGETS : FIDGETS
  const fidget = fidgets[Math.min(fidgets.length - 1, Math.floor(rand() * fidgets.length))]
  return enter(m, 'fidgeting', now, { fidget })
}

/** Off to the sofa, if the chat has been left alone for long enough and the sofa is where it may wait. */
function leaveForSofa(m: CharMachine, e: CharEvent, now: number): CharMachine | null {
  if (e.type !== 'tick' || !e.canLounge || now - m.idleSince < SOFA_AFTER_MS) return null
  return enter(m, 'goingToSofa', now)
}

/** Called back to the desk, at a run; `queued` is the task that calls, if one does. */
function rush(m: CharMachine, now: number, queued: CharMachine['queued'] = null): CharMachine {
  return enter(m, 'rushingToDesk', now, { place: 'desk', queued })
}

/** A sip is finished before anything else: the cup is in the hand and has to go back first. */
function isSipping(m: CharMachine): boolean {
  return m.state === 'fidgeting' && m.fidget === 'sip'
}

/** Whether the character is waiting for something to do, at its desk or on the sofa. */
function isWaiting(m: CharMachine): boolean {
  return m.state === 'resting' || m.state === 'watching' || m.state === 'greeting' || m.state === 'fidgeting'
}

/** The pointer moved: note when, and look at it if the character is free to. */
function onPointerMove(m: CharMachine, now: number): CharMachine {
  const moved = m.lastPointerAt === now ? m : { ...m, lastPointerAt: now }
  const free = m.state === 'resting' || (m.state === 'fidgeting' && !isSipping(m))
  return free ? enter(moved, 'watching', now) : moved
}

/**
 * The chat is being used. From the sofa, and on the way there, the character
 * hurries back to its desk. Waiting at the desk it stays as it is, and the
 * wait for the sofa starts again. In every other state it is busy, and its
 * wait starts when it is back at rest.
 */
function onChatActivity(m: CharMachine, now: number): CharMachine {
  if (m.place === 'sofa' || m.state === 'goingToSofa') return rush(m, now)
  return isWaiting(m) && m.idleSince !== now ? { ...m, idleSince: now } : m
}

/** Something happened to a task while the character cannot act on it: note what the task has come to. */
function queueTask(m: CharMachine, e: CharEvent): CharMachine {
  switch (e.type) {
    case 'taskStarted':
      // A new task takes the place of a result that has not begun to be brought out: that one stays in the list of tasks.
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

/** Seated at the desk again, or the cup is back on it: act on whatever the queued task has come to meanwhile. */
function actOnQueued(m: CharMachine, now: number): CharMachine {
  switch (m.queued) {
    case 'work':
      return enter(m, 'working', now)
    case 'done':
      return enter(m, 'standingUp', now)
    case 'failed':
      return enter(m, 'error', now)
    case null:
      return rest(m, now)
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
  if (e.type === 'chatActivity') return onChatActivity(m, now)

  if (m.place === 'sofa') {
    // Whatever it is doing there, a task calls it back, and so does the sofa leaving the picture.
    if (e.type === 'taskStarted') return rush(m, now, 'work')
    if (e.type === 'tick' && !e.canLounge) return rush(m, now)
  }

  switch (m.state) {
    case 'resting':
      if (e.type === 'taskStarted') return enter(m, 'working', now)
      return (m.place === 'desk' && leaveForSofa(m, e, now)) || m

    case 'watching':
      switch (e.type) {
        case 'taskStarted':
          return enter(m, 'working', now)
        case 'tick': {
          // The ten seconds are counted whatever the pointer does.
          const leaving = m.place === 'desk' && leaveForSofa(m, e, now)
          if (leaving) return leaving
          if (now - m.lastPointerAt < POINTER_STILL_MS) return m
          return now - m.lastGreetAt >= GREET_INTERVAL_MS
            ? enter(m, 'greeting', now, { lastGreetAt: now })
            : enterFidgeting(m, now, rand)
        }
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
      if (isSipping(m)) {
        // A task that arrives during a sip waits until the cup is back on the desk.
        if (e.type !== 'clipFinished') return queueTask(m, e)
        // A sip nothing came in the way of was part of the wait, which goes on.
        return m.queued === null ? enter(m, 'resting', now) : actOnQueued(m, now)
      }
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
          return rest(m, now)
        case 'taskFailed':
          return enter(m, 'error', now)
        default:
          return m
      }

    case 'standingUp':
      switch (e.type) {
        case 'taskStarted':
          return enter(m, 'returning', now, { queued: 'work' })
        case 'viewerClosed':
          // Read from the tasks panel before it could be handed over: nothing is left to bring.
          return enter(m, 'returning', now)
        case 'clipFinished':
          return enter(m, 'walkingOut', now)
        default:
          return m
      }

    case 'walkingOut':
      switch (e.type) {
        case 'taskStarted':
          return enter(m, 'returning', now, { queued: 'work' })
        case 'viewerClosed':
          return enter(m, 'returning', now)
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
    case 'rushingToDesk':
      // On its way back to the chair, walking or running: seated, it acts on what was queued meanwhile.
      return e.type === 'clipFinished' ? actOnQueued(m, now) : queueTask(m, e)

    case 'error':
      switch (e.type) {
        case 'taskStarted':
          return enter(m, 'working', now)
        case 'clipFinished':
          return rest(m, now)
        default:
          return m
      }

    case 'goingToSofa':
      switch (e.type) {
        case 'taskStarted':
          return rush(m, now, 'work')
        case 'tick':
          // The sofa has left the picture: back to the desk.
          return e.canLounge ? m : rush(m, now)
        case 'clipFinished':
          return enter(m, 'resting', now, { place: 'sofa' })
        default:
          return m
      }
  }
}
