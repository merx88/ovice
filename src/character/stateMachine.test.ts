import { describe, expect, it } from 'vitest'
import { BODY_MAX_YAW, GREET_INTERVAL_MS, HEAD_MAX_YAW, POINTER_STILL_MS, SOFA_AFTER_MS } from './constants'
import { FIDGETS, initialMachine, SOFA_FIDGETS, transition } from './stateMachine'
import type { CharEvent, CharMachine, CharState, FidgetKind } from './stateMachine'

type EventType = CharEvent['type']

const T0 = 100_000

const STATES: readonly CharState[] = [
  'resting',
  'watching',
  'greeting',
  'fidgeting',
  'working',
  'standingUp',
  'walkingOut',
  'handingFile',
  'returning',
  'error',
  'goingToSofa',
  'rushingToDesk',
]

/** The states in which the character waits for something to do, at its desk or on the sofa. */
const WAITING: readonly CharState[] = ['resting', 'watching', 'greeting', 'fidgeting']

const EVENT_TYPES: readonly EventType[] = [
  'pointerMove',
  'pointerLeave',
  'tick',
  'taskStarted',
  'taskDone',
  'taskCancelled',
  'taskFailed',
  'clipFinished',
  'fileOpened',
  'viewerClosed',
  'chatActivity',
]

/** A frame's tick; the sofa is in the picture unless the test says otherwise. */
function tick(now: number, canLounge = true): CharEvent {
  return { type: 'tick', now, canLounge }
}

function event(type: EventType, now = T0): CharEvent {
  return type === 'tick' ? tick(now) : { type }
}

/**
 * A machine sitting in `state`, entered at T0 with the pointer last moved at T0.
 * Frozen, so a transition that mutated its input would throw.
 */
function machineIn(state: CharState, patch: Partial<CharMachine> = {}): CharMachine {
  return Object.freeze({
    ...initialMachine(T0),
    state,
    fidget: state === 'fidgeting' ? 'stretch' : null,
    ...patch,
  })
}

/** A machine waiting on the sofa in `state`, frozen like `machineIn`'s. */
function onSofaIn(state: CharState, patch: Partial<CharMachine> = {}): CharMachine {
  return machineIn(state, { place: 'sofa', ...patch })
}

/** Sends the events in order, all at the same `now`. */
function send(m: CharMachine, types: readonly EventType[], now: number): CharMachine {
  return types.reduce((acc, type) => transition(acc, event(type, now), now), m)
}

describe('constants', () => {
  it('uses the project-wide character values', () => {
    expect(POINTER_STILL_MS).toBe(1200)
    expect(GREET_INTERVAL_MS).toBe(8000)
    expect(HEAD_MAX_YAW).toBe(Math.PI / 4)
    expect(BODY_MAX_YAW).toBe(Math.PI / 6)
    expect(SOFA_AFTER_MS).toBe(10_000)
  })
})

describe('initialMachine', () => {
  it('starts resting at the desk with nothing queued, the first greeting allowed and the wait counted from now', () => {
    expect(initialMachine(T0)).toEqual({
      state: 'resting',
      place: 'desk',
      fidget: null,
      queued: null,
      lastPointerAt: T0,
      lastGreetAt: -Infinity,
      enteredAt: T0,
      idleSince: T0,
    })
  })
})

describe('idle states', () => {
  it('resting + pointerMove → watching', () => {
    const next = transition(machineIn('resting'), { type: 'pointerMove' }, T0 + 50)
    expect(next.state).toBe('watching')
    expect(next.lastPointerAt).toBe(T0 + 50)
  })

  it('watching + tick once the pointer has been still for 1200ms → greeting', () => {
    const next = transition(machineIn('watching'), event('tick'), T0 + 1200)
    expect(next.state).toBe('greeting')
  })

  it('watching + tick at 1199ms of stillness stays watching', () => {
    const m = machineIn('watching')
    expect(transition(m, event('tick'), T0 + 1199)).toBe(m)
  })

  it('watching + still pointer → fidgeting when the last greeting was under 8000ms ago', () => {
    const m = machineIn('watching', { lastGreetAt: T0 + 1200 - 7999 })
    const next = transition(m, event('tick'), T0 + 1200)
    expect(next.state).toBe('fidgeting')
    expect(next.lastGreetAt).toBe(m.lastGreetAt)
  })

  it('watching + still pointer → greeting again exactly 8000ms after the last greeting', () => {
    const m = machineIn('watching', { lastGreetAt: T0 + 1200 - 8000 })
    expect(transition(m, event('tick'), T0 + 1200).state).toBe('greeting')
  })

  it('watching + pointerMove stays watching and restarts the still-timer', () => {
    const moved = transition(machineIn('watching'), { type: 'pointerMove' }, T0 + 1000)
    expect(moved.state).toBe('watching')
    expect(moved.lastPointerAt).toBe(T0 + 1000)
    expect(moved.enteredAt).toBe(T0)

    const early = transition(moved, event('tick'), T0 + 2199)
    expect(early).toBe(moved)
    expect(transition(moved, event('tick'), T0 + 2200).state).toBe('greeting')
  })

  it('greeting + clipFinished → fidgeting', () => {
    const next = transition(machineIn('greeting'), { type: 'clipFinished' }, T0 + 2000)
    expect(next.state).toBe('fidgeting')
  })

  it('greeting is not interrupted by pointerMove', () => {
    const next = transition(machineIn('greeting'), { type: 'pointerMove' }, T0 + 300)
    expect(next.state).toBe('greeting')
    expect(next.enteredAt).toBe(T0)
    expect(transition(next, { type: 'clipFinished' }, T0 + 2000).state).toBe('fidgeting')
  })

  it('fidgeting + clipFinished → resting', () => {
    const next = transition(machineIn('fidgeting'), { type: 'clipFinished' }, T0 + 3000)
    expect(next.state).toBe('resting')
    expect(next.fidget).toBeNull()
  })

  it('fidgeting + pointerMove → watching', () => {
    const next = transition(machineIn('fidgeting'), { type: 'pointerMove' }, T0 + 400)
    expect(next.state).toBe('watching')
    expect(next.fidget).toBeNull()
    expect(next.lastPointerAt).toBe(T0 + 400)
  })

  it('resting + tick does nothing about a pointer that has been still, however long', () => {
    const m = machineIn('resting')
    expect(transition(m, event('tick'), T0 + POINTER_STILL_MS)).toBe(m)
    expect(transition(m, event('tick'), T0 + SOFA_AFTER_MS - 1)).toBe(m)
    // Where the sofa is out of the picture there is nothing else for a tick to do either.
    expect(transition(m, tick(T0 + 10 * 60 * 1000, false), T0 + 10 * 60 * 1000)).toBe(m)
  })

  it.each(['resting', 'watching', 'greeting', 'fidgeting'] as const)(
    '%s + taskStarted → working',
    (state) => {
      const next = transition(machineIn(state), { type: 'taskStarted' }, T0 + 10)
      expect(next.state).toBe('working')
      expect(next.fidget).toBeNull()
      expect(next.queued).toBeNull()
    },
  )
})

