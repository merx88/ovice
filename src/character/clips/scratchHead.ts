import { add, ARM_ON_KEYS, armFromKeys, arms, breathing, hold, mix, seatedBase, TAU, type ArmPose, type Pose, type ProceduralClip } from './shared'

const DURATION = 2

/** The hand up at the side of the hood. */
const ARM_TO_HEAD: ArmPose = { upper: [-1.73, -0.55, 0.58], fore: [-1.21, 0.59, -1.15], hand: [-0.2, -0.16, -0.28] }

/** While it scratches, the head tips towards the hand. */
const puzzled: Pose = add(seatedBase, { head: { rot: [0.06, 0, -0.14] } })

/** Puzzled: a hand goes up to scratch the side of the head, then comes back down to the keys. */
export const scratchHead: ProceduralClip = {
  duration: DURATION,
  sample: (time) => {
    const t = Math.min(time, DURATION)
    const up = hold(t, 0, DURATION, 0.4)
    const scratch = Math.sin(t * TAU * 4) * up
    return add(add({ ...mix(seatedBase, puzzled, up), ...arms(ARM_ON_KEYS, armFromKeys(ARM_TO_HEAD, up)) }, breathing(t)), {
      'arm_R.002': { rot: [0, 0, 0.1 * scratch] },
      'arm_R.003': { rot: [0, 0, 0.2 * scratch] },
    })
  },
}
