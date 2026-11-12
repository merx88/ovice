import { describe, expect, it } from 'vitest'
import { BODY_MAX_YAW, GREET_INTERVAL_MS, HEAD_MAX_YAW, POINTER_STILL_MS } from './constants'
import { FIDGETS, initialMachine, transition } from './stateMachine'
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
]

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
]

function event(type: EventType, now = T0): CharEvent {
  return type === 'tick' ? { type, now } : { type }
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
  })
})

describe('initialMachine', () => {
  it('starts resting with nothing queued and the first greeting allowed', () => {
    expect(initialMachine(T0)).toEqual({
      state: 'resting',
      fidget: null,
      queued: null,
      lastPointerAt: T0,
      lastGreetAt: -Infinity,
      enteredAt: T0,
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

  it('resting + tick never changes state, however long the pointer has been still', () => {
    const m = machineIn('resting')
    expect(transition(m, event('tick'), T0 + POINTER_STILL_MS)).toBe(m)
    expect(transition(m, event('tick'), T0 + 10 * 60 * 1000)).toBe(m)
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
    expect(transition(m, { type: 'tick', now: T0 + 60_000 }, T0 + 1199)).toBe(m)
    expect(transition(m, { type: 'tick', now: T0 }, T0 + 1200).state).toBe('greeting')
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

  it.each(['greeting', 'working', 'standingUp', 'walkingOut', 'handingFile', 'returning', 'error'] as const)(
    'changes only lastPointerAt in %s',
    (state) => {
      const m = machineIn(state, state === 'returning' ? { queued: 'work' } : {})
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
  ])('%s + %s → %s stamps the entry time', (from, type, to) => {
    const now = T0 + 4321
    const next = transition(machineIn(from), event(type, now), now)
    expect(next.state).toBe(to)
    expect(next.enteredAt).toBe(now)
  })
})

describe('every state and event pair', () => {
  // The complete table for a machine with nothing queued, shortly after it entered the
  // state (so no still-timer has run out). Pairs that are not listed have no transition.
  const TABLE: Record<CharState, Partial<Record<EventType, CharState>>> = {
    resting: { pointerMove: 'watching', taskStarted: 'working' },
    watching: { pointerMove: 'watching', taskStarted: 'working' },
    greeting: { pointerMove: 'greeting', taskStarted: 'working', clipFinished: 'fidgeting' },
    fidgeting: { pointerMove: 'watching', taskStarted: 'working', clipFinished: 'resting' },
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
  }

  const pairs = STATES.flatMap((state) => EVENT_TYPES.map((type) => [state, type] as const))
  const now = T0 + 10

  it.each(pairs)('%s + %s', (state, type) => {
    const m = machineIn(state)
    const next = transition(m, event(type, now), now, () => 0)
    const expected = TABLE[state][type]

    if (expected === undefined) {
      expect(next).toBe(m)
      return
    }
    expect(next).not.toBe(m)
    expect(next.state).toBe(expected)
    expect(next.fidget).toBe(expected === 'fidgeting' ? 'sip' : null)
    expect(next.enteredAt).toBe(expected === state ? T0 : now)
    if (expected !== 'returning') expect(next.queued).toBeNull()
  })
})