describe('greeting interval', () => {
  it('allows the very first greeting', () => {
    const fresh = initialMachine(0)
    const watching = transition(fresh, { type: 'pointerMove' }, 0)
    expect(transition(watching, event('tick'), POINTER_STILL_MS).state).toBe('greeting')
  })

  it('records when the greeting started', () => {
    const next = transition(machineIn('watching'), event('tick'), T0 + 1500)
    expect(next.state).toBe('greeting')
    expect(next.lastGreetAt).toBe(T0 + 1500)
  })

  it('fidgets instead of greeting twice within 8000ms, then greets again after it', () => {
    let m = send(machineIn('resting'), ['pointerMove'], T0)
    m = send(m, ['tick'], T0 + 1200)
    expect(m.state).toBe('greeting')

    // greeting → fidgeting → resting, then the pointer moves and stops again
    m = send(m, ['clipFinished', 'clipFinished', 'pointerMove'], T0 + 4000)
    expect(m.state).toBe('watching')
    m = send(m, ['tick'], T0 + 5200)
    expect(m.state).toBe('fidgeting')
    expect(m.lastGreetAt).toBe(T0 + 1200)

    m = send(m, ['clipFinished', 'pointerMove'], T0 + 8000)
    m = send(m, ['tick'], T0 + 9199)
    expect(m.state).toBe('watching')
    m = send(m, ['tick'], T0 + 9200)
    expect(m.state).toBe('greeting')
    expect(m.lastGreetAt).toBe(T0 + 9200)
  })
})

describe('tick', () => {
  it('measures time with the `now` argument, not the field on the event', () => {
    const m = machineIn('watching')
    expect(transition(m, { type: 'tick', now: T0 + 60_000, canLounge: true }, T0 + 1199)).toBe(m)
    expect(transition(m, { type: 'tick', now: T0, canLounge: true }, T0 + 1200).state).toBe('greeting')
  })
})

describe('pointerLeave', () => {
  it.each(STATES)('changes nothing in %s', (state) => {
    const m = machineIn(state)
    expect(transition(m, { type: 'pointerLeave' }, T0 + 700)).toBe(m)
  })

  it('does not shortcut the still-timer: the next tick fires 1200ms after the last real move', () => {
    const moved = transition(machineIn('watching'), { type: 'pointerMove' }, T0 + 1000)
    const left = transition(moved, { type: 'pointerLeave' }, T0 + 1500)
    expect(left).toBe(moved)
    expect(left.lastPointerAt).toBe(T0 + 1000)

    expect(transition(left, event('tick'), T0 + 1501)).toBe(left)
    expect(transition(left, event('tick'), T0 + 2199)).toBe(left)
    expect(transition(left, event('tick'), T0 + 2200).state).toBe('greeting')
  })

  it('leads to fidgeting rather than greeting when a greeting happened recently', () => {
    const m = machineIn('watching', { lastGreetAt: T0 - 1000 })
    const left = transition(m, { type: 'pointerLeave' }, T0 + 100)
    expect(transition(left, event('tick'), T0 + 1200).state).toBe('fidgeting')
  })
})

describe('pointerMove bookkeeping', () => {
  it.each(STATES)('records the move time in %s', (state) => {
    const next = transition(machineIn(state), { type: 'pointerMove' }, T0 + 250)
    expect(next.lastPointerAt).toBe(T0 + 250)
  })

  it.each([
    'greeting',
    'working',
    'standingUp',
    'walkingOut',
    'handingFile',
    'returning',
    'error',
    'goingToSofa',
    'rushingToDesk',
  ] as const)(
    'changes only lastPointerAt in %s',
    (state) => {
      const m = machineIn(state, state === 'returning' || state === 'rushingToDesk' ? { queued: 'work' } : {})
      const next = transition(m, { type: 'pointerMove' }, T0 + 250)
      expect(next).toEqual({ ...m, lastPointerAt: T0 + 250 })
    },
  )

  it('returns the same object when the move time is unchanged', () => {
    const m = machineIn('working')
    expect(transition(m, { type: 'pointerMove' }, T0)).toBe(m)
  })

  it('measures stillness from a move made while busy once the character is idle again', () => {
    // working; the pointer moves at +5000; the task is cancelled; the pointer moves again at +9000
    let m = send(machineIn('working'), ['pointerMove'], T0 + 5000)
    m = send(m, ['taskCancelled'], T0 + 6000)
    expect(m.state).toBe('resting')
    expect(m.lastPointerAt).toBe(T0 + 5000)

    m = send(m, ['pointerMove'], T0 + 9000)
    expect(send(m, ['tick'], T0 + 10_199).state).toBe('watching')
    expect(send(m, ['tick'], T0 + 10_200).state).toBe('greeting')
  })
})

