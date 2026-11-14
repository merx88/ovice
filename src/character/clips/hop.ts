// On and off the sofa. Both clips are played with the character placed on the
// sofa's seat spot: where it stands on the floor in front of the sofa is in
// the pose, as an offset of the root.
import { SOFA_FACING, SOFA_SEAT_POS, SOFA_STAND_POS } from '../../scene/layout'
import { add, ARM_DOWN, arms, clamp01, mix, ramp, standingBase, type ArmPose, type ClipName, type Pose, type ProceduralClip, type Triple } from './shared'
import { LOUNGE_CLIPS, loungeBase } from './lounge'
import { run } from './run'

/**
 * The clips that are played with the character placed on the sofa's seat
 * spot: lounging there, and the two hops, which carry the body between the
 * seat and the floor in front of the sofa themselves. Whoever places the
 * character puts it on the seat spot exactly while it is shown one of these.
 */
export const SEAT_SPOT_CLIPS: readonly ClipName[] = [...LOUNGE_CLIPS, 'hopOn', 'hopOff']

/** From the seat spot to the stand spot, in the axes of a character facing the way it sits on the sofa. */
const TO_STAND: Triple = (() => {
  const dx = SOFA_STAND_POS[0] - SOFA_SEAT_POS[0]
  const dz = SOFA_STAND_POS[2] - SOFA_SEAT_POS[2]
  const cos = Math.cos(SOFA_FACING)
  const sin = Math.sin(SOFA_FACING)
  return [dx * cos - dz * sin, 0, dx * sin + dz * cos]
})()

/** `pose` with the body `share` of the way from the seat spot to the stand spot, and `height` above where the pose has it. */
function placed(pose: Pose, share: number, height = 0): Pose {
  return add(pose, { 'root 1': { pos: [TO_STAND[0] * share, height, TO_STAND[2] * share] } })
}

/** Both arms flung up and out for balance, in mid-air. */
const ARM_FLUNG: ArmPose = { upper: [-0.3, 0.1, 0.25], fore: [0.3, 0.2, -0.35], hand: [0, 0, 0] }

// --- Onto the sofa ------------------------------------------------------------

const ON = { duration: 0.6, crouch: 0.16, landing: 0.5 } as const
/** How high the hop carries the hips above the straight line from the floor to the cushion (m). */
const ON_ARC = 0.2

/** Standing in front of the sofa, its back to it. */
const standing: Pose = placed(standingBase, 1)
/** Crouched to jump: knees bent, leaning forward, arms back. */
const crouched: Pose = add(placed(standingBase, 1, -0.05), {
  body: { rot: [0.3, 0, 0] },
  head: { rot: [-0.18, 0, 0] },
  'arm_L.001': { rot: [0.55, 0, 0] },
  'arm_R.001': { rot: [0.55, 0, 0] },
  'Leg_L.001': { rot: [-0.35, 0, 0] },
  'Leg_R.001': { rot: [-0.35, 0, 0] },
  foot_IK_L: { rot: [0.35, 0, 0], pos: [0, 0.035, 0] },
  foot_IK_R: { rot: [0.35, 0, 0], pos: [0, 0.035, 0] },
})
/** In mid-air above the cushion's edge: legs coming forward, arms flung up. */
const airborne: Pose = { ...loungeBase, body: { rot: [0.05, 0, 0] }, head: { rot: [-0.05, 0, 0] }, ...arms(ARM_FLUNG) }

/**
 * A small jump backwards and up onto the sofa: a crouch, the hop, and landing
 * seated with a little bounce. Starts standing over the stand spot and ends
 * in the lounging pose.
 */
export const hopOn: ProceduralClip = {
  duration: ON.duration,
  sample: (time) => {
    const t = Math.min(time, ON.duration)
    if (t <= ON.crouch) return mix(standing, crouched, ramp(t, 0, ON.crouch))
    /** How far the hop has come, from leaving the floor to sitting. */
    const flight = clamp01((t - ON.crouch) / (ON.landing - ON.crouch))
    // Up first and back after: the hips have to clear the cushion's edge.
    const back = ramp(flight, 0.14, 1)
    const up = Math.sin(Math.PI * flight) * ON_ARC
    // The cushion gives under the landing and comes back.
    const settle = ramp(t, ON.landing, ON.duration)
    const dip = t > ON.landing ? -0.012 * Math.sin(Math.PI * settle) : 0
    const inAir = mix(mix(crouched, airborne, ramp(flight, 0, 0.45)), loungeBase, ramp(flight, 0.5, 1))
    // The root is steered apart from the pose: straight along the hop's line, with the arc on top.
    const from = crouched['root 1']?.pos ?? [0, 0, 0]
    const to = loungeBase['root 1']?.pos ?? [0, 0, 0]
    return {
      ...inAir,
      'root 1': { pos: [from[0] + (to[0] - from[0]) * back, from[1] + (to[1] - from[1]) * ramp(flight, 0, 0.8) + up + dip, from[2] + (to[2] - from[2]) * back] },
    }
  },
}

// --- Off the sofa -------------------------------------------------------------

const OFF = { duration: 0.35, push: 0.08 } as const

/** Landed on the floor in front of the sofa in the run's first stride, a little low. */
const landed: Pose = placed(run.sample(0), 1)
/** Pushing off the cushion: leaning forward, hands off the legs. */
const pushing: Pose = add({ ...loungeBase, ...arms(ARM_DOWN) }, { body: { rot: [0.45, 0, 0] }, head: { rot: [-0.3, 0, 0] } })

/**
 * Off the sofa in a hurry: a push forward off the cushion and a short drop
 * onto the feet, landing in the run's first stride. Starts in the lounging
 * pose and ends over the stand spot.
 */
export const hopOff: ProceduralClip = {
  duration: OFF.duration,
  sample: (time) => {
    const t = Math.min(time, OFF.duration)
    const leaving = ramp(t, 0, OFF.duration)
    const pose = mix(mix(loungeBase, pushing, ramp(t, 0, OFF.push + 0.1)), landed, ramp(t, OFF.push, OFF.duration))
    const from = loungeBase['root 1']?.pos ?? [0, 0, 0]
    const to = landed['root 1']?.pos ?? [0, 0, 0]
    // Forward off the edge first, down after.
    const forward = ramp(t, 0, OFF.duration * 0.85)
    const down = leaving ** 3
    return { ...pose, 'root 1': { pos: [from[0] + (to[0] - from[0]) * forward, from[1] + (to[1] - from[1]) * down + 0.05 * Math.sin(Math.PI * leaving), from[2] + (to[2] - from[2]) * forward] } }
  },
}
