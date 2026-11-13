import { AnimationClip, Euler, Quaternion, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { BONE_NAMES, CLIP_NAMES, CLIPS, resolveClip, type ClipName, type Pose } from './index'
import { HANDOFF_POS, SEAT_GROUND_POS } from '../../scene/layout'
import {
  ARM_ON_KEYS,
  ARM_OVER_KEYS,
  armFromKeys,
  arms,
  mixArm,
  seatedBase,
  seatedTucked,
  standingBase,
  tucking,
  type ArmPose,
  type Triple,
} from './shared'
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

// --- At the desk ------------------------------------------------------------------

const LEFT_ARM = ['arm_L.001', 'arm_L.002', 'arm_L.003'] as const
const RIGHT_ARM = ['arm_R.001', 'arm_R.002', 'arm_R.003'] as const

/** The angle (radians) between two rotations given as a pose writes them. */
function turnBetween(a: Triple | undefined, b: Triple | undefined): number {
  const quaternion = (rot: Triple = [0, 0, 0]) => new Quaternion().setFromEuler(new Euler(rot[0], rot[1], rot[2]))
  return quaternion(a).angleTo(quaternion(b))
}

/** How far (radians) the joints of one arm are from where `expected` has them, at the most. */
function armOff(pose: Pose, bones: readonly string[], expected: Pose): number {
  return Math.max(...bones.map((bone) => turnBetween(pose[bone]?.rot, expected[bone]?.rot)))
}

const onKeys = arms(ARM_ON_KEYS)
/** Breathing turns the upper arms by about a hundredth of a radian. */
const BREATH = 0.02
/** Two rotations that are the same come out this close, give or take the arithmetic. */
const STILL = 1e-6

describe('waiting at the desk', () => {
  it('rests both hands on the keys', () => {
    expect(armOff(seatedBase, [...LEFT_ARM, ...RIGHT_ARM], onKeys)).toBeLessThan(STILL)
    expect(armOff(CLIPS.idle.sample(0), [...LEFT_ARM, ...RIGHT_ARM], onKeys)).toBeLessThan(STILL)
  })

  it('keeps the hands on the keys while it breathes: the arms do not rock with the chest', () => {
    for (let t = 0; t <= 3.6; t += 0.3) {
      const pose = CLIPS.idle.sample(t)
      const chest = (pose.body?.rot?.[0] ?? 0) - (seatedBase.body?.rot?.[0] ?? 0)
      for (const upper of ['arm_L.001', 'arm_R.001']) {
        expect((pose[upper]?.rot?.[0] ?? 0) - (seatedBase[upper]?.rot?.[0] ?? 0)).toBeCloseTo(-chest, 10)
      }
      expect(armOff(pose, ['arm_L.002', 'arm_L.003', 'arm_R.002', 'arm_R.003'], onKeys)).toBeLessThan(STILL)
    }
  })

  it.each(['wave', 'sip', 'stretch', 'lookAround', 'tap', 'scratchHead', 'standUp', 'think'] as const)(
    '%s starts with both hands on the keys',
    (name) => {
      const start = CLIPS[name].sample(0)
      expect(armOff(start, ['arm_L.002', 'arm_L.003', 'arm_R.002', 'arm_R.003'], onKeys)).toBeLessThan(STILL)
      expect(armOff(start, ['arm_L.001', 'arm_R.001'], onKeys)).toBeLessThan(STILL)
    },
  )

  it.each(['wave', 'sip', 'stretch', 'lookAround', 'tap', 'scratchHead', 'sitDown'] as const)(
    '%s ends with both hands on the keys',
    (name) => {
      const end = CLIPS[name].sample(CLIPS[name].duration as number)
      expect(armOff(end, ['arm_L.002', 'arm_L.003', 'arm_R.002', 'arm_R.003'], onKeys)).toBeLessThan(STILL)
      expect(armOff(end, ['arm_L.001', 'arm_R.001'], onKeys)).toBeLessThan(BREATH)
    },
  )

  it('thinks with one hand raised from the keys and the other left on them', () => {
    for (let t = 0; t <= 6; t += 0.25) {
      expect(armOff(CLIPS.think.sample(t), ['arm_L.002', 'arm_L.003'], onKeys)).toBeLessThan(STILL)
      expect(armOff(CLIPS.think.sample(t), ['arm_L.001'], onKeys)).toBeLessThan(BREATH)
    }
    expect(armOff(CLIPS.think.sample(2), RIGHT_ARM, onKeys)).toBeGreaterThan(0.5)
  })

  it('types with both hands at the keys, never further from them than a lifted finger', () => {
    const lifted = arms(ARM_OVER_KEYS)
    const reach = Math.max(...[...LEFT_ARM, ...RIGHT_ARM].map((bone) => turnBetween(onKeys[bone].rot, lifted[bone].rot)))
    let highest = 0
    for (let t = 0; t <= 6; t += 0.05) {
      const pose = CLIPS.typing.sample(t)
      for (const bone of [...LEFT_ARM, ...RIGHT_ARM]) {
        const off = turnBetween(pose[bone]?.rot, onKeys[bone].rot)
        expect(off).toBeLessThan(reach + BREATH)
        highest = Math.max(highest, off)
      }
    }
    // The hands do move.
    expect(highest).toBeGreaterThan(reach / 2)
  })

  it('drums with the right hand beside the laptop while the left stays on the keys', () => {
    let furthest = 0
    for (let t = 0; t <= 2; t += 0.05) {
      const pose = CLIPS.tap.sample(t)
      expect(armOff(pose, ['arm_L.002', 'arm_L.003'], onKeys)).toBeLessThan(STILL)
      expect(armOff(pose, ['arm_L.001'], onKeys)).toBeLessThan(BREATH)
      furthest = Math.max(furthest, armOff(pose, RIGHT_ARM, onKeys))
    }
    expect(furthest).toBeGreaterThan(0.4)
  })

  it('looks around with the head alone, so that the hands stay where they are', () => {
    for (let t = 0; t <= 3; t += 0.1) {
      const pose = CLIPS.lookAround.sample(t)
      expect(armOff(pose, ['arm_L.002', 'arm_L.003', 'arm_R.002', 'arm_R.003'], onKeys)).toBeLessThan(STILL)
      expect(pose.body?.rot?.[1] ?? 0).toBe(0)
      expect(pose.body?.rot?.[2] ?? 0).toBe(0)
    }
    expect(Math.abs(CLIPS.lookAround.sample(0.75).head?.rot?.[1] ?? 0)).toBeGreaterThan(0.4)
  })
})

/**
 * Which way one hand's palm, thumb and fingers point, in the character's axes:
 * +x its left, +y up, +z the way it faces. At rest the arms are held out
 * sideways with the palms down and the thumbs forward.
 */
function handAxes(pose: Pose, side: 'L' | 'R') {
  const turned = new Quaternion()
  for (const bone of ['root 1', 'body', `arm_${side}.001`, `arm_${side}.002`, `arm_${side}.003`]) {
    const [x, y, z] = pose[bone]?.rot ?? [0, 0, 0]
    turned.multiply(new Quaternion().setFromEuler(new Euler(x, y, z)))
  }
  return {
    palm: new Vector3(0, -1, 0).applyQuaternion(turned),
    thumb: new Vector3(0, 0, 1).applyQuaternion(turned),
    fingers: new Vector3(side === 'L' ? 1 : -1, 0, 0).applyQuaternion(turned),
  }
}

describe('wave', () => {
  const duration = CLIPS.wave.duration as number
  /** The hand is up and waving from half a second in until half a second before the end. */
  const waving: number[] = []
  for (let t = 0.5; t <= duration - 0.5 + 1e-9; t += 0.02) waving.push(t)

  it('reads the hands of the seated pose as they lie on the keys: palms down, fingers ahead', () => {
    for (const side of ['L', 'R'] as const) {
      const { palm, fingers } = handAxes(seatedBase, side)
      expect(palm.y).toBeLessThan(-0.5)
      expect(fingers.z).toBeGreaterThan(0.5)
    }
  })

  it('shows the palm of the raised hand to the room through the whole sweep', () => {
    for (const t of waving) expect(handAxes(CLIPS.wave.sample(t), 'R').palm.z).toBeGreaterThan(0.97)
  })

  it('holds the hand up with the thumb on the side of the head', () => {
    for (const t of waving) {
      const { thumb, fingers } = handAxes(CLIPS.wave.sample(t), 'R')
      // The right hand is on the character's right (-x), so its head is towards +x.
      expect(thumb.x).toBeGreaterThan(0.6)
      expect(fingers.y).toBeGreaterThan(0.6)
    }
  })

  it('swings the hand from side to side, away from the head and back', () => {
    const lean = waving.map((t) => handAxes(CLIPS.wave.sample(t), 'R').fingers.x)
    // Upright by the head at one end, leaning well outwards at the other; never across the head.
    expect(Math.max(...lean)).toBeLessThan(0)
    expect(Math.max(...lean)).toBeGreaterThan(-0.25)
    expect(Math.min(...lean)).toBeLessThan(-0.6)
    // More than once there and back.
    const turns = lean.filter((x, i) => i > 0 && i < lean.length - 1 && (x - lean[i - 1]) * (lean[i + 1] - x) < 0)
    expect(turns.length).toBeGreaterThanOrEqual(4)
  })

  it('leaves the other hand on the keys and the body where it sits', () => {
    for (let t = 0; t <= duration; t += 0.05) {
      const pose = CLIPS.wave.sample(t)
      expect(armOff(pose, ['arm_L.002', 'arm_L.003'], onKeys)).toBeLessThan(STILL)
      expect(armOff(pose, ['arm_L.001'], onKeys)).toBeLessThan(BREATH)
      expect(turnBetween(pose.body?.rot, seatedBase.body?.rot)).toBeLessThan(BREATH)
    }
  })
})

describe('mixArm', () => {
  const raised: ArmPose = { upper: [1.2, 0.3, -0.4], fore: [0.2, 0.9, 0], hand: [0, 0.1, 0.3] }

  it('gives back either end untouched', () => {
    expect(mixArm(ARM_ON_KEYS, raised, 0)).toBe(ARM_ON_KEYS)
    expect(mixArm(ARM_ON_KEYS, raised, 1)).toBe(raised)
    expect(mixArm(ARM_ON_KEYS, raised, -0.2)).toBe(ARM_ON_KEYS)
    expect(mixArm(ARM_ON_KEYS, raised, 1.2)).toBe(raised)
  })

  it('turns every joint the given share of the way', () => {
    const half = mixArm(ARM_ON_KEYS, raised, 0.5)
    for (const joint of ['upper', 'fore', 'hand'] as const) {
      const whole = turnBetween(ARM_ON_KEYS[joint], raised[joint])
      expect(turnBetween(ARM_ON_KEYS[joint], half[joint])).toBeCloseTo(whole / 2, 6)
      expect(turnBetween(half[joint], raised[joint])).toBeCloseTo(whole / 2, 6)
    }
  })
})

describe('armFromKeys', () => {
  const raised: ArmPose = { upper: [1.2, 0.3, -0.4], fore: [0.2, 0.9, 0], hand: [0, 0.1, 0.3] }

  it('starts on the keys and ends in the gesture', () => {
    expect(armFromKeys(raised, 0)).toEqual(ARM_ON_KEYS)
    expect(armFromKeys(raised, 1)).toEqual(raised)
  })

  it('leaves the keys by lifting the hand, whatever the gesture', () => {
    const other: ArmPose = { upper: [-0.5, 0.2, 1], fore: [0, -1.2, 0.3], hand: [0.3, 0, 0] }
    // The first tenth of the way is the same for every gesture: the hand has only begun to lift.
    for (const joint of ['upper', 'fore', 'hand'] as const) {
      expect(turnBetween(armFromKeys(raised, 0.1)[joint], armFromKeys(other, 0.1)[joint])).toBeLessThan(STILL)
    }
    expect(turnBetween(armFromKeys(raised, 0.1).upper, ARM_ON_KEYS.upper)).toBeGreaterThan(0)
  })

  it('moves without a jump', () => {
    let previous = armFromKeys(raised, 0)
    for (let weight = 0.01; weight <= 1.0001; weight += 0.01) {
      const next = armFromKeys(raised, Math.min(1, weight))
      for (const joint of ['upper', 'fore', 'hand'] as const) expect(turnBetween(previous[joint], next[joint])).toBeLessThan(0.06)
      previous = next
    }
  })
})

describe('tucking', () => {
  it('goes from the seated pose to sitting up with the hands drawn back', () => {
    expectSamePose(tucking(0), seatedBase)
    expectSamePose(tucking(1), seatedTucked)
  })
})
