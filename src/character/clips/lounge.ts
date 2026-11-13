// On the sofa: the pose the character lounges in and the small things it does
// there. Every clip here starts and ends in the lounging pose.
import { SOFA_LIFT } from '../../scene/layout'
import { add, arms, breathing, hold, legs, mixArm, ramp, TAU, type ArmPose, type ClipName, type Pose, type ProceduralClip } from './shared'

/**
 * The clips played on the sofa. In all of them the hands rest on the legs, or
 * come back to them: whoever turns the character towards something it looks
 * at turns its head and leaves the body where it is, or the hands would be
 * dragged off the legs.
 */
export const LOUNGE_CLIPS: readonly ClipName[] = ['loungeIdle', 'loungeWave', 'loungeStretch', 'loungeLookAround']

/** How far the body leans back against the backrest (rad). */
const LOUNGE_LEAN = -0.15

/** A hand resting on the leg of its side, just in front of the tummy: the fingertips on the leg, the palm down. */
export const ARM_ON_LEG: ArmPose = { upper: [-0.246, -1.127, -1.04], fore: [0.179, -0.632, 0.274], hand: [0.044, 0.333, 0.012] }
/** The same hand lifted off the leg, by the shoulder alone. */
const ARM_OFF_LEG: ArmPose = { upper: [-0.246, -1.127, -0.78], fore: ARM_ON_LEG.fore, hand: ARM_ON_LEG.hand }

/** An arm on its way from the leg (0) to `to` (1): the hand comes up off the leg before it sets out. */
export function armFromLeg(to: ArmPose, weight: number): ArmPose {
  return mixArm(mixArm(ARM_ON_LEG, ARM_OFF_LEG, ramp(weight, 0, 0.4)), to, ramp(weight, 0.12, 1))
}

/**
 * Sitting back in the sofa like a child in a big chair: the hem on the
 * cushion, the back against the backrest, the short legs stretched out over
 * the cushion's edge and both hands resting on them. The head stays upright.
 */
export const loungeBase: Pose = {
  'root 1': { pos: [0, SOFA_LIFT, 0] },
  body: { rot: [LOUNGE_LEAN, 0, 0] },
  head: { rot: [-LOUNGE_LEAN, 0, 0] },
  ...arms(ARM_ON_LEG),
  ...legs({ thigh: [-1.42, 0, 0.08], shin: [0.45, 0, 0], foot: [-0.2, 0, 0] }),
}

/** Lounging: sitting back, breathing, the hands on the legs. */
export const loungeIdle: ProceduralClip = {
  duration: null,
  sample: (t) => add(loungeBase, breathing(t)),
}

// --- The wave -----------------------------------------------------------------

const WAVE = { duration: 2.2, raise: 0.45, rate: 2.2 } as const

/**
 * The arm raised beside the head, the open hand up with its palm to the room
 * and its thumb on the head's side, at the inner and the outer end of a wave;
 * only the forearm swings between the two (see the wave at the desk).
 */
const ARM_WAVE_IN: ArmPose = { upper: [-1.04, -0.42, -0.2], fore: [0.36, -0.89, 0.78], hand: [-0.14, -0.04, 0] }
const ARM_WAVE_OUT: ArmPose = { upper: [-1.04, -0.42, -0.2], fore: [-0.06, -0.37, 0.42], hand: [-0.14, 0.05, 0] }

/** A greeting from the sofa: the right hand leaves the leg, waves beside the head and goes back. */
export const loungeWave: ProceduralClip = {
  duration: WAVE.duration,
  sample: (time) => {
    const t = Math.min(time, WAVE.duration)
    const raised = hold(t, 0, WAVE.duration, WAVE.raise)
    const outwards = 0.5 - 0.5 * Math.cos((t - WAVE.raise) * TAU * WAVE.rate)
    const waving = armFromLeg(mixArm(ARM_WAVE_IN, ARM_WAVE_OUT, outwards), raised)
    return add(add({ ...loungeBase, ...arms(ARM_ON_LEG, waving) }, breathing(t)), {
      // The head tips towards the waving hand.
      head: { rot: [-0.05 * raised, 0, 0.08 * raised] },
    })
  },
}

// --- The stretch --------------------------------------------------------------

const STRETCH_DURATION = 3

/** Both arms thrown up and out. */
const ARM_UP: ArmPose = { upper: [0.17, 0.25, 0.92], fore: [1.19, 0.47, 0.02], hand: [0.02, -0.07, 0] }

/** A big stretch: arms up, pressing back into the sofa with the head thrown back, a little shake at the top, and the hands back on the legs. */
export const loungeStretch: ProceduralClip = {
  duration: STRETCH_DURATION,
  sample: (time) => {
    const t = Math.min(time, STRETCH_DURATION)
    const up = hold(t, 0, STRETCH_DURATION, 0.8, 0.9)
    const shake = Math.sin(t * TAU * 3) * hold(t, 0.9, 2.1, 0.3)
    return add({ ...loungeBase, ...arms(armFromLeg(ARM_UP, up)) }, {
      // The sofa gives a little; the legs lift with the effort.
      body: { rot: [-0.07 * up, 0, 0.02 * shake] },
      head: { rot: [-0.22 * up, 0, 0] },
      'arm_L.001': { rot: [0, 0, 0.04 * shake] },
      'arm_R.001': { rot: [0, 0, 0.04 * shake] },
      'Leg_L.001': { rot: [-0.1 * up, 0, 0] },
      'Leg_R.001': { rot: [-0.1 * up, 0, 0] },
    })
  },
}

// --- The look around ----------------------------------------------------------

const LOOK_DURATION = 3

/** A look around the room: to one side, to the other, and back. The head alone turns; the hands stay on the legs. */
export const loungeLookAround: ProceduralClip = {
  duration: LOOK_DURATION,
  sample: (time) => {
    const t = Math.min(time, LOOK_DURATION)
    const side = hold(t, 0, 1.5, 0.5) - hold(t, 1.4, LOOK_DURATION, 0.5)
    return add(add(loungeBase, breathing(t)), {
      head: { rot: [-0.06 * Math.abs(side), 0.66 * side, 0.05 * side] },
    })
  },
}
