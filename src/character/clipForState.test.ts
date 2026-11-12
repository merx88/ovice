import { describe, expect, it } from 'vitest'
import type { AgentStep } from '../store/tasks'
import { clipAwaitedBy, clipForState, clipSpeedFor, WALK_PACE } from './clipForState'
import { CLIP_NAMES, CLIPS, type ClipName } from './clips'
import { FIDGETS, initialMachine, transition, type CharMachine, type CharState, type FidgetKind } from './stateMachine'

const STEPS: readonly (AgentStep | null)[] = [null, 'reading', 'searching', 'comparing', 'writing']
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

describe('clipForState', () => {
  it.each<[CharState, ClipName]>([
    ['resting', 'idle'],
    ['watching', 'idle'],
    ['greeting', 'wave'],
    ['standingUp', 'standUp'],
    ['walkingOut', 'walk'],
    ['handingFile', 'holdFile'],
    ['returning', 'walk'],
    ['error', 'scratchHead'],
  ])('plays the same clip while %s whatever the task is doing: %s', (state, clip) => {
    for (const step of STEPS) expect(clipForState(state, null, step)).toBe(clip)
  })

  it.each<[AgentStep | null, ClipName]>([
    [null, 'think'],
    ['reading', 'think'],
    ['searching', 'typing'],
    ['comparing', 'think'],
    ['writing', 'typing'],
  ])('while working on step %s plays %s', (step, clip) => {
    expect(clipForState('working', null, step)).toBe(clip)
  })

  it.each<FidgetKind>(['sip', 'stretch', 'lookAround', 'tap'])('plays the %s clip for that fidget', (fidget) => {
    expect(clipForState('fidgeting', fidget, null)).toBe(fidget)
    expect(clipForState('fidgeting', fidget, 'writing')).toBe(fidget)
  })

  it('has a clip for every fidget the machine can pick', () => {
    for (const fidget of FIDGETS) expect(CLIPS[clipForState('fidgeting', fidget, null)]).toBeDefined()
  })

  it('idles when asked to fidget without a fidget', () => {
    expect(clipForState('fidgeting', null, null)).toBe('idle')
  })

  it('ignores a fidget left over in any other state', () => {
    expect(clipForState('resting', 'sip', null)).toBe('idle')
    expect(clipForState('working', 'tap', 'searching')).toBe('typing')
  })
})

describe('clipAwaitedBy', () => {
  it.each<[CharState, ClipName]>([
    ['greeting', 'wave'],
    ['standingUp', 'standUp'],
    ['error', 'scratchHead'],
  ])('lets %s end with its own clip, %s', (state, clip) => {
    expect(clipAwaitedBy(state, null)).toBe(clip)
    expect(clipForState(state, null, null)).toBe(clip)
  })

  it.each<FidgetKind>(['sip', 'stretch', 'lookAround', 'tap'])('lets the %s fidget end with its own clip', (fidget) => {
    expect(clipAwaitedBy('fidgeting', fidget)).toBe(fidget)
  })

  it('waits for the character to sit back down on the way back, not for the walk', () => {
    expect(clipAwaitedBy('returning', null)).toBe('sitDown')
    expect(clipForState('returning', null, null)).toBe('walk')
  })

  it.each<CharState>(['resting', 'watching', 'working', 'walkingOut', 'handingFile'])('waits for no clip while %s', (state) => {
    for (const fidget of [null, ...FIDGETS]) expect(clipAwaitedBy(state, fidget)).toBeNull()
  })

  it('only ever waits for clips that end, and never shows a clip that ends without waiting for it', () => {
    for (const state of STATES) {
      for (const fidget of FIDGETS) {
        const awaited = clipAwaitedBy(state, fidget)
        if (awaited !== null) expect(CLIPS[awaited].duration).not.toBeNull()
        const shown = clipForState(state, fidget, null)
        // A clip that ended unnoticed would leave the character frozen in its last pose.
        if (CLIPS[shown].duration !== null) expect(awaited).toBe(shown)
      }
    }
  })

  it('agrees with the machine about which states the end of a clip moves on', () => {
    const inState = (state: CharState): CharMachine => ({
      ...initialMachine(0),
      state,
      fidget: state === 'fidgeting' ? 'sip' : null,
    })
    for (const state of STATES) {
      const machine = inState(state)
      const movesOn = transition(machine, { type: 'clipFinished' }, 10) !== machine
      // The walk out has no end of its own: its arrival is reported in a clip's place.
      const expected = state === 'walkingOut' ? true : clipAwaitedBy(state, machine.fidget) !== null
      expect(movesOn, state).toBe(expected)
    }
  })
})

describe('clipSpeedFor', () => {
  it('plays the walk as much faster as the character is moved faster', () => {
    expect(WALK_PACE).toBeCloseTo(1.5)
    expect(clipSpeedFor('walk')).toBe(WALK_PACE)
  })

  it('plays every other clip at the pace it was written at', () => {
    for (const clip of CLIP_NAMES) if (clip !== 'walk') expect(clipSpeedFor(clip)).toBe(1)
  })
})
