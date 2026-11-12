// The bookkeeping of clip playback, kept apart from the 3D so it can be
// tested: which clip is on, how far in it is, whether it has ended and how far
// the cross-fade from the previous pose has come.
import type { ClipName } from './clips'

/** Seconds a change of clip takes to blend in. */
export const CROSS_FADE = 0.25

export interface Playback {
  /** The clip being played, or null before the first frame. */
  name: ClipName | null
  /** Seconds since the clip started. */
  time: number
  /** True once a finite clip has reached its end (or the model's own clip reported so). */
  finished: boolean
  /** Progress of the cross-fade into this clip, 0..1. */
  fade: number
}

export interface PlaybackFrame {
  /** The clip changed on this frame: the pose shown so far is what to fade from. */
  started: boolean
  /** A finite clip reached its end on this frame. Reported once per play. */
  justFinished: boolean
  /** How much of the new clip to show over the pose faded from, 0..1, eased. */
  fadeWeight: number
}

export function createPlayback(): Playback {
  return { name: null, time: 0, finished: false, fade: 1 }
}

function ease(value: number): number {
  return value * value * (3 - 2 * value)
}

/**
 * Moves playback on by `step` seconds with `clip` requested. `duration` is the
 * clip's length, or null when it loops or reports its own end.
 */
export function advancePlayback(playback: Playback, clip: ClipName, step: number, duration: number | null): PlaybackFrame {
  const started = clip !== playback.name
  if (started) {
    // The very first clip has no earlier pose to fade from.
    playback.fade = playback.name === null ? 1 : 0
    playback.name = clip
    playback.time = 0
    playback.finished = false
  } else {
    playback.time += step
    playback.fade = Math.min(1, playback.fade + step / CROSS_FADE)
  }
  const justFinished = duration !== null && !playback.finished && playback.time >= duration
  if (justFinished) playback.finished = true
  return { started, justFinished, fadeWeight: ease(playback.fade) }
}
