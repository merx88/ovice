import { ARM_ON_KEYS, armFromKeys, arms, hold, mix, mixArm, ramp, seatedBase, type ArmPose, type Pose, type ProceduralClip } from './shared'

const DURATION = 4.6

/**
 * The cup is in the hand from `from` until `to` (seconds into the clip).
 * Whoever shows the cup moves it with the left hand between the two, and
 * leaves it standing in its place before and after.
 */
export const SIP_GRIP = { from: 0.8, to: 3.85 } as const

/**
 * The hand rests on the cup, perfectly still, for this long before and after
 * it takes hold and lets go: the longest step one frame may take, so that the
 * cup is taken from where it stands and set down where it stood however the
 * frames fall.
 */
const STILL = 0.1

/** The body starts to lean this long after the hand has started for the cup, and is back this long before the hand (s). */
const LEAN_AFTER = 0.15

/** The moments of the sip (s). */
const AT_CUP = SIP_GRIP.from - STILL
const LIFTS = SIP_GRIP.from + STILL
const AT_MOUTH = 1.85
const TILTED = 2.15
const UNTILTS = 2.5
const LOWERS = 2.8
const SET_DOWN = SIP_GRIP.to - STILL
const LEAVES = SIP_GRIP.to + STILL

// The left arm, in the order the sip goes through it. The first three belong
// to the body leaning over to the cup, the last two to the body sitting up
// with the cup.
/** The open hand a few centimetres short of the cup, behind it. */
const ARM_NEAR_CUP: ArmPose = { upper: [-1.244, 0.273, -0.809], fore: [0.109, -0.899, 0.76], hand: [-0.134, 0.089, -0.044] }
/** The palm against the side of the cup, the thumb up. */
const ARM_TO_CUP: ArmPose = { upper: [-1.306, 0.051, -0.944], fore: [-0.042, -0.592, 0.693], hand: [-0.129, -0.085, 0.09] }
/** The cup lifted straight up off the desk. */
const ARM_CUP_LIFTED: ArmPose = { upper: [-1.55, -0.357, -1.092], fore: [-0.11, -0.249, 1.145], hand: [-0.126, 0.055, -0.158] }
/** The cup upright in front of the mouth. */
const ARM_TO_MOUTH: ArmPose = { upper: [-1.693, -0.355, -0.936], fore: [-0.459, -0.432, -0.689], hand: [-0.173, 0.424, 0.088] }
/** The cup tipped towards the face, its rim at the mouth. */
const ARM_SIPPING: ArmPose = { upper: [-1.845, -0.605, -0.964], fore: [-0.368, -0.258, -0.499], hand: [-0.157, -0.17, -0.004] }

// The other hand cannot stay on the keys while the body turns: the arm is too
// short. It waits just off them, as near as it can.
const ARM_KEYS_WHILE_REACHING: ArmPose = { upper: [0.618, -1.466, 0.044], fore: [0.234, -0.604, 0.366], hand: [0.112, -0.363, 0.289] }
const ARM_KEYS_WHILE_DRINKING: ArmPose = { upper: [2.732, -1.386, 2.31], fore: [0.159, -0.476, 0.167], hand: [0.07, -0.241, 0.14] }

/**
 * Leaning over to the cup and looking at it. The cup stands beyond the short
 * arm's reach, so the body leans and turns its left shoulder to it.
 */
const reaching: Pose = {
  ...seatedBase,
  body: { rot: [0.4, -0.3, -0.2] },
  head: { rot: [-0.37, 0.63, 0.23] },
  ...arms(ARM_ON_KEYS, ARM_KEYS_WHILE_REACHING),
}

/** Sitting up with the cup, facing ahead; the left shoulder stays forward, or the cup would not reach the mouth. */
const drinking: Pose = {
  ...seatedBase,
  body: { rot: [0.32, -0.3, 0] },
  head: { rot: [-0.31, 0.29, 0.09] },
  ...arms(ARM_ON_KEYS, ARM_KEYS_WHILE_DRINKING),
}

/** The same with the head tipped back for the sip. */
const sipping: Pose = { ...drinking, head: { rot: [-0.44, 0.27, 0.13] } }

/** The left arm on its way from the keys (0) to the cup (1): clear of the laptop first, then onto the cup from behind. */
function toCup(weight: number): ArmPose {
  return mixArm(armFromKeys(ARM_NEAR_CUP, ramp(weight, 0, 0.85)), ARM_TO_CUP, ramp(weight, 0.7, 1))
}

/** The left arm carrying the cup from its place (0) to the mouth (1): straight up first, then across. */
function carrying(weight: number): ArmPose {
  return mixArm(mixArm(ARM_TO_CUP, ARM_CUP_LIFTED, ramp(weight, 0, 0.4)), ARM_TO_MOUTH, ramp(weight, 0.15, 1))
}

/**
 * A coffee break: the character leans over to the cup, takes it, lifts it to
 * its mouth, tips it for a sip with its head back a little, puts it back
 * where it stood and returns to the keys.
 */
export const sip: ProceduralClip = {
  duration: DURATION,
  sample: (time) => {
    const t = Math.min(time, DURATION)
    /** How far the cup is on its way from the desk to the mouth; it stays at the mouth while the character drinks. */
    const carried = hold(t, LIFTS, SET_DOWN, AT_MOUTH - LIFTS, SET_DOWN - LOWERS)
    /** How far the cup is tipped. */
    const tipped = hold(t, AT_MOUTH, LOWERS, TILTED - AT_MOUTH, LOWERS - UNTILTS)
    /** How far the hand is on its way from the keys to the cup, before it takes it and after it has let go. */
    const reached = hold(t, 0, DURATION, AT_CUP, DURATION - LEAVES)
    /** How far the body leans over to the cup: only once the hand has come up off the keys, or the lean would press it into them. */
    const leaning = hold(t, LEAN_AFTER, DURATION - LEAN_AFTER, AT_CUP - LEAN_AFTER, DURATION - LEAVES - LEAN_AFTER)

    const body = carried > 0 ? mix(reaching, mix(drinking, sipping, tipped), ramp(carried, 0.15, 1)) : mix(seatedBase, reaching, leaning)
    const left = arms(carried > 0 ? mixArm(carrying(carried), ARM_SIPPING, tipped) : toCup(reached))
    return { ...body, 'arm_L.001': left['arm_L.001'], 'arm_L.002': left['arm_L.002'], 'arm_L.003': left['arm_L.003'] }
  },
}
