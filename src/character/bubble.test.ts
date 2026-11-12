import { describe, expect, it } from 'vitest'
import { MESSAGES, STEP_MESSAGES } from '../agent/messages'
import { CHARACTER_HEIGHT, HANDOFF_POS, SEAT_GROUND_POS } from '../scene/layout'
import {
  badgeForState,
  bubbleAnchorAt,
  bubbleFor,
  bubbleLift,
  CANCEL_BUBBLE_MS,
  type BubbleContext,
} from './bubble'
import { SEAT_LIFT } from './clips/shared'
import type { CharMachine, CharState } from './stateMachine'
import type { BadgeStatus } from './StatusBadge'

type Queued = CharMachine['queued']

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
const QUEUED: readonly Queued[] = [null, 'work', 'done', 'failed']
const SEATED_IDLE: readonly CharState[] = ['resting', 'watching', 'greeting', 'fidgeting']

function context(patch: Partial<BubbleContext> = {}): BubbleContext {
  return { state: 'resting', queued: null, message: null, sinceCancel: null, ...patch }
}

describe('badgeForState', () => {
  it.each<[CharState, BadgeStatus]>([
    ['resting', 'idle'],
    ['watching', 'idle'],
    ['greeting', 'idle'],
    ['fidgeting', 'idle'],
    ['working', 'working'],
    ['standingUp', 'done'],
    ['walkingOut', 'done'],
    ['handingFile', 'done'],
    ['error', 'error'],
  ])('shows %s as %s, whatever is queued', (state, badge) => {
    for (const queued of QUEUED) expect(badgeForState(state, queued)).toBe(badge)
  })

  it.each<[Queued, BadgeStatus]>([
    ['work', 'working'],
    ['done', 'done'],
    ['failed', 'error'],
    [null, 'idle'],
  ])('on the way back with %s queued shows %s', (queued, badge) => {
    expect(badgeForState('returning', queued)).toBe(badge)
  })
})

describe('bubbleFor', () => {
  it('says nothing while idle', () => {
    for (const state of SEATED_IDLE) expect(bubbleFor(context({ state }))).toEqual([])
  })

  it("says the running task's progress line while working", () => {
    for (const message of Object.values(STEP_MESSAGES)) {
      expect(bubbleFor(context({ state: 'working', message }))).toEqual([message])
    }
  })

  it('says nothing while working on a task that has not reported a step yet', () => {
    expect(bubbleFor(context({ state: 'working', message: null }))).toEqual([])
  })

  it('keeps reporting progress on the way back to the desk when the next task is already running', () => {
    const message = STEP_MESSAGES.searching
    expect(bubbleFor(context({ state: 'returning', queued: 'work', message }))).toEqual([message])
    expect(bubbleFor(context({ state: 'returning', queued: 'work', message: null }))).toEqual([])
  })

  it.each<Queued>([null, 'done', 'failed'])('says nothing on the way back with %s queued', (queued) => {
    // A task's last progress line outlives the task; it must not be repeated here.
    expect(bubbleFor(context({ state: 'returning', queued, message: STEP_MESSAGES.writing }))).toEqual([])
  })

  it.each<CharState>(['standingUp', 'walkingOut'])('announces the result while %s', (state) => {
    expect(bubbleFor(context({ state }))).toEqual(['The research is ready.'])
  })

  it('says both lines while handing the file over', () => {
    expect(bubbleFor(context({ state: 'handingFile' }))).toEqual(['The research is ready.', 'Let me hand you the file.'])
    expect(bubbleFor(context({ state: 'handingFile' }))).toEqual([...MESSAGES.done])
  })

  it('reports an error by the state, not by the last progress line the failed task left behind', () => {
    expect(bubbleFor(context({ state: 'error', message: STEP_MESSAGES.comparing }))).toEqual(['Something went wrong.'])
  })

  it('says it is stopping for two seconds after a cancellation', () => {
    expect(CANCEL_BUBBLE_MS).toBe(2000)
    for (const state of SEATED_IDLE) {
      expect(bubbleFor(context({ state, sinceCancel: 0 }))).toEqual(['Okay, stopping.'])
      expect(bubbleFor(context({ state, sinceCancel: 1999 }))).toEqual(['Okay, stopping.'])
      expect(bubbleFor(context({ state, sinceCancel: 2000 }))).toEqual([])
      expect(bubbleFor(context({ state, sinceCancel: 60_000 }))).toEqual([])
    }
  })

  it('says it is stopping when the task cancelled was the one queued on the way back', () => {
    expect(bubbleFor(context({ state: 'returning', queued: null, sinceCancel: 500 }))).toEqual([MESSAGES.cancel])
  })

  it('drops the stopping line as soon as a new task is being worked on', () => {
    const message = STEP_MESSAGES.reading
    expect(bubbleFor(context({ state: 'working', message, sinceCancel: 500 }))).toEqual([message])
    expect(bubbleFor(context({ state: 'working', message: null, sinceCancel: 500 }))).toEqual([])
    expect(bubbleFor(context({ state: 'returning', queued: 'work', message, sinceCancel: 500 }))).toEqual([message])
  })

  it.each<[CharState, readonly string[]]>([
    ['standingUp', [MESSAGES.done[0]]],
    ['walkingOut', [MESSAGES.done[0]]],
    ['handingFile', MESSAGES.done],
    ['error', [MESSAGES.error]],
  ])('lets what it is doing while %s outrank the stopping line', (state, lines) => {
    expect(bubbleFor(context({ state, sinceCancel: 100 }))).toEqual(lines)
  })

  it('hands out its own list each time, safe to keep', () => {
    const first = bubbleFor(context({ state: 'handingFile' }))
    expect(first).not.toBe(MESSAGES.done)
    expect(bubbleFor(context({ state: 'handingFile' }))).not.toBe(first)
  })

  it('only ever says the lines the product defines', () => {
    const allowed = new Set<string>([...MESSAGES.done, MESSAGES.cancel, MESSAGES.error, 'a progress line'])
    for (const state of STATES) {
      for (const queued of QUEUED) {
        for (const sinceCancel of [null, 0, 5000]) {
          for (const message of [null, 'a progress line']) {
            for (const line of bubbleFor({ state, queued, message, sinceCancel })) expect(allowed).toContain(line)
          }
        }
      }
    }
  })
})