describe('fidget choice', () => {
  it('exports the fidgets in order', () => {
    expect(FIDGETS).toEqual(['sip', 'stretch', 'lookAround', 'tap'])
  })

  it.each<[number, FidgetKind]>([
    [0, 'sip'],
    [0.2499, 'sip'],
    [0.25, 'stretch'],
    [0.5, 'lookAround'],
    [0.75, 'tap'],
    [0.99, 'tap'],
    [1, 'tap'],
  ])('rand() = %f picks %s', (value, expected) => {
    const next = transition(machineIn('greeting'), { type: 'clipFinished' }, T0 + 2000, () => value)
    expect(next.state).toBe('fidgeting')
    expect(next.fidget).toBe(expected)
  })

  it('uses rand when fidgeting replaces a too-soon greeting', () => {
    const m = machineIn('watching', { lastGreetAt: T0 })
    const next = transition(m, event('tick'), T0 + 1200, () => 0.5)
    expect(next.state).toBe('fidgeting')
    expect(next.fidget).toBe('lookAround')
  })

  it('falls back to Math.random when no rand is given', () => {
    const next = transition(machineIn('greeting'), { type: 'clipFinished' }, T0 + 2000)
    expect(FIDGETS).toContain(next.fidget)
  })

  it('does not call rand for transitions that do not start a fidget', () => {
    const rand = () => {
      throw new Error('rand must not be called')
    }
    expect(transition(machineIn('resting'), { type: 'pointerMove' }, T0 + 1, rand).state).toBe('watching')
    expect(transition(machineIn('watching'), event('tick'), T0 + 1200, rand).state).toBe('greeting')
    expect(transition(machineIn('working'), { type: 'taskDone' }, T0 + 1, rand).state).toBe('standingUp')
  })

  it('keeps the fidget for events that fidgeting ignores', () => {
    const m = machineIn('fidgeting')
    expect(transition(m, event('tick'), T0 + 5000)).toBe(m)
    expect(m.fidget).toBe('stretch')
  })
})

describe('working', () => {
  it('working + taskDone → standingUp', () => {
    expect(transition(machineIn('working'), { type: 'taskDone' }, T0 + 1).state).toBe('standingUp')
  })

  it('working + taskCancelled → resting', () => {
    expect(transition(machineIn('working'), { type: 'taskCancelled' }, T0 + 1).state).toBe('resting')
  })

  it('working + taskFailed → error', () => {
    expect(transition(machineIn('working'), { type: 'taskFailed' }, T0 + 1).state).toBe('error')
  })

  it('ignores pointerMove for transitions', () => {
    const next = transition(machineIn('working'), { type: 'pointerMove' }, T0 + 1)
    expect(next.state).toBe('working')
    expect(next.enteredAt).toBe(T0)
  })

  it('ignores a second taskStarted and clipFinished', () => {
    const m = machineIn('working')
    expect(transition(m, { type: 'taskStarted' }, T0 + 1)).toBe(m)
    expect(transition(m, { type: 'clipFinished' }, T0 + 1)).toBe(m)
  })

  it('ignores a still pointer', () => {
    const m = machineIn('working')
    expect(transition(m, event('tick'), T0 + 60_000)).toBe(m)
  })
})

describe('handing over the result', () => {
  it('standingUp + clipFinished → walkingOut', () => {
    expect(transition(machineIn('standingUp'), { type: 'clipFinished' }, T0 + 1).state).toBe('walkingOut')
  })

  it('walkingOut + clipFinished → handingFile', () => {
    expect(transition(machineIn('walkingOut'), { type: 'clipFinished' }, T0 + 1).state).toBe('handingFile')
  })

  it('handingFile + fileOpened keeps the state', () => {
    const m = machineIn('handingFile')
    expect(transition(m, { type: 'fileOpened' }, T0 + 1)).toBe(m)
  })

  it('handingFile + clipFinished keeps the state: only closing the viewer ends the hand-over', () => {
    const m = machineIn('handingFile')
    expect(transition(m, { type: 'clipFinished' }, T0 + 1)).toBe(m)
  })

  it('handingFile + viewerClosed → returning', () => {
    const next = transition(machineIn('handingFile'), { type: 'viewerClosed' }, T0 + 1)
    expect(next.state).toBe('returning')
    expect(next.queued).toBeNull()
  })

  it('returning + clipFinished → resting when nothing is queued', () => {
    expect(transition(machineIn('returning'), { type: 'clipFinished' }, T0 + 1).state).toBe('resting')
  })

  it.each(STATES.filter((s) => s !== 'handingFile'))('viewerClosed is ignored in %s', (state) => {
    const m = machineIn(state)
    expect(transition(m, { type: 'viewerClosed' }, T0 + 1)).toBe(m)
  })

  it('walks the whole happy path from a prompt to sitting down again', () => {
    const visited: CharState[] = []
    let m = initialMachine(T0)
    const steps: EventType[] = [
      'taskStarted',
      'taskDone',
      'clipFinished',
      'clipFinished',
      'fileOpened',
      'viewerClosed',
      'clipFinished',
    ]
    steps.forEach((type, i) => {
      m = transition(m, event(type), T0 + (i + 1) * 1000)
      visited.push(m.state)
    })
    expect(visited).toEqual([
      'working',
      'standingUp',
      'walkingOut',
      'handingFile',
      'handingFile',
      'returning',
      'resting',
    ])
  })
})

describe('error', () => {
  it('error + clipFinished → resting', () => {
    expect(transition(machineIn('error'), { type: 'clipFinished' }, T0 + 1).state).toBe('resting')
  })

  it('error + taskStarted → working', () => {
    const next = transition(machineIn('error'), { type: 'taskStarted' }, T0 + 1)
    expect(next.state).toBe('working')
    expect(next.queued).toBeNull()
  })
})

