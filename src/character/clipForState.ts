// Which animation goes with which state of the character, how fast it is
// played, and which animation a state waits for before the character moves on.
import type { AgentStep } from '../store/tasks'
import type { ClipName } from './clips'
import type { CharState, FidgetKind } from './stateMachine'

/** What the character does at the laptop during each step of a task. */
const WORK_CLIPS: Record<AgentStep, ClipName> = {
  reading: 'think',
  searching: 'typing',
  comparing: 'think',
  writing: 'typing',
}

/**
 * The clip that shows `state`. `fidget` only matters while fidgeting and
 * `step` (what the running task is doing) only while working; a task that has
 * not reported a step yet is being thought about.
 *
 * Two states are more than one clip long, and whoever drives the character
 * fills in the rest: on the way out it walks until it has arrived, and on the
 * way back it walks and then plays `sitDown`.
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
      return 'walk'
    case 'handingFile':
      return 'holdFile'
    case 'error':
      return 'scratchHead'
  }
}

/**
 * The clip whose end lets the character leave `state`, or null for a state
 * that is left by something else. The end of any other clip means nothing to
 * the state: it belongs to a state the character has already left.
 *
 * On the way back that clip is `sitDown`, which only starts once the walk is
 * over; on the way out there is none, because a walk has no end of its own.
 */
export function clipAwaitedBy(state: CharState, fidget: FidgetKind | null): ClipName | null {
  switch (state) {
    case 'greeting':
      return 'wave'
    case 'fidgeting':
      return fidget
    case 'standingUp':
      return 'standUp'
    case 'returning':
      return 'sitDown'
    case 'error':
      return 'scratchHead'
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

/** How fast to play `clip`, 1 being the pace it was written at. */
export function clipSpeedFor(clip: ClipName): number {
  return clip === 'walk' ? WALK_PACE : 1
}