describe('bubbleLift', () => {
  it.each<CharState>(['resting', 'watching', 'greeting', 'fidgeting', 'working', 'error'])(
    'is the height of the seat while %s',
    (state) => {
      expect(bubbleLift(state, false)).toBe(SEAT_LIFT)
    },
  )

  it.each<CharState>(['standingUp', 'walkingOut', 'handingFile', 'returning'])('is zero while %s, on its feet', (state) => {
    expect(bubbleLift(state, false)).toBe(0)
  })

  it('rises again once the character sits back down', () => {
    expect(bubbleLift('returning', true)).toBe(SEAT_LIFT)
  })
})

describe('bubbleAnchorAt', () => {
  it('sits beside the top of the head, on the right as the camera sees it', () => {
    const [x, y, z] = bubbleAnchorAt(HANDOFF_POS, 0)
    expect(x).toBeGreaterThan(HANDOFF_POS[0] + 0.2)
    expect(x).toBeLessThan(HANDOFF_POS[0] + 0.5)
    expect(y).toBeGreaterThan(CHARACTER_HEIGHT * 0.9)
    expect(y).toBeLessThan(CHARACTER_HEIGHT * 1.2)
    expect(z).toBe(HANDOFF_POS[2])
  })

  it('moves with the character and rises by the lift', () => {
    const standing = bubbleAnchorAt(HANDOFF_POS, 0)
    const seated = bubbleAnchorAt(SEAT_GROUND_POS, SEAT_LIFT)
    expect(seated[0] - standing[0]).toBeCloseTo(SEAT_GROUND_POS[0] - HANDOFF_POS[0])
    expect(seated[1] - standing[1]).toBeCloseTo(SEAT_LIFT)
    expect(seated[2] - standing[2]).toBeCloseTo(SEAT_GROUND_POS[2] - HANDOFF_POS[2])
  })

  it('writes into the tuple it is given', () => {
    const anchor: [number, number, number] = [9, 9, 9]
    expect(bubbleAnchorAt(SEAT_GROUND_POS, SEAT_LIFT, anchor)).toBe(anchor)
    expect(anchor).toEqual(bubbleAnchorAt(SEAT_GROUND_POS, SEAT_LIFT))
  })
})