describe('queued work', () => {
  it.each(['standingUp', 'walkingOut', 'handingFile'] as const)(
    '%s + taskStarted → returning with the work queued',
    (state) => {
      const next = transition(machineIn(state), { type: 'taskStarted' }, T0 + 500)
      expect(next.state).toBe('returning')
      expect(next.queued).toBe('work')
      expect(next.enteredAt).toBe(T0 + 500)
    },
  )

  it('returning + taskStarted stays returning and queues the work', () => {
    const next = transition(machineIn('returning'), { type: 'taskStarted' }, T0 + 500)
    expect(next.state).toBe('returning')
    expect(next.queued).toBe('work')
    expect(next.enteredAt).toBe(T0)
  })

  it.each<[EventType, CharMachine['queued']]>([
    ['taskDone', 'done'],
    ['taskFailed', 'failed'],
    ['taskCancelled', null],
  ])('returning with queued work + %s → queued %s', (type, queued) => {
    const m = machineIn('returning', { queued: 'work' })
    const next = transition(m, event(type), T0 + 500)
    expect(next).toEqual({ ...m, queued })
  })

  it.each<[CharMachine['queued'], CharState]>([
    ['work', 'working'],
    ['done', 'standingUp'],
    ['failed', 'error'],
    [null, 'resting'],
  ])('returning with queued %s + clipFinished → %s', (queued, state) => {
    const next = transition(machineIn('returning', { queued }), { type: 'clipFinished' }, T0 + 900)
    expect(next.state).toBe(state)
    expect(next.queued).toBeNull()
    expect(next.enteredAt).toBe(T0 + 900)
  })

  it.each(['taskDone', 'taskFailed', 'taskCancelled'] as const)(
    'returning with nothing queued ignores %s',
    (type) => {
      const m = machineIn('returning')
      expect(transition(m, { type }, T0 + 500)).toBe(m)
    },
  )

  it.each(['done', 'failed'] as const)(
    'returning with queued %s ignores further results of that finished task',
    (queued) => {
      const m = machineIn('returning', { queued })
      expect(transition(m, { type: 'taskDone' }, T0 + 500)).toBe(m)
      expect(transition(m, { type: 'taskFailed' }, T0 + 500)).toBe(m)
      expect(transition(m, { type: 'taskCancelled' }, T0 + 500)).toBe(m)
    },
  )

  it.each(['done', 'failed'] as const)(
    'returning with queued %s + taskStarted queues the newer work instead',
    (queued) => {
      const next = transition(machineIn('returning', { queued }), { type: 'taskStarted' }, T0 + 500)
      expect(next.state).toBe('returning')
      expect(next.queued).toBe('work')
    },
  )

  it('returning with queued work ignores a repeated taskStarted', () => {
    const m = machineIn('returning', { queued: 'work' })
    expect(transition(m, { type: 'taskStarted' }, T0 + 500)).toBe(m)
  })

  it('goes back to the desk and works when a prompt arrives while holding the file', () => {
    let m = send(machineIn('handingFile'), ['taskStarted'], T0 + 1000)
    expect(m).toMatchObject({ state: 'returning', queued: 'work' })
    m = send(m, ['clipFinished'], T0 + 3000)
    expect(m).toMatchObject({ state: 'working', queued: null, enteredAt: T0 + 3000 })
  })

  it('stands straight back up when the queued task finishes before the character sits down', () => {
    let m = send(machineIn('walkingOut'), ['taskStarted', 'taskDone'], T0 + 1000)
    expect(m).toMatchObject({ state: 'returning', queued: 'done' })
    m = send(m, ['clipFinished'], T0 + 3000)
    expect(m).toMatchObject({ state: 'standingUp', queued: null })
  })

  it('shows the error when the queued task fails before the character sits down', () => {
    let m = send(machineIn('standingUp'), ['taskStarted', 'taskFailed'], T0 + 1000)
    expect(m).toMatchObject({ state: 'returning', queued: 'failed' })
    m = send(m, ['clipFinished'], T0 + 3000)
    expect(m).toMatchObject({ state: 'error', queued: null })
  })

  it('just sits down when the queued task is cancelled before the character sits down', () => {
    let m = send(machineIn('handingFile'), ['taskStarted', 'taskCancelled'], T0 + 1000)
    expect(m).toMatchObject({ state: 'returning', queued: null })
    m = send(m, ['clipFinished'], T0 + 3000)
    expect(m).toMatchObject({ state: 'resting', queued: null })
  })
})

