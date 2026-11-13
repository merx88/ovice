// The vocabulary every procedural clip is written in: pose types, the base
// poses the clips start from, and small helpers for timing and mirroring.
//
// How to read a pose
// ------------------
// A pose lists, per bone, an offset from the model's rest pose (a T-pose
// facing +z). Offsets use the character's own axes — +x is its left, +y is up,
// +z is the way it faces — carried along by the bone's parent:
//   - `rot` is an Euler rotation in radians about those axes, applied z first,
//     then y, then x;
//   - `pos` moves the bone, in metres.
// For the left arm, which points along +x at rest: z < 0 lowers it, y < 0
// swings it forward, and (on the forearm and hand) x rolls it about its own
// length. `arms()` mirrors left-arm numbers onto the right arm. For a leg, x < 0
// swings it forward. For body and head, x > 0 nods forward, y > 0 turns to the
// character's left and z > 0 tips towards its right shoulder.
import { Euler, Quaternion } from 'three'
import { CHARACTER_HEIGHT, SEAT_HEIGHT } from '../../scene/layout'

/** The bones of the model, by the names they have in the GLB. */
export const BONE_NAMES = [
  'master control',
  'root 1',
  'body',
  'head',
  'hip',
  'arm_L.001',
  'arm_L.002',
  'arm_L.003',
  'arm_R.001',
  'arm_R.002',
  'arm_R.003',
  'Leg_L.001',
  'Leg_L.002',
  'Leg_L.003',
  'Leg_R.001',
  'Leg_R.002',
  'Leg_R.003',
  'foot_IK_L',
  'foot_IK_R',
] as const

export type BoneName = (typeof BONE_NAMES)[number]

export type ClipName =
  | 'idle'
  | 'wave'
  | 'typing'
  | 'think'
  | 'sip'
  | 'stretch'
  | 'lookAround'
  | 'tap'
  | 'standUp'
  | 'walk'
  | 'holdFile'
  | 'sitDown'
  | 'scratchHead'

export type Triple = [number, number, number]

/** Per-bone offsets from the rest pose; keys are GLB bone names (see `BONE_NAMES`). */
export interface Pose {
  [bone: string]: { rot?: Triple; pos?: Triple }
}

export interface ProceduralClip {
  /** Length in seconds, or null for a clip that loops. */
  duration: number | null
  /** The pose `t` seconds into the clip. One-shots hold their last pose once `t` passes `duration`. */
  sample(t: number): Pose
}

// --- Timing -----------------------------------------------------------------

export const TAU = Math.PI * 2

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/** Eases 0..1 in and out. */
export function ease(value: number): number {
  const x = clamp01(value)
  return x * x * (3 - 2 * x)
}

/** 0 before `start`, 1 after `end`, eased in between. */
export function ramp(t: number, start: number, end: number): number {
  return ease((t - start) / (end - start))
}

/** Rises over `fadeIn` seconds from `start`, holds, and falls back over `fadeOut` seconds to reach 0 at `end`. */
export function hold(t: number, start: number, end: number, fadeIn: number, fadeOut = fadeIn): number {
  return Math.min(ramp(t, start, start + fadeIn), 1 - ramp(t, end - fadeOut, end))
}

// --- Combining poses --------------------------------------------------------

function addTriples(a: Triple | undefined, b: Triple | undefined, weight: number): Triple | undefined {
  if (!b) return a
  return [(a?.[0] ?? 0) + b[0] * weight, (a?.[1] ?? 0) + b[1] * weight, (a?.[2] ?? 0) + b[2] * weight]
}

/** `base` with `weight` times every offset of `layer` added on top. */
export function add(base: Pose, layer: Pose, weight = 1): Pose {
  const result: Pose = { ...base }
  for (const bone of Object.keys(layer)) {
    result[bone] = {
      rot: addTriples(base[bone]?.rot, layer[bone].rot, weight),
      pos: addTriples(base[bone]?.pos, layer[bone].pos, weight),
    }
  }
  return result
}

const fromTurn = new Quaternion()
const toTurn = new Quaternion()
const turn = new Euler()

