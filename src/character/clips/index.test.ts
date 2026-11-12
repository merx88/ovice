import { AnimationClip } from 'three'
import { describe, expect, it } from 'vitest'
import { BONE_NAMES, CLIP_NAMES, CLIPS, resolveClip, type ClipName, type Pose } from './index'

const ALL_CLIPS: ClipName[] = [
  'idle',
  'wave',
  'typing',
  'think',
  'sip',
  'stretch',
  'lookAround',
  'tap',
  'standUp',
  'walk',
  'holdFile',
  'sitDown',
  'scratchHead',
]
const LOOPS: ClipName[] = ['idle', 'typing', 'think', 'walk', 'holdFile']
const ONE_SHOTS = ALL_CLIPS.filter((name) => !LOOPS.includes(name))

/** Fails on a bone the rig does not have, a malformed offset or a non-finite number. */
function expectValidPose(pose: Pose) {
  const bones = Object.keys(pose)
  expect(bones.length).toBeGreaterThan(0)
  for (const bone of bones) {
    expect(BONE_NAMES).toContain(bone)
    for (const offset of [pose[bone].rot, pose[bone].pos]) {
      if (offset === undefined) continue
      expect(offset).toHaveLength(3)
      for (const value of offset) expect(Number.isFinite(value)).toBe(true)
    }
  }
}

describe('resolveClip', () => {
  it('falls back to the procedural clip when the model has no clip of that name', () => {
    expect(resolveClip('wave', [])).toEqual({ kind: 'procedural', clip: CLIPS.wave })
  })

  it('ignores model clips with other names', () => {
    const other = new AnimationClip('oviceguy_RigAction', 1.5, [])
    expect(resolveClip('wave', [other])).toEqual({ kind: 'procedural', clip: CLIPS.wave })
  })

  it('prefers a model clip with exactly that name', () => {
    const wave = new AnimationClip('wave', 2, [])
    const result = resolveClip('wave', [new AnimationClip('idle', 1, []), wave])
    expect(result.kind).toBe('glb')
    expect(result.clip).toBe(wave)
  })
})

describe('clip registry', () => {
  it('has every clip name, and nothing else', () => {
    expect([...CLIP_NAMES].sort()).toEqual([...ALL_CLIPS].sort())
    expect(Object.keys(CLIPS).sort()).toEqual([...ALL_CLIPS].sort())
  })

  it.each(LOOPS)('%s loops', (name) => {
    expect(CLIPS[name].duration).toBeNull()
  })

  it.each(ONE_SHOTS)('%s plays once, for a finite time', (name) => {
    const { duration } = CLIPS[name]
    expect(duration).not.toBeNull()
    expect(duration).toBeGreaterThan(0)
    expect(duration).toBeLessThan(10)
  })

  it.each(ONE_SHOTS)('%s gives a valid pose from its first to its last moment', (name) => {
    const clip = CLIPS[name]
    const duration = clip.duration as number
    for (const t of [0, duration * 0.25, duration * 0.5, duration * 0.75, duration]) expectValidPose(clip.sample(t))
  })

  it.each(LOOPS)('%s gives a valid pose for as long as it runs', (name) => {
    for (let t = 0; t <= 6; t += 0.37) expectValidPose(CLIPS[name].sample(t))
    expectValidPose(CLIPS[name].sample(3600))
  })

  it.each(ONE_SHOTS)('%s holds its last pose after it ends', (name) => {
    const clip = CLIPS[name]
    const duration = clip.duration as number
    expect(clip.sample(duration + 5)).toEqual(clip.sample(duration))
  })

  it('ends standing up where walking starts from, and sitting down where idling starts from', () => {
    const standing = CLIPS.standUp.sample(CLIPS.standUp.duration as number)
    const seated = CLIPS.sitDown.sample(CLIPS.sitDown.duration as number)
    // Standing leaves the body on the ground; sitting lifts it onto the seat.
    expect(standing['root 1']?.pos?.[1] ?? 0).toBeCloseTo(0)
    expect(seated['root 1']?.pos?.[1] ?? 0).toBeGreaterThan(0.05)
    expect(CLIPS.standUp.sample(0)['root 1']?.pos?.[1]).toBeCloseTo(seated['root 1']?.pos?.[1] ?? 0)
    expect(CLIPS.sitDown.sample(0)['root 1']?.pos?.[1] ?? 0).toBeCloseTo(0)
  })
})