describe('a sip', () => {
  const sipping: CharMachine = { ...initialMachine(0), state: 'fidgeting', fidget: 'sip' }
  const OTHER_FIDGETS: readonly FidgetKind[] = ['stretch', 'lookAround', 'tap']

  it('finishes a sip before looking at the pointer', () => {
    const m = transition(sipping, { type: 'pointerMove' }, 500)
    expect(m).toMatchObject({ state: 'fidgeting', fidget: 'sip', lastPointerAt: 500 })
  })

  it('puts the cup down before starting on a task', () => {
    const queued = transition(sipping, { type: 'taskStarted' }, 500)
    expect(queued).toMatchObject({ state: 'fidgeting', fidget: 'sip', queued: 'work' })
    expect(transition(queued, { type: 'clipFinished' }, 900).state).toBe('working')
    const done = transition(queued, { type: 'taskDone' }, 700)
    expect(transition(done, { type: 'clipFinished' }, 900).state).toBe('standingUp')
    const failed = transition(queued, { type: 'taskFailed' }, 700)
    expect(transition(failed, { type: 'clipFinished' }, 900).state).toBe('error')
    const cancelled = transition(queued, { type: 'taskCancelled' }, 700)
    expect(transition(cancelled, { type: 'clipFinished' }, 900).state).toBe('resting')
  })

  it('rests after a sip that nothing came in the way of', () => {
    const next = transition(sipping, { type: 'clipFinished' }, 3000)
    expect(next).toMatchObject({ state: 'resting', fidget: null, queued: null, enteredAt: 3000 })
  })

  it('keeps the time the sip began when a task is queued behind it', () => {
    const queued = transition(sipping, { type: 'taskStarted' }, 500)
    expect(queued.enteredAt).toBe(sipping.enteredAt)
    expect(transition(queued, { type: 'taskDone' }, 700).enteredAt).toBe(sipping.enteredAt)
  })

  it('carries nothing of the sip into the state that follows it', () => {
    const queued = transition(sipping, { type: 'taskStarted' }, 500)
    expect(transition(queued, { type: 'clipFinished' }, 900)).toMatchObject({ state: 'working', fidget: null, queued: null, enteredAt: 900 })
  })

  it('ignores a repeated taskStarted while a task is queued', () => {
    const queued = transition(sipping, { type: 'taskStarted' }, 500)
    expect(transition(queued, { type: 'taskStarted' }, 600)).toBe(queued)
  })

  it.each(['taskDone', 'taskFailed', 'taskCancelled'] as const)('ignores %s while no task is queued', (type) => {
    expect(transition(sipping, { type }, 500)).toBe(sipping)
  })

  it.each(['taskDone', 'taskFailed'] as const)('ignores %s once the queued task has come to an end', (type) => {
    const done = transition(transition(sipping, { type: 'taskStarted' }, 500), { type: 'taskDone' }, 600)
    expect(transition(done, { type }, 700)).toBe(done)
  })

  it('looks at the pointer once the cup is down', () => {
    const rested = transition(transition(sipping, { type: 'pointerMove' }, 500), { type: 'clipFinished' }, 3000)
    expect(rested).toMatchObject({ state: 'resting', lastPointerAt: 500 })
    expect(transition(rested, { type: 'pointerMove' }, 3100).state).toBe('watching')
  })

  it.each(OTHER_FIDGETS)('is the only fidget that is finished first: %s gives way to the pointer and to a task', (fidget) => {
    const fidgeting = machineIn('fidgeting', { fidget })
    expect(transition(fidgeting, { type: 'pointerMove' }, T0 + 400)).toMatchObject({ state: 'watching', fidget: null })
    expect(transition(fidgeting, { type: 'taskStarted' }, T0 + 400)).toMatchObject({ state: 'working', fidget: null, queued: null })
  })
})

