import { add, ARM_ON_DESK, arms, breathing, hold, mix, seatedBase, TAU, type ArmPose, type Pose, type ProceduralClip } from './shared'

const DURATION = 2.2

/** The arm raised beside the head, hand up. */
const ARM_RAISED: ArmPose = { upper: [-1.72, -0.36, -0.33], fore: [0.07, -0.68, 0.15], hand: [0.09, -0.07, 0.06] }

const raised: Pose = add({ ...seatedBase, ...arms(ARM_ON_DESK, ARM_RAISED) }, {
  head: { rot: [-0.05, 0, 0.08] },
})

/** A greeting: the right arm goes up, waves a few times and comes back down. */
export const wave: ProceduralClip = {
  duration: DURATION,
  sample: (time) => {
    const t = Math.min(time, DURATION)
    const up = hold(t, 0, DURATION, 0.4)
    const swing = Math.sin((t - 0.3) * TAU * 2.2) * up
    return add(add(mix(seatedBase, raised, up), breathing(t)), {
      'arm_R.001': { rot: [0, 0, 0.12 * swing] },
      'arm_R.002': { rot: [0, 0, 0.4 * swing] },
    })
  },
}
