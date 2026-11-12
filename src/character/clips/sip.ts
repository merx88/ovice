import { add, ARM_ON_DESK, arms, hold, mix, ramp, seatedBase, type ArmPose, type Pose, type ProceduralClip } from './shared'

const DURATION = 3

/** The left arm stretched out towards the cup. */
const ARM_TO_CUP: ArmPose = { upper: [0.4, -0.61, -0.11], fore: [0.01, -0.42, 0.08], hand: [-0.15, -0.01, 0.12] }
/** The left hand raised to the mouth. */
const ARM_TO_MOUTH: ArmPose = { upper: [1.35, 2.53, 1.84], fore: [0.28, -0.09, -1.0], hand: [-0.09, -0.09, -0.2] }

const reaching: Pose = add({ ...seatedBase, ...arms(ARM_TO_CUP, ARM_ON_DESK) }, { body: { rot: [0, 0.12, -0.06] } })
const drinking: Pose = add({ ...seatedBase, ...arms(ARM_TO_MOUTH, ARM_ON_DESK) }, { head: { rot: [-0.2, 0, 0] } })

/** A coffee break: reach to the cup's side of the desk, bring the hand to the mouth, tip the head back, and settle. */
export const sip: ProceduralClip = {
  duration: DURATION,
  sample: (time) => {
    const t = Math.min(time, DURATION)
    const reach = hold(t, 0, 1.5, 0.55, 0.6)
    const drink = hold(t, 0.9, DURATION, 0.6, 0.7)
    const lifted = mix(seatedBase, reaching, reach)
    return mix(lifted, drinking, drink * (1 - 0.5 * reach) + ramp(t, 0.9, 1.5) * 0 )
  },
}
