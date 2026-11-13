import { AnimationClip, Euler, Quaternion, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { BONE_NAMES, CLIP_NAMES, CLIPS, resolveClip, type ClipName, type Pose } from './index'
import { HANDOFF_POS, SEAT_GROUND_POS, SOFA_LIFT } from '../../scene/layout'
import { ARM_ON_LEG, armFromLeg, LOUNGE_CLIPS, loungeBase } from './lounge'
import { MAX_STEP } from '../playback'
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
import { SIP_GRIP } from './sip'
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
  'loungeIdle',
  'loungeWave',
  'loungeStretch',
  'loungeLookAround',
]
const LOOPS: ClipName[] = ['idle', 'typing', 'think', 'walk', 'holdFile', 'loungeIdle']
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

/** The furthest any joint turns (radians) or moves (m) between two poses. */
function poseChange(a: Pose, b: Pose): number {
  let most = 0
  for (const bone of new Set([...Object.keys(a), ...Object.keys(b)])) {
    most = Math.max(most, turnBetween(a[bone]?.rot, b[bone]?.rot))
    const from = a[bone]?.pos ?? [0, 0, 0]
    const to = b[bone]?.pos ?? [0, 0, 0]
    most = Math.max(most, Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]))
  }
  return most
}

/**
 * Plays `clip` in steps of a six-hundredth of a second and expects no joint
 * to turn or move further in one step than a joint moving at `speed`
 * (radians or metres a second) would: fast is allowed, a jump is not.
 */
function expectContinuous(name: ClipName, speed = 18, seconds = CLIPS[name].duration ?? 4) {
  const clip = CLIPS[name]
  const step = 1 / 600
  let previous = clip.sample(0)
  let furthest = { change: 0, at: 0 }
  for (let t = step; t <= seconds + step; t += step) {
    const pose = clip.sample(t)
    const change = poseChange(previous, pose)
    if (change > furthest.change) furthest = { change, at: t }
    previous = pose
  }
  expect(furthest.change, `${name} at ${furthest.at.toFixed(3)} s`).toBeLessThan(speed * step)
}

describe('sip', () => {
  const duration = CLIPS.sip.duration as number

  it('has the cup in the hand for a stretch inside the clip, with time to reach it and to come back', () => {
    expect(SIP_GRIP.from).toBeGreaterThan(0.4)
    expect(SIP_GRIP.to).toBeGreaterThan(SIP_GRIP.from + 1.5)
    expect(SIP_GRIP.to).toBeLessThan(duration - 0.4)
  })

  it('starts and ends exactly as the character sits', () => {
    expectSamePose(CLIPS.sip.sample(0), seatedBase)
    expectSamePose(CLIPS.sip.sample(duration), seatedBase)
    expectSamePose(CLIPS.sip.sample(duration + 1), seatedBase)
  })

  it('moves without a jump from its first moment to its last', () => {
    expectContinuous('sip')
  })

  it('holds perfectly still around the moments the hand takes the cup and lets go of it', () => {
    // However the frames fall (none is longer than MAX_STEP), the cup is taken from a hand at rest
    // and set down by a hand in that very pose, so it stands again exactly where it stood.
    const taking = CLIPS.sip.sample(SIP_GRIP.from)
    for (const at of [SIP_GRIP.from, SIP_GRIP.to]) {
      for (const offset of [-MAX_STEP, -MAX_STEP / 2, 0, MAX_STEP / 2, MAX_STEP]) {
        expect(poseChange(CLIPS.sip.sample(at + offset), taking), `at ${at} ${offset >= 0 ? '+' : '-'} ${Math.abs(offset)} s`).toBeLessThan(STILL)
      }
    }
  })

  it('leans over to the cup with the left hand, and brings it up while the body sits up again', () => {
    const atCup = CLIPS.sip.sample(SIP_GRIP.from)
    const atMouth = CLIPS.sip.sample((SIP_GRIP.from + SIP_GRIP.to) / 2)
    // Leaning further forward and to its left than it sits.
    expect(atCup.body?.rot?.[0] ?? 0).toBeGreaterThan(seatedBase.body?.rot?.[0] ?? 0)
    expect(atCup.body?.rot?.[2] ?? 0).toBeLessThan(-0.1)
    expect(atMouth.body?.rot?.[2] ?? 0).toBeCloseTo(0, 5)
    // The hand holds the cup upright by its side: thumb up, on the desk as at the mouth before it tips.
    expect(handAxes(atCup, 'L').thumb.y).toBeGreaterThan(0.98)
    expect(armOff(atCup, LEFT_ARM, onKeys)).toBeGreaterThan(0.5)
  })

  it('tips the cup towards the face, a third of a right angle or more, and tips the head back with it', () => {
    let tipped = 0
    let headBack = 0
    for (let t = SIP_GRIP.from; t <= SIP_GRIP.to; t += 0.05) {
      const pose = CLIPS.sip.sample(t)
      // The cup stands along the thumb; tipping it towards the face leans the thumb back (-z).
      const { thumb } = handAxes(pose, 'L')
      if (thumb.z < 0) tipped = Math.max(tipped, Math.acos(Math.min(1, thumb.y)))
      const head = new Vector3(0, 0, 1).applyQuaternion(
        new Quaternion()
          .setFromEuler(new Euler(...(pose.body?.rot ?? [0, 0, 0])))
          .multiply(new Quaternion().setFromEuler(new Euler(...(pose.head?.rot ?? [0, 0, 0])))),
      )
      headBack = Math.max(headBack, head.y)
    }
    expect(tipped).toBeGreaterThan((30 * Math.PI) / 180)
    expect(tipped).toBeLessThan((45 * Math.PI) / 180)
    // The face looks a little upwards at the most tipped moment.
    expect(headBack).toBeGreaterThan(0.05)
    expect(headBack).toBeLessThan(0.3)
  })
})