/** The rotation `weight` of the way from `a` to `b`, taking the short way round. */
function mixRotations(a: Triple | undefined, b: Triple | undefined, weight: number): Triple | undefined {
  if (!a && !b) return undefined
  fromTurn.setFromEuler(turn.set(a?.[0] ?? 0, a?.[1] ?? 0, a?.[2] ?? 0))
  toTurn.setFromEuler(turn.set(b?.[0] ?? 0, b?.[1] ?? 0, b?.[2] ?? 0))
  turn.setFromQuaternion(fromTurn.slerp(toTurn, weight))
  return [turn.x, turn.y, turn.z]
}

function mixOffsets(a: Triple | undefined, b: Triple | undefined, weight: number): Triple | undefined {
  if (!a && !b) return undefined
  return [0, 1, 2].map((i) => {
    const from = a?.[i] ?? 0
    return from + ((b?.[i] ?? 0) - from) * weight
  }) as Triple
}

/** The pose `weight` of the way from `from` to `to`. */
export function mix(from: Pose, to: Pose, weight: number): Pose {
  if (weight <= 0) return from
  if (weight >= 1) return to
  const result: Pose = {}
  for (const bone of new Set([...Object.keys(from), ...Object.keys(to)])) {
    result[bone] = {
      rot: mixRotations(from[bone]?.rot, to[bone]?.rot, weight),
      pos: mixOffsets(from[bone]?.pos, to[bone]?.pos, weight),
    }
  }
  return result
}

// --- Arms and legs ----------------------------------------------------------

/** One arm, in left-arm numbers: shoulder, elbow and wrist rotations. */
export interface ArmPose {
  upper?: Triple
  fore?: Triple
  hand?: Triple
}

function mirrored(rot: Triple | undefined): Triple | undefined {
  return rot && [rot[0], -rot[1], -rot[2]]
}

/** A pose of both arms; the right arm is given in left-arm numbers too and mirrored. */
export function arms(left: ArmPose, right: ArmPose = left): Pose {
  return {
    'arm_L.001': { rot: left.upper },
    'arm_L.002': { rot: left.fore },
    'arm_L.003': { rot: left.hand },
    'arm_R.001': { rot: mirrored(right.upper) },
    'arm_R.002': { rot: mirrored(right.fore) },
    'arm_R.003': { rot: mirrored(right.hand) },
  }
}

/** One leg, in left-leg numbers: hip, knee and ankle rotations. */
export interface LegPose {
  thigh?: Triple
  shin?: Triple
  foot?: Triple
}

/** A pose of both legs; the right leg is given in left-leg numbers too and mirrored. */
export function legs(left: LegPose, right: LegPose = left): Pose {
  return {
    'Leg_L.001': { rot: left.thigh },
    'Leg_L.002': { rot: left.shin },
    foot_IK_L: { rot: left.foot },
    'Leg_R.001': { rot: mirrored(right.thigh) },
    'Leg_R.002': { rot: mirrored(right.shin) },
    foot_IK_R: { rot: mirrored(right.foot) },
  }
}

// --- Base poses -------------------------------------------------------------
// The arm poses here and in the clips were found numerically, by searching for
// the rotations that put the palm at a chosen spot facing a chosen way, so
// their numbers do not read as simple angles. To adjust one, nudge a single
// number and look at the result.

/** The hem of the hoodie, which is what rests on the seat, as a fraction of the standing height. */
const HEM_HEIGHT = 0.16 * CHARACTER_HEIGHT

/** How far the body is lifted off the ground for the hem to rest on the seat. */
export const SEAT_LIFT = SEAT_HEIGHT - HEM_HEIGHT

/** Arms hanging by the sides, as far out as the wide body pushes them. */
export const ARM_DOWN: ArmPose = { upper: [-0.22, -0.05, -0.83], fore: [0.17, 0.1, -0.45], hand: [-0.05, 0.02, 0.03] }

/**
 * A hand resting on the laptop: the fingertips on the keys, the cuff on the
 * laptop's near edge, and all of it inside the outline of the lid as the
 * camera sees it, wherever the pointer has taken the camera.
 */
export const ARM_ON_KEYS: ArmPose = { upper: [0.69, -1.3, 0.2], fore: [0.24, -0.77, 0.3], hand: [0.05, -0.04, 0.13] }

