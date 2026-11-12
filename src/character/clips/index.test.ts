import { AnimationClip } from 'three'
import { describe, expect, it } from 'vitest'
import { BONE_NAMES, CLIP_NAMES, CLIPS, resolveClip, type ClipName, type Pose } from './index'
import { HANDOFF_POS, SEAT_GROUND_POS } from '../../scene/layout'
import { seatedBase, standingBase } from './shared'
import { WALK_SPEED } from './walk'

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

/**
 * Fails unless both poses put every bone in the same place; a bone a pose
 * leaves out is at rest. Bones in `roughly` may be up to 0.05 off.
 */
function expectSamePose(actual: Pose, expected: Pose, roughly: string[] = []) {
  for (const bone of BONE_NAMES) {
    const digits = roughly.includes(bone) ? 1 : 2
    for (const offset of ['rot', 'pos'] as const) {
      const got = actual[bone]?.[offset] ?? [0, 0, 0]
      const want = expected[bone]?.[offset] ?? [0, 0, 0]
      got.forEach((value, axis) => expect(value, `${bone} ${offset}[${axis}]`).toBeCloseTo(want[axis], digits))
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

  it('gets up from the seated pose into the standing pose', () => {
    expectSamePose(CLIPS.standUp.sample(0), seatedBase)
    expectSamePose(CLIPS.standUp.sample(CLIPS.standUp.duration as number), standingBase)
  })

  it('sits down from the standing pose into the seated pose', () => {
    expectSamePose(CLIPS.sitDown.sample(0), standingBase)
    expectSamePose(CLIPS.sitDown.sample(CLIPS.sitDown.duration as number), seatedBase)
  })

  it('lifts the seated body onto the seat and leaves the standing body on the ground', () => {
    expect(seatedBase['root 1']?.pos?.[1]).toBeGreaterThan(0.05)
    expect(standingBase['root 1']?.pos?.[1] ?? 0).toBe(0)
  })

  it('walks at a speed that takes it from the seat to the hand-off spot in about 1.6 s', () => {
    const distance = Math.hypot(HANDOFF_POS[0] - SEAT_GROUND_POS[0], HANDOFF_POS[2] - SEAT_GROUND_POS[2])
    expect(distance / WALK_SPEED).toBeCloseTo(1.6, 1)
  })

  it.each(['wave', 'sip', 'stretch', 'lookAround', 'tap', 'scratchHead'] as const)(
    '%s starts and ends in the seated pose, so idling can follow it without a jump',
    (name) => {
      const clip = CLIPS[name]
      // Breathing, which runs through most clips, moves these by a hundredth of a radian or so.
      const breathing = ['body', 'head', 'arm_L.001', 'arm_R.001']
      for (const t of [0, clip.duration as number]) expectSamePose(clip.sample(t), seatedBase, breathing)
    },
  )
})