describe('waiting on the sofa', () => {
  /** On its way to the sofa since 10 s after a start at 0. */
  const going: CharMachine = transition(initialMachine(0), tick(10_000), 10_000)
  /** Seated on the sofa since 17 s. */
  const onSofa: CharMachine = transition(going, { type: 'clipFinished' }, 17_000)

  it('goes to the sofa after 10 s without chat input', () => {
    const m = initialMachine(0)
    expect(transition(m, tick(9_999), 9_999).state).toBe('resting')
    expect(transition(m, tick(10_000), 10_000).state).toBe('goingToSofa')
  })

  it('goes although the pointer keeps moving', () => {
    const watching = transition(initialMachine(0), { type: 'pointerMove' }, 9_500)
    expect(transition(watching, tick(10_000), 10_000).state).toBe('goingToSofa')
  })

  it('goes rather than waves when the ten seconds and the still pointer come due together', () => {
    const watching = transition(initialMachine(0), { type: 'pointerMove' }, 8_000)
    expect(transition(watching, tick(9_999), 9_999).state).toBe('greeting')
    expect(transition(watching, tick(10_000), 10_000)).toMatchObject({ state: 'goingToSofa', lastGreetAt: -Infinity })
  })

  it('counts from the last chat input', () => {
    const m = transition(initialMachine(0), { type: 'chatActivity' }, 6_000)
    expect(transition(m, tick(15_999), 15_999).state).toBe('resting')
    expect(transition(m, tick(16_000), 16_000).state).toBe('goingToSofa')
  })

  it('does not leave in the middle of a wave or a fidget', () => {
    // The pointer stops at 8.5 s: the wave begins at 9.7 s and nothing interrupts it.
    let m = transition(initialMachine(0), { type: 'pointerMove' }, 8_500)
    m = transition(m, tick(9_700), 9_700)
    expect(m.state).toBe('greeting')
    expect(transition(m, tick(12_000), 12_000)).toBe(m)
    m = transition(m, { type: 'clipFinished' }, 12_000, () => 0.3)
    expect(m).toMatchObject({ state: 'fidgeting', fidget: 'stretch' })
    expect(transition(m, tick(14_000), 14_000)).toBe(m)
    // Neither restarts the count: the next tick at rest leaves.
    m = transition(m, { type: 'clipFinished' }, 15_000)
    expect(m).toMatchObject({ state: 'resting', idleSince: 0 })
    expect(transition(m, tick(15_016), 15_016).state).toBe('goingToSofa')
  })

  it('does not leave in the middle of a sip either, and not with a task queued behind it', () => {
    const sipping: CharMachine = { ...initialMachine(0), state: 'fidgeting', fidget: 'sip' }
    expect(transition(sipping, tick(30_000), 30_000)).toBe(sipping)
    const rested = transition(sipping, { type: 'clipFinished' }, 30_000)
    expect(rested).toMatchObject({ state: 'resting', idleSince: 0 })
    const queued = transition(sipping, { type: 'taskStarted' }, 29_000)
    expect(transition(queued, tick(30_000), 30_000)).toBe(queued)
    expect(transition(queued, { type: 'clipFinished' }, 30_000).state).toBe('working')
  })

  it('stays at the desk where the sofa cannot be seen', () => {
    expect(transition(initialMachine(0), tick(60_000, false), 60_000).state).toBe('resting')
    const watching = transition(initialMachine(0), { type: 'pointerMove' }, 59_500)
    expect(transition(watching, tick(60_000, false), 60_000).state).toBe('watching')
  })

  it('leaves the desk as it is while it goes: nothing queued, and still of the desk until it has arrived', () => {
    expect(going).toMatchObject({ state: 'goingToSofa', place: 'desk', queued: null, fidget: null, enteredAt: 10_000 })
  })

  it('sits on the sofa when it has arrived', () => {
    expect(transition(going, { type: 'clipFinished' }, 17_000)).toMatchObject({ state: 'resting', place: 'sofa' })
  })

  it('stays on the sofa for as long as nobody wants anything of it', () => {
    expect(transition(onSofa, tick(3_600_000), 3_600_000)).toBe(onSofa)
  })

  it('waits on the sofa as it does at the desk, without the desk fidgets', () => {
    expect(SOFA_FIDGETS).toEqual(['stretch', 'lookAround'])
    // The pointer moves: it watches. The pointer is still for 1200 ms: it waves.
    const watching = transition(onSofa, { type: 'pointerMove' }, 20_000)
    expect(watching).toMatchObject({ state: 'watching', place: 'sofa', lastPointerAt: 20_000 })
    expect(transition(watching, tick(21_199), 21_199)).toBe(watching)
    const greeting = transition(watching, tick(21_200), 21_200)
    expect(greeting).toMatchObject({ state: 'greeting', place: 'sofa', lastGreetAt: 21_200 })
    // After the wave a fidget, which is one of the two it has a lounging form of.
    const picks = [0, 0.3, 0.6, 0.99].map((value) => transition(greeting, { type: 'clipFinished' }, 23_400, () => value))
    expect(picks.map((m) => m.state)).toEqual(['fidgeting', 'fidgeting', 'fidgeting', 'fidgeting'])
    expect(picks.map((m) => m.fidget)).toEqual(['stretch', 'stretch', 'lookAround', 'lookAround'])
    expect(picks.every((m) => m.place === 'sofa')).toBe(true)
    // The pointer interrupts the fidget; left alone, the fidget ends in rest. Both on the sofa.
    expect(transition(picks[0], { type: 'pointerMove' }, 24_000)).toMatchObject({ state: 'watching', place: 'sofa', fidget: null })
    expect(transition(picks[0], { type: 'clipFinished' }, 26_400)).toMatchObject({ state: 'resting', place: 'sofa', fidget: null })
  })

  it('does not wave again within eight seconds on the sofa either', () => {
    let m = transition(onSofa, { type: 'pointerMove' }, 20_000)
    m = transition(m, tick(21_200), 21_200)
    m = transition(m, { type: 'clipFinished' }, 23_400, () => 0)
    m = transition(m, { type: 'clipFinished' }, 26_400)
    m = transition(m, { type: 'pointerMove' }, 27_000)
    const again = transition(m, tick(28_200), 28_200, () => 0.6)
    expect(again).toMatchObject({ state: 'fidgeting', fidget: 'lookAround', place: 'sofa', lastGreetAt: 21_200 })
    const later = transition(transition(m, { type: 'pointerMove' }, 28_100), tick(29_300), 29_300)
    expect(later).toMatchObject({ state: 'greeting', place: 'sofa' })
  })

  it('hurries back when the chat is touched', () => {
    const waitingThere = [
      onSofa,
      transition(onSofa, { type: 'pointerMove' }, 20_000),
      onSofaIn('greeting'),
      onSofaIn('fidgeting', { fidget: 'lookAround' }),
    ]
    expect(waitingThere.map((m) => m.state)).toEqual(['resting', 'watching', 'greeting', 'fidgeting'])
    for (const m of [...waitingThere, going]) {
      const next = transition(m, { type: 'chatActivity' }, T0 + 500)
      expect(next, m.state).toMatchObject({ state: 'rushingToDesk', place: 'desk', queued: null, fidget: null, enteredAt: T0 + 500 })
    }
  })

  it('hurries back for a task started without typing', () => {
    expect(transition(onSofa, { type: 'taskStarted' }, 20_000)).toMatchObject({ state: 'rushingToDesk', queued: 'work' })
    expect(transition(going, { type: 'taskStarted' }, 12_000)).toMatchObject({ state: 'rushingToDesk', queued: 'work', place: 'desk' })
    for (const state of ['watching', 'greeting', 'fidgeting'] as const) {
      expect(transition(onSofaIn(state), { type: 'taskStarted' }, T0 + 1)).toMatchObject({
        state: 'rushingToDesk',
        queued: 'work',
        place: 'desk',
        fidget: null,
      })
    }
  })

  it('acts on the task once it is seated', () => {
    const rushing = transition(onSofa, { type: 'taskStarted' }, 20_000)
    const cases: [CharMachine, CharState][] = [
      [rushing, 'working'],
      [transition(rushing, { type: 'taskDone' }, 21_000), 'standingUp'],
      [transition(rushing, { type: 'taskFailed' }, 21_000), 'error'],
      [transition(rushing, { type: 'taskCancelled' }, 21_000), 'resting'],
      [transition(onSofa, { type: 'chatActivity' }, 20_000), 'resting'],
    ]
    for (const [m, state] of cases) {
      expect(transition(m, { type: 'clipFinished' }, 23_500)).toMatchObject({ state, place: 'desk', queued: null, enteredAt: 23_500 })
    }
  })

  it('follows the queued task while it runs', () => {
    const rushing = transition(onSofa, { type: 'taskStarted' }, 20_000)
    expect(transition(rushing, { type: 'taskDone' }, 21_000)).toEqual({ ...rushing, queued: 'done' })
    expect(transition(rushing, { type: 'taskFailed' }, 21_000)).toEqual({ ...rushing, queued: 'failed' })
    expect(transition(rushing, { type: 'taskCancelled' }, 21_000)).toEqual({ ...rushing, queued: null })
    expect(transition(rushing, { type: 'taskStarted' }, 21_000)).toBe(rushing)
    // With nothing queued, what an earlier task comes to is nothing to it.
    const called = transition(onSofa, { type: 'chatActivity' }, 20_000)
    for (const type of ['taskDone', 'taskFailed', 'taskCancelled'] as const) expect(transition(called, { type }, 21_000)).toBe(called)
    // A prompt sent while it runs is queued like any other.
    expect(transition(called, { type: 'taskStarted' }, 21_000)).toEqual({ ...called, queued: 'work' })
  })

  it('lets a new task take the place of a result it has not begun to bring out', () => {
    const rushing = transition(onSofa, { type: 'taskStarted' }, 20_000)
    const done = transition(rushing, { type: 'taskDone' }, 21_000)
    const next = transition(done, { type: 'taskStarted' }, 21_500)
    expect(next).toEqual({ ...rushing, queued: 'work' })
    expect(transition(next, { type: 'clipFinished' }, 23_500).state).toBe('working')
  })

  it('keeps running whatever else happens: the chat, the pointer, the sofa leaving the view', () => {
    const rushing = transition(onSofa, { type: 'chatActivity' }, 20_000)
    expect(transition(rushing, { type: 'chatActivity' }, 20_500)).toBe(rushing)
    expect(transition(rushing, tick(60_000), 60_000)).toBe(rushing)
    expect(transition(rushing, tick(60_000, false), 60_000)).toBe(rushing)
    expect(transition(rushing, { type: 'pointerMove' }, 20_500)).toEqual({ ...rushing, lastPointerAt: 20_500 })
    expect(transition(rushing, { type: 'viewerClosed' }, 20_500)).toBe(rushing)
  })

  it('comes back when the sofa leaves the view', () => {
    expect(transition(onSofa, tick(30_000, false), 30_000).state).toBe('rushingToDesk')
    expect(transition(going, tick(12_000, false), 12_000)).toMatchObject({ state: 'rushingToDesk', place: 'desk', queued: null })
    for (const state of ['watching', 'greeting', 'fidgeting'] as const) {
      expect(transition(onSofaIn(state), tick(T0 + 1, false), T0 + 1)).toMatchObject({ state: 'rushingToDesk', place: 'desk' })
    }
    // On its way with the sofa in view it simply goes on.
    expect(transition(going, tick(12_000), 12_000)).toBe(going)
  })

  it('counts the wait from when it is back at rest', () => {
    const back: [CharMachine, CharEvent][] = [
      [machineIn('returning'), { type: 'clipFinished' }],
      [machineIn('error'), { type: 'clipFinished' }],
      [machineIn('working'), { type: 'taskCancelled' }],
      [machineIn('rushingToDesk'), { type: 'clipFinished' }],
    ]
    for (const [m, e] of back) {
      const rested = transition(m, e, T0 + 50_000)
      expect(rested, m.state).toMatchObject({ state: 'resting', place: 'desk', idleSince: T0 + 50_000 })
      expect(transition(rested, tick(T0 + 59_999), T0 + 59_999)).toBe(rested)
      expect(transition(rested, tick(T0 + 60_000), T0 + 60_000).state).toBe('goingToSofa')
    }
  })

  it('goes back to the sofa ten seconds after it has run to the desk for nothing', () => {
    let m = transition(onSofa, { type: 'chatActivity' }, 20_000)
    m = transition(m, { type: 'clipFinished' }, 23_400)
    expect(m).toMatchObject({ state: 'resting', place: 'desk', idleSince: 23_400 })
    expect(transition(m, tick(33_399), 33_399).state).toBe('resting')
    expect(transition(m, tick(33_400), 33_400).state).toBe('goingToSofa')
  })
})