/** The same hand lifted a finger's breadth off the keys, still behind the lid. */
export const ARM_OVER_KEYS: ArmPose = { upper: [0.56, -1.16, 0.08], fore: [0.38, -1, 0.51], hand: [0.05, 0.06, 0.13] }

/** A hand lifted well clear of the laptop: the way a gesture leaves the keys and comes back to them. */
const ARM_CLEAR_OF_KEYS: ArmPose = { upper: [0.61, -0.96, 0.03], fore: [1.05, -1.1, 1.38], hand: [0.06, 0.24, 0.02] }

/** A hand lifted off the desk and drawn back to the chest, clear of the desk's edge; the body sits up for it. */
const ARM_TUCKED: ArmPose = { upper: [0.56, 0.73, -0.37], fore: [-0.19, -2.06, -0.57], hand: [0.13, -0.16, 0.27] }

/** One arm part of the way from one pose to another, each joint turning the short way round. */
export function mixArm(from: ArmPose, to: ArmPose, weight: number): ArmPose {
  if (weight <= 0) return from
  if (weight >= 1) return to
  return {
    upper: mixRotations(from.upper, to.upper, weight),
    fore: mixRotations(from.fore, to.fore, weight),
    hand: mixRotations(from.hand, to.hand, weight),
  }
}

/**
 * An arm `weight` of the way from the keys to the pose `to` of a gesture. It
 * lifts clear of the laptop first and only then goes on, so that the hand
 * never sweeps through the laptop or the desk; the way back is the same in
 * reverse.
 */
export function armFromKeys(to: ArmPose, weight: number): ArmPose {
  const lifted = mixArm(ARM_ON_KEYS, ARM_CLEAR_OF_KEYS, ramp(weight, 0, 0.4))
  return mixArm(lifted, to, ramp(weight, 0.12, 1))
}

/** Standing upright with the arms down. */
export const standingBase: Pose = {
  ...arms(ARM_DOWN),
}

/**
 * How far the seated body leans over the desk (radians). Its arms are short,
 * 30 cm from shoulder to wrist: it has to lean this far for its hands to rest
 * on the laptop.
 */
const SEAT_LEAN = 0.32

/**
 * Sitting on the chair, leaning over the desk with both hands on the laptop's
 * keys, behind its lid, and the feet dangling. The head stays upright.
 */
export const seatedBase: Pose = {
  'root 1': { pos: [0, SEAT_LIFT, 0] },
  body: { rot: [SEAT_LEAN, 0, 0] },
  head: { rot: [0.02 - SEAT_LEAN, 0, 0] },
  ...arms(ARM_ON_KEYS),
  ...legs({ thigh: [-0.5, 0, 0], foot: [0.4, 0, 0] }),
}

/**
 * Body and head of the seated character sitting up: as it leaned before its
 * hands went onto the laptop. The gestures that were shaped for that lean sit
 * up to it; their arms are their own.
 */
export const sittingUp: Pose = {
  body: { rot: [0.14, 0, 0] },
  head: { rot: [-0.12, 0, 0] },
}

/**
 * Seated, sitting up with the hands drawn back off the desk: what getting up
 * starts with and sitting down ends with, so that the hands never sweep
 * through the desk.
 */
export const seatedTucked: Pose = { ...seatedBase, ...sittingUp, ...arms(ARM_TUCKED) }

/** The seated pose `weight` of the way to `seatedTucked`, the hands leaving the keys by lifting clear of the laptop. */
export function tucking(weight: number): Pose {
  return { ...mix(seatedBase, seatedTucked, weight), ...arms(armFromKeys(ARM_TUCKED, weight)) }
}

/**
 * The slow rise and fall of breathing, added to whatever else the body does.
 * The chest rocks; the arms do not rock with it, so that hands which rest on
 * something stay on it.
 */
export function breathing(t: number): Pose {
  const breath = Math.sin((t * TAU) / 3.6)
  const chest = 0.012 * breath
  return {
    body: { rot: [chest, 0, 0] },
    head: { rot: [-0.01 * breath, 0, 0] },
    'arm_L.001': { rot: [-chest, 0, 0] },
    'arm_R.001': { rot: [-chest, 0, 0] },
  }
}
