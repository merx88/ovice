import { describe, expect, it } from 'vitest'
import { advancePlayback, createPlayback, CROSS_FADE } from './playback'

const FRAME = 1 / 60

/** Plays `clip` for `seconds`, returning how often it reported finishing. */
function play(playback: ReturnType<typeof createPlayback>, clip: 'wave' | 'idle' | 'sip', duration: number | null, seconds: number) {
  let finishes = 0
  for (let elapsed = 0; elapsed < seconds; elapsed += FRAME) {
    if (advancePlayback(playback, clip, FRAME, duration).justFinished) finishes++
  }
  return finishes
}

describe('advancePlayback', () => {
  it('starts the first clip at once, with nothing to fade from', () => {
    const playback = createPlayback()
    const frame = advancePlayback(playback, 'idle', FRAME, null)
    expect(frame).toEqual({ started: true, justFinished: false, fadeWeight: 1 })
    expect(playback.time).toBe(0)
    expect(advancePlayback(playback, 'idle', FRAME, null).started).toBe(false)
    expect(playback.time).toBeCloseTo(FRAME)
  })

  it('reports the end of a finite clip exactly once', () => {
    const playback = createPlayback()
    expect(play(playback, 'wave', 2.2, 2.1)).toBe(0)
    expect(play(playback, 'wave', 2.2, 0.3)).toBe(1)
    expect(play(playback, 'wave', 2.2, 5)).toBe(0)
  })

  it('never reports the end of a looping clip', () => {
    const playback = createPlayback()
    expect(play(playback, 'idle', null, 60)).toBe(0)
  })

  it('never reports the end of a clip that was interrupted', () => {
    const playback = createPlayback()
    play(playback, 'wave', 2.2, 2)
    // Another clip takes over 0.2 s before the wave would have ended.
    expect(play(playback, 'idle', null, 5)).toBe(0)
  })

  it('restarts the clock when the clip changes', () => {
    const playback = createPlayback()
    play(playback, 'idle', null, 3)
    expect(advancePlayback(playback, 'sip', FRAME, 3).started).toBe(true)
    expect(playback.time).toBe(0)
    expect(play(playback, 'sip', 3, 2.9)).toBe(0)
    expect(play(playback, 'sip', 3, 0.2)).toBe(1)
  })

  it('plays, and finishes, a finite clip again when it comes back', () => {
    const playback = createPlayback()
    expect(play(playback, 'wave', 2.2, 3)).toBe(1)
    play(playback, 'idle', null, 1)
    expect(play(playback, 'wave', 2.2, 3)).toBe(1)
  })

  it('fades a new clip in over the cross-fade time', () => {
    const playback = createPlayback()
    play(playback, 'idle', null, 1)
    expect(CROSS_FADE).toBe(0.25)
    expect(advancePlayback(playback, 'wave', FRAME, 2.2).fadeWeight).toBe(0)
    const midway = advancePlayback(playback, 'wave', CROSS_FADE / 2, 2.2).fadeWeight
    expect(midway).toBeCloseTo(0.5)
    expect(advancePlayback(playback, 'wave', CROSS_FADE / 2, 2.2).fadeWeight).toBeCloseTo(1)
    expect(advancePlayback(playback, 'wave', FRAME, 2.2).fadeWeight).toBe(1)
  })

  it('runs the clip faster or slower by the speed given', () => {
    const fast = createPlayback()
    advancePlayback(fast, 'walk', FRAME, null, 1.5)
    for (let frame = 0; frame < 60; frame++) advancePlayback(fast, 'walk', FRAME, null, 1.5)
    expect(fast.time).toBeCloseTo(1.5)

    const slow = createPlayback()
    advancePlayback(slow, 'walk', FRAME, null, 0.5)
    for (let frame = 0; frame < 60; frame++) advancePlayback(slow, 'walk', FRAME, null, 0.5)
    expect(slow.time).toBeCloseTo(0.5)
  })

  it('ends a finite clip sooner the faster it runs', () => {
    const playback = createPlayback()
    let finishes = 0
    let seconds = 0
    while (finishes === 0 && seconds < 5) {
      if (advancePlayback(playback, 'wave', FRAME, 2.2, 2).justFinished) finishes++
      seconds += FRAME
    }
    expect(seconds).toBeCloseTo(1.1, 1)
    // Still reported once only.
    for (let frame = 0; frame < 120; frame++) if (advancePlayback(playback, 'wave', FRAME, 2.2, 2).justFinished) finishes++
    expect(finishes).toBe(1)
  })

  it('takes the same time over the cross-fade whatever the speed', () => {
    const playback = createPlayback()
    advancePlayback(playback, 'idle', FRAME, null)
    expect(advancePlayback(playback, 'walk', FRAME, null, 3).fadeWeight).toBe(0)
    expect(advancePlayback(playback, 'walk', CROSS_FADE / 2, null, 3).fadeWeight).toBeCloseTo(0.5)
    expect(advancePlayback(playback, 'walk', CROSS_FADE / 2, null, 3).fadeWeight).toBeCloseTo(1)
  })

  it('plays at its own pace when no speed is given', () => {
    const playback = createPlayback()
    advancePlayback(playback, 'walk', FRAME, null)
    advancePlayback(playback, 'walk', 0.25, null)
    expect(playback.time).toBeCloseTo(0.25)
  })

  it('starts a fresh fade when the clip changes again midway', () => {
    const playback = createPlayback()
    play(playback, 'idle', null, 1)
    advancePlayback(playback, 'wave', FRAME, 2.2)
    advancePlayback(playback, 'wave', 0.1, 2.2)
    const frame = advancePlayback(playback, 'sip', FRAME, 3)
    expect(frame.started).toBe(true)
    expect(frame.fadeWeight).toBe(0)
  })
})