describe('chat input at the desk', () => {
  it.each(WAITING)('only starts the count again while %s', (state) => {
    const m = machineIn(state, state === 'fidgeting' ? { fidget: 'tap' } : {})
    expect(transition(m, { type: 'chatActivity' }, T0 + 4_000)).toEqual({ ...m, idleSince: T0 + 4_000 })
  })

  it('does not cut a sip short, and leaves a task queued behind it where it is', () => {
    const sipping = machineIn('fidgeting', { fidget: 'sip', queued: 'work' })
    expect(transition(sipping, { type: 'chatActivity' }, T0 + 4_000)).toEqual({ ...sipping, idleSince: T0 + 4_000 })
  })

  it('counts for a wait that goes on after a wave: ten seconds from the input, not from before the wave', () => {
    let m = transition(initialMachine(0), { type: 'pointerMove' }, 8_000)
    m = transition(m, tick(9_200), 9_200)
    expect(m.state).toBe('greeting')
    m = transition(m, { type: 'chatActivity' }, 9_500)
    m = transition(m, { type: 'clipFinished' }, 11_400, () => 0.99)
    m = transition(m, { type: 'clipFinished' }, 13_400)
    expect(m).toMatchObject({ state: 'resting', idleSince: 9_500 })
    expect(transition(m, tick(19_499), 19_499).state).toBe('resting')
    expect(transition(m, tick(19_500), 19_500).state).toBe('goingToSofa')
  })

  it('returns the same machine when the count already starts at that moment', () => {
    const m = machineIn('resting')
    expect(transition(m, { type: 'chatActivity' }, T0)).toBe(m)
  })

  it.each(['working', 'standingUp', 'walkingOut', 'handingFile', 'returning', 'error'] as const)(
    'is nothing to a character that is %s: its wait starts when it is back at rest',
    (state) => {
      const m = machineIn(state)
      expect(transition(m, { type: 'chatActivity' }, T0 + 4_000)).toBe(m)
    },
  )
})

describe('enteredAt', () => {
  it.each<[CharState, EventType, CharState]>([
    ['resting', 'pointerMove', 'watching'],
    ['watching', 'tick', 'greeting'],
    ['greeting', 'clipFinished', 'fidgeting'],
    ['fidgeting', 'clipFinished', 'resting'],
    ['fidgeting', 'pointerMove', 'watching'],
    ['resting', 'taskStarted', 'working'],
    ['working', 'taskDone', 'standingUp'],
    ['working', 'taskCancelled', 'resting'],
    ['working', 'taskFailed', 'error'],
    ['standingUp', 'clipFinished', 'walkingOut'],
    ['walkingOut', 'clipFinished', 'handingFile'],
    ['handingFile', 'viewerClosed', 'returning'],
    ['returning', 'clipFinished', 'resting'],
    ['error', 'clipFinished', 'resting'],
    ['error', 'taskStarted', 'working'],
    ['goingToSofa', 'clipFinished', 'resting'],
    ['goingToSofa', 'chatActivity', 'rushingToDesk'],
    ['goingToSofa', 'taskStarted', 'rushingToDesk'],
    ['rushingToDesk', 'clipFinished', 'resting'],
  ])('%s + %s → %s stamps the entry time', (from, type, to) => {
    const now = T0 + 4321
    const next = transition(machineIn(from), event(type, now), now)
    expect(next.state).toBe(to)
    expect(next.enteredAt).toBe(now)
  })
})

