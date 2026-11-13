// The registry of animation clips: every clip is procedural, and a clip of the
// same name shipped inside the model takes its place.
import type { AnimationClip } from 'three'
import { holdFile } from './holdFile'
import { hopOff, hopOn } from './hop'
import { idle } from './idle'
import { lookAround } from './lookAround'
import { loungeIdle, loungeLookAround, loungeStretch, loungeWave } from './lounge'
import { run } from './run'
import { scratchHead } from './scratchHead'
import type { ClipName, ProceduralClip } from './shared'
import { sip } from './sip'
import { sitDown } from './sitDown'
import { standUp } from './standUp'
import { stretch } from './stretch'
import { tap } from './tap'
import { think } from './think'
import { typing } from './typing'
import { walk } from './walk'
import { wave } from './wave'

export { BONE_NAMES } from './shared'
export type { BoneName, ClipName, Pose, ProceduralClip } from './shared'

export const CLIPS: Record<ClipName, ProceduralClip> = {
  idle,
  wave,
  typing,
  think,
  sip,
  stretch,
  lookAround,
  tap,
  standUp,
  walk,
  holdFile,
  sitDown,
  scratchHead,
  loungeIdle,
  loungeWave,
  loungeStretch,
  loungeLookAround,
  hopOn,
  hopOff,
  run,
}

export const CLIP_NAMES = Object.keys(CLIPS) as ClipName[]

export type ResolvedClip =
  | { kind: 'glb'; clip: AnimationClip }
  | { kind: 'procedural'; clip: ProceduralClip }

/** The clip to play for `name`: the model's own clip of exactly that name if it has one, the procedural clip otherwise. */
export function resolveClip(name: ClipName, glbClips: AnimationClip[]): ResolvedClip {
  const fromModel = glbClips.find((clip) => clip.name === name)
  return fromModel ? { kind: 'glb', clip: fromModel } : { kind: 'procedural', clip: CLIPS[name] }
}
