import { describe, expect, it } from 'vitest'
import type { AgentStep } from '../store/tasks'
import {
  clipAwaitedBy,
  clipForState,
  clipSpeedFor,
  clipToPlay,
  isThinkingStep,
  phaseAfterClip,
  RUN_PACE,
  WALK_PACE,
  type TravelPhase,
} from './clipForState'
import { CLIP_NAMES, CLIPS, type ClipName } from './clips'
import { LOUNGE_CLIPS } from './clips/lounge'
import {
  FIDGETS,
  initialMachine,
  SOFA_FIDGETS,
  transition,
  type CharMachine,
  type CharState,
  type FidgetKind,
  type Place,
} from './stateMachine'

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
  'goingToSofa',
  'rushingToDesk',
]
const WAITING: readonly CharState[] = ['resting', 'watching', 'greeting', 'fidgeting']
const PLACES: readonly Place[] = ['desk', 'sofa']
const PHASES: readonly TravelPhase[] = ['landing', 'rising', 'moving', 'settling']
/** The states that are a way from one place to another, with a clip for each phase of it. */
const JOURNEYS: readonly CharState[] = ['returning', 'goingToSofa', 'rushingToDesk']

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
    ['goingToSofa', 'walk'],
    ['rushingToDesk', 'run'],
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

describe('isThinkingStep', () => {
  it.each<[AgentStep | null, boolean]>([
    [null, true],
    ['reading', true],
    ['searching', false],
    ['comparing', true],
    ['writing', false],
  ])('for step %s is %s', (step, thinking) => {
    expect(isThinkingStep(step)).toBe(thinking)
  })

  it('is true for exactly the steps the character thinks through at its laptop', () => {
    for (const step of STEPS) expect(isThinkingStep(step)).toBe(clipForState('working', null, step) === 'think')
  })
})

describe('clipToPlay', () => {
  it('walks back to the chair and sits down once there', () => {
    expect(clipToPlay('returning', null, null, 'desk', 'moving')).toBe('walk')
    expect(clipToPlay('returning', null, null, 'desk', 'settling')).toBe('sitDown')
  })

  it('sits down with the clip the way back waits for, so that the character can move on', () => {
    expect(clipToPlay('returning', null, 'searching', 'desk', 'settling')).toBe(clipAwaitedBy('returning', null, 'desk'))
  })

  it.each<[CharState, FidgetKind | null, ClipName]>([
    ['resting', null, 'loungeIdle'],
    ['watching', null, 'loungeIdle'],
    ['greeting', null, 'loungeWave'],
    ['fidgeting', 'stretch', 'loungeStretch'],
    ['fidgeting', 'lookAround', 'loungeLookAround'],
    ['fidgeting', null, 'loungeIdle'],
  ])('shows a character that is %s on the sofa (fidget: %s) lounging: %s', (state, fidget, clip) => {
    for (const step of STEPS) for (const phase of PHASES) expect(clipToPlay(state, fidget, step, 'sofa', phase)).toBe(clip)
    expect(LOUNGE_CLIPS).toContain(clip)
  })

  it('has a lounging clip for every fidget the machine can pick on the sofa', () => {
    for (const fidget of SOFA_FIDGETS) expect(LOUNGE_CLIPS).toContain(clipToPlay('fidgeting', fidget, null, 'sofa', 'moving'))
  })

  it('always shows a sip as the sip, wherever the character is and whatever phase is left over', () => {
    for (const place of PLACES) {
      for (const phase of PHASES) for (const step of STEPS) expect(clipToPlay('fidgeting', 'sip', step, place, phase)).toBe('sip')
      expect(clipAwaitedBy('fidgeting', 'sip', place)).toBe('sip')
    }
  })

  it.each<[TravelPhase, ClipName]>([
    ['rising', 'standUp'],
    ['moving', 'walk'],
    ['settling', 'hopOn'],
  ])('on the way to the sofa, while %s, plays %s', (phase, clip) => {
    for (const step of STEPS) expect(clipToPlay('goingToSofa', null, step, 'desk', phase)).toBe(clip)
  })

  it.each<[TravelPhase, ClipName]>([
    ['landing', 'hopOn'],
    ['rising', 'hopOff'],
    ['moving', 'run'],
    ['settling', 'sitDown'],
  ])('on the run back to the desk, while %s, plays %s', (phase, clip) => {
    for (const step of STEPS) expect(clipToPlay('rushingToDesk', null, step, 'desk', phase)).toBe(clip)
  })

  it('is the clip of the state everywhere else, wherever the character is and whatever phase is left over', () => {
    for (const state of STATES) {
      if (JOURNEYS.includes(state)) continue
      for (const fidget of [null, ...FIDGETS]) {
        for (const step of STEPS) {
          for (const phase of PHASES) {
            expect(clipToPlay(state, fidget, step, 'desk', phase)).toBe(clipForState(state, fidget, step))
            // Only waiting is done differently on the sofa.
            if (!WAITING.includes(state)) expect(clipToPlay(state, fidget, step, 'sofa', phase)).toBe(clipForState(state, fidget, step))
          }
        }
      }
    }
  })
})

describe('phaseAfterClip', () => {
  it('gets up before it walks to the sofa', () => {
    expect(phaseAfterClip('goingToSofa', 'rising')).toBe('moving')
  })

  it('finishes a hop onto the sofa, hops off, and only then runs', () => {
    expect(phaseAfterClip('rushingToDesk', 'landing')).toBe('rising')
    expect(phaseAfterClip('rushingToDesk', 'rising')).toBe('moving')
  })

  it('names no next phase where arriving ends the phase, or where the clip that ends is the end of the state', () => {
    for (const state of STATES) {
      for (const phase of PHASES) {
        const ends =
          (state === 'goingToSofa' && phase === 'rising') ||
          (state === 'rushingToDesk' && (phase === 'landing' || phase === 'rising'))
        if (!ends) expect(phaseAfterClip(state, phase), `${state}, ${phase}`).toBeNull()
      }
    }
  })
})