describe('every state and event pair', () => {
  // The complete table for a machine with nothing queued, shortly after it entered the
  // state (so no still-timer has run out and the ten seconds are not over). Pairs that
  // are not listed have no transition.
  const AT_THE_DESK: Record<CharState, Partial<Record<EventType, CharState>>> = {
    resting: { pointerMove: 'watching', taskStarted: 'working', chatActivity: 'resting' },
    watching: { pointerMove: 'watching', taskStarted: 'working', chatActivity: 'watching' },
    greeting: { pointerMove: 'greeting', taskStarted: 'working', clipFinished: 'fidgeting', chatActivity: 'greeting' },
    fidgeting: { pointerMove: 'watching', taskStarted: 'working', clipFinished: 'resting', chatActivity: 'fidgeting' },
    working: {
      pointerMove: 'working',
      taskDone: 'standingUp',
      taskCancelled: 'resting',
      taskFailed: 'error',
    },
    standingUp: { pointerMove: 'standingUp', taskStarted: 'returning', clipFinished: 'walkingOut' },
    walkingOut: { pointerMove: 'walkingOut', taskStarted: 'returning', clipFinished: 'handingFile' },
    handingFile: { pointerMove: 'handingFile', taskStarted: 'returning', viewerClosed: 'returning' },
    returning: { pointerMove: 'returning', taskStarted: 'returning', clipFinished: 'resting' },
    error: { pointerMove: 'error', taskStarted: 'working', clipFinished: 'resting' },
    goingToSofa: {
      pointerMove: 'goingToSofa',
      taskStarted: 'rushingToDesk',
      clipFinished: 'resting',
      chatActivity: 'rushingToDesk',
    },
    rushingToDesk: { pointerMove: 'rushingToDesk', taskStarted: 'rushingToDesk', clipFinished: 'resting' },
  }
  /** The same on the sofa, where only the four waiting states are ever found. */
  const ON_THE_SOFA: Partial<Record<CharState, Partial<Record<EventType, CharState>>>> = {
    resting: { pointerMove: 'watching', taskStarted: 'rushingToDesk', chatActivity: 'rushingToDesk' },
    watching: { pointerMove: 'watching', taskStarted: 'rushingToDesk', chatActivity: 'rushingToDesk' },
    greeting: {
      pointerMove: 'greeting',
      taskStarted: 'rushingToDesk',
      clipFinished: 'fidgeting',
      chatActivity: 'rushingToDesk',
    },
    fidgeting: {
      pointerMove: 'watching',
      taskStarted: 'rushingToDesk',
      clipFinished: 'resting',
      chatActivity: 'rushingToDesk',
    },
  }
  /** The states whose entry leaves something queued: the task that called the character back. */
  const QUEUES: readonly CharState[] = ['returning', 'rushingToDesk']

  const pairs = STATES.flatMap((state) => EVENT_TYPES.map((type) => [state, type] as const))
  const now = T0 + 10

  it.each(pairs)('at the desk: %s + %s', (state, type) => {
    const m = machineIn(state)
    const next = transition(m, event(type, now), now, () => 0)
    const expected = AT_THE_DESK[state][type]

    if (expected === undefined) {
      expect(next).toBe(m)
      return
    }
    expect(next).not.toBe(m)
    expect(next.state).toBe(expected)
    expect(next.fidget).toBe(expected === 'fidgeting' ? (state === 'fidgeting' ? 'stretch' : 'sip') : null)
    expect(next.enteredAt).toBe(expected === state ? T0 : now)
    if (!QUEUES.includes(expected)) expect(next.queued).toBeNull()
    // Only arriving puts the character on the sofa.
    expect(next.place).toBe(state === 'goingToSofa' && type === 'clipFinished' ? 'sofa' : 'desk')
  })

  const sofaPairs = WAITING.flatMap((state) => EVENT_TYPES.map((type) => [state, type] as const))

  it.each(sofaPairs)('on the sofa: %s + %s', (state, type) => {
    const m = onSofaIn(state)
    const next = transition(m, event(type, now), now, () => 0)
    const expected = ON_THE_SOFA[state]?.[type]

    if (expected === undefined) {
      expect(next).toBe(m)
      return
    }
    expect(next).not.toBe(m)
    expect(next.state).toBe(expected)
    expect(next.fidget).toBe(expected === 'fidgeting' ? 'stretch' : null)
    expect(next.enteredAt).toBe(expected === state ? T0 : now)
    // It is on the sofa for as long as it waits there, and no longer.
    expect(next.place).toBe(WAITING.includes(expected) ? 'sofa' : 'desk')
  })

  it('finds the character on the sofa in no other state than the four it waits in', () => {
    // From every state at the desk and every waiting state on the sofa, with every event, at a time when every timer has run out.
    const late = T0 + 60_000
    const machines = [
      ...STATES.flatMap((state) => [null, 'work', 'done', 'failed'].map((queued) => machineIn(state, { queued: queued as CharMachine['queued'] }))),
      ...WAITING.map((state) => onSofaIn(state)),
      machineIn('fidgeting', { fidget: 'sip' }),
    ]
    for (const m of machines) {
      for (const type of EVENT_TYPES) {
        for (const e of type === 'tick' ? [tick(late), tick(late, false)] : [event(type, late)]) {
          const next = transition(m, e, late, () => 0.6)
          if (next.place === 'sofa') expect(WAITING, `${m.state} at the ${m.place} + ${type}`).toContain(next.state)
        }
      }
    }
  })
})
