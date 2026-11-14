// Which animation goes with which state of the character, how fast it is
// played, and which animation a state waits for before the character moves on.
import type { AgentStep } from '../store/tasks'
import type { ClipName } from './clips'
import type { CharState, FidgetKind, Place } from './stateMachine'

/** What the character does at the laptop during each step of a task. */
const WORK_CLIPS: Record<AgentStep, ClipName> = {
  reading: 'think',
  searching: 'typing',
  comparing: 'think',
  writing: 'typing',
}

/**
 * Whether the character thinks its way through `step` rather than types: the
 * steps whose clip is `think`, and a task that has not reported a step yet.
 */
export function isThinkingStep(step: AgentStep | null): boolean {
  return step === null || WORK_CLIPS[step] === 'think'
}

/**
 * The clip that shows `state` at the desk. `fidget` only matters while
 * fidgeting and `step` (what the running task is doing) only while working; a
 * task that has not reported a step yet is being thought about.
 *
 * Some states are more than one clip long, and `clipToPlay` fills in the
 * rest: this names the clip the character is moved to. On the way out with a
 * result it walks until it has arrived; on its other ways it gets up or hops
 * off first, and sits down or hops on at the end.
 */
export function clipForState(state: CharState, fidget: FidgetKind | null, step: AgentStep | null): ClipName {
  switch (state) {
    case 'resting':
    case 'watching':
      return 'idle'
    case 'greeting':
      return 'wave'
    case 'fidgeting':
      return fidget ?? 'idle'
    case 'working':
      return step === null ? 'think' : WORK_CLIPS[step]
    case 'standingUp':
      return 'standUp'
    case 'walkingOut':
    case 'returning':
    case 'goingToSofa':
      return 'walk'
    case 'handingFile':
      return 'holdFile'
    case 'error':
      return 'scratchHead'
    case 'rushingToDesk':
      return 'run'
  }
}

/**
 * The parts of a way from one place to another, in the order they come:
 * `landing` (only on a run back that was called for in the middle of a hop
 * onto the sofa: that hop is finished first), `rising` (getting up from the
 * chair, or hopping off the sofa), `moving` (walking or running) and
 * `settling` (sitting down on the chair, or hopping onto the sofa). Whoever
 * moves the character keeps track of the phase; no other state has one.
 */
export type TravelPhase = 'landing' | 'rising' | 'moving' | 'settling'

/**
 * How a character that waits on the sofa is shown in `state`, or null where
 * the sofa makes no difference. A stretch and a look around have a lounging
 * form; the sip and the tap need the desk and are never picked there.
 */
function loungeClip(state: CharState, fidget: FidgetKind | null): ClipName | null {
  switch (state) {
    case 'resting':
    case 'watching':
      return 'loungeIdle'
    case 'greeting':
      return 'loungeWave'
    case 'fidgeting':
      if (fidget === null) return 'loungeIdle'
      if (fidget === 'stretch') return 'loungeStretch'
      return fidget === 'lookAround' ? 'loungeLookAround' : null
    default:
      return null
  }
}

/**
 * The clip to play: `clipForState`, with what it cannot know filled in.
 * `place` says where a waiting character is, and `phase` how far a
 * travelling one has come (see `TravelPhase`).
 */
export function clipToPlay(
  state: CharState,
  fidget: FidgetKind | null,
  step: AgentStep | null,
  place: Place,
  phase: TravelPhase,
): ClipName {
  switch (state) {
    case 'returning':
      return phase === 'settling' ? 'sitDown' : 'walk'
    case 'goingToSofa':
      if (phase === 'rising') return 'standUp'
      return phase === 'moving' ? 'walk' : 'hopOn'
    case 'rushingToDesk':
      if (phase === 'landing') return 'hopOn'
      if (phase === 'rising') return 'hopOff'
      return phase === 'moving' ? 'run' : 'sitDown'
    default:
      return (place === 'sofa' ? loungeClip(state, fidget) : null) ?? clipForState(state, fidget, step)
  }
}

/**
 * The phase a character starts `state` in. `from` is what it was doing until
 * now and where it waited, and `phase` how far a journey it was on had come.
 */
export function firstPhase(state: CharState, from: { state: CharState; place: Place }, phase: TravelPhase): TravelPhase {
  switch (state) {
    case 'goingToSofa':
      return 'rising'
    case 'rushingToDesk':
      // Called back from the sofa, it hops off first.
      if (from.place === 'sofa') return 'rising'
      if (from.state !== 'goingToSofa') return 'moving'
      // Called back before it had left its chair, it sits straight down again; in the middle of
      // the hop onto the sofa, it finishes that hop first; anywhere between, it runs from where it is.
      if (phase === 'rising') return 'settling'
      return phase === 'settling' ? 'landing' : 'moving'
    default:
      return 'moving'
  }
}

/**
 * The phase that follows `phase` of a journey once the clip played in it has
 * come to its end, or null where the phase ends otherwise: by arriving
 * (`moving`), or with the journey itself (see `clipAwaitedBy`).
 */
export function phaseAfterClip(state: CharState, phase: TravelPhase): TravelPhase | null {
  // Up from the chair, then off to the sofa.
  if (state === 'goingToSofa' && phase === 'rising') return 'moving'
  // A hop onto the sofa is finished, then comes the hop off it, and only on the floor the run.
  if (state === 'rushingToDesk' && phase === 'landing') return 'rising'
  if (state === 'rushingToDesk' && phase === 'rising') return 'moving'
  return null
}

/**
 * The clip whose end lets the character leave `state`, or null for a state
 * that is left by something else. The end of any other clip means nothing to
 * the state: it belongs to a state the character has already left.
 *
 * A journey waits for the clip of its last phase: sitting down at the desk,
 * or the hop onto the sofa. The way out with a result waits for none, because
 * a walk has no end of its own.
 */
export function clipAwaitedBy(state: CharState, fidget: FidgetKind | null, place: Place): ClipName | null {
  switch (state) {
    case 'fidgeting':
      return fidget === null ? null : clipToPlay(state, fidget, null, place, 'settling')
    case 'greeting':
    case 'standingUp':
    case 'error':
    case 'returning':
    case 'rushingToDesk':
    case 'goingToSofa':
      return clipToPlay(state, fidget, null, place, 'settling')
    case 'resting':
    case 'watching':
    case 'working':
    case 'walkingOut':
    case 'handingFile':
      return null
  }
}

/**
 * How briskly the character walks, as a multiple of the speed its walk clip
 * strides at (`WALK_SPEED`). It is moved that much faster and the clip is
 * played that much faster, so its feet still do not slide.
 */
export const WALK_PACE = 1.5

/**
 * The same for the run back to the desk and `RUN_SPEED`. The run clip is
 * written to be played between 0.8 and 1.25 times its own pace.
 */
export const RUN_PACE = 1.15

/** How fast to play `clip`, 1 being the pace it was written at. */
export function clipSpeedFor(clip: ClipName): number {
  if (clip === 'walk') return WALK_PACE
  return clip === 'run' ? RUN_PACE : 1
}