describe('clipAwaitedBy', () => {
  it.each<[CharState, ClipName]>([
    ['greeting', 'wave'],
    ['standingUp', 'standUp'],
    ['error', 'scratchHead'],
  ])('lets %s end with its own clip, %s', (state, clip) => {
    expect(clipAwaitedBy(state, null, 'desk')).toBe(clip)
    expect(clipForState(state, null, null)).toBe(clip)
  })

  it.each<FidgetKind>(['sip', 'stretch', 'lookAround', 'tap'])('lets the %s fidget end with its own clip', (fidget) => {
    expect(clipAwaitedBy('fidgeting', fidget, 'desk')).toBe(fidget)
  })

  it('lets a wave and a fidget on the sofa end with their lounging clips', () => {
    expect(clipAwaitedBy('greeting', null, 'sofa')).toBe('loungeWave')
    expect(clipAwaitedBy('fidgeting', 'stretch', 'sofa')).toBe('loungeStretch')
    expect(clipAwaitedBy('fidgeting', 'lookAround', 'sofa')).toBe('loungeLookAround')
  })

  it('waits for the character to sit back down on the way back, not for the walk', () => {
    expect(clipAwaitedBy('returning', null, 'desk')).toBe('sitDown')
    expect(clipForState('returning', null, null)).toBe('walk')
  })

  it('waits for the hop onto the sofa on the way there, and for the character to sit down at its desk on the run back', () => {
    expect(clipAwaitedBy('goingToSofa', null, 'desk')).toBe('hopOn')
    expect(clipAwaitedBy('rushingToDesk', null, 'desk')).toBe('sitDown')
  })

  it.each<CharState>(['resting', 'watching', 'working', 'walkingOut', 'handingFile'])('waits for no clip while %s', (state) => {
    for (const place of PLACES) for (const fidget of [null, ...FIDGETS]) expect(clipAwaitedBy(state, fidget, place)).toBeNull()
  })

  // What keeps the character from ever being stuck: whenever a state waits for the end of a clip, that clip is
  // the one being played when the wait comes due, and no clip that ends is played without its end being awaited.
  it('plays exactly the clip a state waits for, in the phase in which it is awaited', () => {
    for (const state of STATES) {
      for (const fidget of [null, ...FIDGETS]) {
        for (const place of PLACES) {
          const awaited = clipAwaitedBy(state, fidget, place)
          if (awaited === null) continue
          expect(CLIPS[awaited].duration, `${awaited} has to end`).not.toBeNull()
          // A journey ends with the clip of its last phase; every other state plays its clip throughout.
          const phases = JOURNEYS.includes(state) ? (['settling'] as const) : PHASES
          for (const phase of phases) {
            for (const step of STEPS) {
              expect(clipToPlay(state, fidget, step, place, phase), `${state}, ${fidget}, ${place}, ${phase}`).toBe(awaited)
            }
          }
        }
      }
    }
  })

  it('never plays a clip that ends without its end moving the character on', () => {
    for (const state of STATES) {
      for (const fidget of [null, ...FIDGETS]) {
        for (const place of PLACES) {
          for (const phase of PHASES) {
            for (const step of STEPS) {
              const shown = clipToPlay(state, fidget, step, place, phase)
              if (CLIPS[shown].duration === null) continue
              // A clip that ended unnoticed would leave the character frozen in its last pose.
              const movesOn = phaseAfterClip(state, phase) !== null || clipAwaitedBy(state, fidget, place) === shown
              expect(movesOn, `${shown} while ${state}, ${fidget}, ${place}, ${phase}`).toBe(true)
            }
          }
        }
      }
    }
  })

  it('agrees with the machine about which states the end of a clip moves on', () => {
    const inState = (state: CharState, place: Place): CharMachine => ({
      ...initialMachine(0),
      state,
      place,
      fidget: state === 'fidgeting' ? (place === 'sofa' ? 'stretch' : 'sip') : null,
    })
    const found: [CharState, Place][] = [...STATES.map((state): [CharState, Place] => [state, 'desk']), ...WAITING.map((state): [CharState, Place] => [state, 'sofa'])]
    for (const [state, place] of found) {
      const machine = inState(state, place)
      const movesOn = transition(machine, { type: 'clipFinished' }, 10) !== machine
      // The walk out has no end of its own: its arrival is reported in a clip's place.
      const expected = state === 'walkingOut' ? true : clipAwaitedBy(state, machine.fidget, place) !== null
      expect(movesOn, `${state} at the ${place}`).toBe(expected)
    }
  })
})

describe('clipSpeedFor', () => {
  it('plays the walk as much faster as the character is moved faster', () => {
    expect(WALK_PACE).toBeCloseTo(1.5)
    expect(clipSpeedFor('walk')).toBe(WALK_PACE)
  })

  it('plays the run as much faster as the character is moved faster, within what the clip was written for', () => {
    expect(clipSpeedFor('run')).toBe(RUN_PACE)
    expect(RUN_PACE).toBeGreaterThanOrEqual(0.8)
    expect(RUN_PACE).toBeLessThanOrEqual(1.25)
  })

  it('plays every other clip at the pace it was written at', () => {
    for (const clip of CLIP_NAMES) if (clip !== 'walk' && clip !== 'run') expect(clipSpeedFor(clip)).toBe(1)
  })
})