// --- On the sofa ------------------------------------------------------------------

const onLegs = arms(ARM_ON_LEG)

describe('on the sofa', () => {
  const GESTURES = ['loungeWave', 'loungeStretch', 'loungeLookAround'] as const

  it('names the clips that are played there', () => {
    expect([...LOUNGE_CLIPS].sort()).toEqual(['loungeIdle', ...GESTURES].sort())
    for (const name of LOUNGE_CLIPS) expect(CLIP_NAMES).toContain(name)
  })

  it('sits back on the cushion with the head upright and the legs out in front', () => {
    expect(loungeBase['root 1']?.pos).toEqual([0, SOFA_LIFT, 0])
    const lean = loungeBase.body?.rot?.[0] ?? 0
    // Leaning back a little, not lying down.
    expect(lean).toBeLessThan(-0.05)
    expect(lean).toBeGreaterThan(-0.4)
    expect((loungeBase.head?.rot?.[0] ?? 0) + lean).toBeCloseTo(0, 5)
    // The thighs point forward, nearly level.
    for (const thigh of ['Leg_L.001', 'Leg_R.001']) expect(loungeBase[thigh]?.rot?.[0] ?? 0).toBeLessThan(-1.2)
  })

  it('rests both hands on the legs, palms down, while it lounges', () => {
    expect(armOff(loungeBase, [...LEFT_ARM, ...RIGHT_ARM], onLegs)).toBeLessThan(STILL)
    for (const side of ['L', 'R'] as const) expect(handAxes(loungeBase, side).palm.y).toBeLessThan(-0.7)
    for (let t = 0; t <= 7.2; t += 0.3) {
      const pose = CLIPS.loungeIdle.sample(t)
      // Breathing rocks the chest, not the arms.
      const chest = (pose.body?.rot?.[0] ?? 0) - (loungeBase.body?.rot?.[0] ?? 0)
      for (const upper of ['arm_L.001', 'arm_R.001']) {
        expect((pose[upper]?.rot?.[0] ?? 0) - (loungeBase[upper]?.rot?.[0] ?? 0)).toBeCloseTo(-chest, 10)
      }
      expect(armOff(pose, ['arm_L.002', 'arm_L.003', 'arm_R.002', 'arm_R.003'], onLegs)).toBeLessThan(STILL)
      expect(pose['root 1']?.pos).toEqual([0, SOFA_LIFT, 0])
    }
  })

  it('lounges in a loop that comes round without a seam', () => {
    expect(CLIPS.loungeIdle.duration).toBeNull()
    expectSamePose(CLIPS.loungeIdle.sample(0), loungeBase)
    // One breath is 3.6 s: the pose is the same a breath later, wherever in the breath it is.
    for (const t of [0, 0.7, 1.9, 3.1]) expect(poseChange(CLIPS.loungeIdle.sample(t), CLIPS.loungeIdle.sample(t + 3.6))).toBeLessThan(STILL)
    expectContinuous('loungeIdle', 1, 7.2)
  })

  it.each(GESTURES)('%s starts and ends as it lounges, so that lounging can follow it without a jump', (name) => {
    const clip = CLIPS[name]
    const breathing = ['body', 'head', 'arm_L.001', 'arm_R.001']
    for (const t of [0, clip.duration as number]) expectSamePose(clip.sample(t), CLIPS.loungeIdle.sample(0), breathing)
    for (const t of [0, clip.duration as number]) {
      expect(armOff(clip.sample(t), ['arm_L.002', 'arm_L.003', 'arm_R.002', 'arm_R.003'], onLegs)).toBeLessThan(STILL)
    }
  })

  it.each(GESTURES)('%s moves without a jump and never leaves the cushion', (name) => {
    expectContinuous(name)
    for (let t = 0; t <= (CLIPS[name].duration as number); t += 0.1) expect(CLIPS[name].sample(t)['root 1']?.pos).toEqual([0, SOFA_LIFT, 0])
  })

  it('waves from the sofa with the palm to the room and the thumb on the side of the head', () => {
    const duration = CLIPS.loungeWave.duration as number
    const lean: number[] = []
    for (let t = 0.5; t <= duration - 0.5 + 1e-9; t += 0.02) {
      const pose = CLIPS.loungeWave.sample(t)
      const { palm, thumb, fingers } = handAxes(pose, 'R')
      expect(palm.z).toBeGreaterThan(0.97)
      expect(thumb.x).toBeGreaterThan(0.6)
      expect(fingers.y).toBeGreaterThan(0.6)
      lean.push(fingers.x)
      // The other hand stays on its leg.
      expect(armOff(pose, ['arm_L.002', 'arm_L.003'], onLegs)).toBeLessThan(STILL)
      expect(armOff(pose, ['arm_L.001'], onLegs)).toBeLessThan(BREATH)
    }
    expect(Math.max(...lean)).toBeLessThan(0)
    expect(Math.min(...lean)).toBeLessThan(-0.6)
  })

  it('stretches with both arms up and the head back, and puts the hands back on the legs', () => {
    const top = CLIPS.loungeStretch.sample(1.5)
    for (const side of ['L', 'R'] as const) expect(handAxes(top, side).fingers.y).toBeGreaterThan(0.5)
    expect(armOff(top, LEFT_ARM, onLegs)).toBeGreaterThan(0.5)
    expect(armOff(top, RIGHT_ARM, onLegs)).toBeGreaterThan(0.5)
    expect((top.head?.rot?.[0] ?? 0) + (top.body?.rot?.[0] ?? 0)).toBeLessThan(-0.15)
  })

  it('looks around with the head alone, so that the hands stay on the legs', () => {
    for (let t = 0; t <= 3; t += 0.1) {
      const pose = CLIPS.loungeLookAround.sample(t)
      expect(armOff(pose, ['arm_L.002', 'arm_L.003', 'arm_R.002', 'arm_R.003'], onLegs)).toBeLessThan(STILL)
      expect(armOff(pose, ['arm_L.001', 'arm_R.001'], onLegs)).toBeLessThan(BREATH)
      expect(pose.body?.rot?.[1] ?? 0).toBe(0)
      expect(pose.body?.rot?.[2] ?? 0).toBe(0)
    }
    expect(CLIPS.loungeLookAround.sample(0.75).head?.rot?.[1] ?? 0).toBeGreaterThan(0.4)
    expect(CLIPS.loungeLookAround.sample(2.2).head?.rot?.[1] ?? 0).toBeLessThan(-0.4)
  })
})

describe('armFromLeg', () => {
  const gesture: ArmPose = { upper: [0.17, 0.25, 0.92], fore: [1.19, 0.47, 0.02], hand: [0.02, -0.07, 0] }

  it('starts on the leg and ends in the gesture', () => {
    expect(armFromLeg(gesture, 0)).toEqual(ARM_ON_LEG)
    expect(armFromLeg(gesture, 1)).toEqual(gesture)
  })

  it('leaves the leg by the shoulder alone, whatever the gesture', () => {
    const early = armFromLeg(gesture, 0.1)
    expect(turnBetween(early.upper, ARM_ON_LEG.upper)).toBeGreaterThan(0.01)
    expect(turnBetween(early.fore, ARM_ON_LEG.fore)).toBeLessThan(STILL)
    expect(turnBetween(early.hand, ARM_ON_LEG.hand)).toBeLessThan(STILL)
  })

  it('moves without a jump', () => {
    let previous = armFromLeg(gesture, 0)
    for (let weight = 0.01; weight <= 1.001; weight += 0.01) {
      const next = armFromLeg(gesture, weight)
      for (const joint of ['upper', 'fore', 'hand'] as const) expect(turnBetween(previous[joint], next[joint])).toBeLessThan(0.12)
      previous = next
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
