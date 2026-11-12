import { add, ARM_ON_DESK, arms, breathing, hold, mix, seatedBase, TAU, type ArmPose, type Pose, type ProceduralClip } from './shared'

const DURATION = 2

/** The hand up at the side of the hood. */
const ARM_TO_HEAD: ArmPose = { upper: [2.49, -0.27, -0.81], fore: [0.4, 0.99, -0.87], hand: [0.2, -0.14, -0.31] }

const scratching: Pose = add({ ...seatedBase, ...arms(ARM_ON_DESK, ARM_TO_HEAD) }, {
  head: { rot: [0.06, 0, -0.14] },
  body: { rot: [0, 0, -0.04] },
})

/** Puzzled: a hand goes up to scratch the side of the head, then comes back down. */
export const scratchHead: ProceduralClip = {
  duration: DURATION,
  sample: (time) => {
    const t = Math.min(time, DURATION)
    const up = hold(t, 0, DURATION, 0.4)
    const scratch = Math.sin(t * TAU * 4) * up
    return add(add(mix(seatedBase, scratching, up), breathing(t)), {
      'arm_R.002': { rot: [0, 0, 0.1 * scratch] },
      'arm_R.003': { rot: [0, 0, 0.2 * scratch] },
    })
  },
}
