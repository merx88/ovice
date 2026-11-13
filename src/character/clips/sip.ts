import { add, ARM_ON_DESK, arms, hold, mix, ramp, seatedBase, sittingUp, type ArmPose, type Pose, type ProceduralClip } from './shared'

const DURATION = 3
/** When the hand has reached the cup's side of the desk, and when it has come up to the mouth (s). */
const AT_CUP = 0.6
const AT_MOUTH = 1.5
/** How long the hand takes to go back down to the desk (s). */
const LOWER = 0.7

/** The left arm stretched out over the desk towards the cup. */
const ARM_TO_CUP: ArmPose = { upper: [-0.4, -0.14, -0.57], fore: [0.23, -0.74, 0.08], hand: [0.2, 0.04, 0.09] }
/** The left hand raised to the mouth. */
const ARM_TO_MOUTH: ArmPose = { upper: [1.35, 2.53, 1.84], fore: [0.28, -0.09, -1.0], hand: [-0.09, -0.09, -0.2] }

const reaching: Pose = add({ ...seatedBase, ...sittingUp, ...arms(ARM_TO_CUP, ARM_ON_DESK) }, { body: { rot: [0, 0.12, -0.06] } })
const drinking: Pose = add({ ...seatedBase, ...sittingUp, ...arms(ARM_TO_MOUTH, ARM_ON_DESK) }, { head: { rot: [-0.2, 0, 0] } })

/**
 * A coffee break, mimed: the hand reaches towards the cup, comes up to the
 * mouth, the head tips back for the sip, and the hand settles on the desk.
 */
export const sip: ProceduralClip = {
  duration: DURATION,
  sample: (time) => {
    const t = Math.min(time, DURATION)
    // Once the hand is at the mouth it goes straight back to the desk, not by way of the cup.
    const reach = t < AT_MOUTH ? ramp(t, 0, AT_CUP) : 0
    const drink = hold(t, AT_CUP + 0.3, DURATION, AT_MOUTH - AT_CUP - 0.3, LOWER)
    return mix(mix(seatedBase, reaching, reach), drinking, drink)
  },
}
