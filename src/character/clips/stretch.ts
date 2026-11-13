import { add, armFromKeys, arms, hold, mix, seatedBase, sittingUp, TAU, type ArmPose, type Pose, type ProceduralClip } from './shared'

const DURATION = 3

/** Both arms thrown up and out. */
const ARM_UP: ArmPose = { upper: [0.17, 0.25, 0.92], fore: [1.19, 0.47, 0.02], hand: [0.02, -0.07, 0] }

/** Sitting up and leaning back, the head thrown back with it. */
const leaningBack: Pose = add({ ...seatedBase, ...sittingUp }, {
  body: { rot: [-0.3, 0, 0] },
  head: { rot: [-0.18, 0, 0] },
})

/** A big stretch: sitting up, arms up, leaning back, a little shake at the top, and back to the keys. */
export const stretch: ProceduralClip = {
  duration: DURATION,
  sample: (time) => {
    const t = Math.min(time, DURATION)
    const up = hold(t, 0, DURATION, 0.8, 0.9)
    const shake = Math.sin(t * TAU * 3) * hold(t, 0.9, 2.1, 0.3)
    return add({ ...mix(seatedBase, leaningBack, up), ...arms(armFromKeys(ARM_UP, up)) }, {
      'arm_L.001': { rot: [0, 0, 0.04 * shake] },
      'arm_R.001': { rot: [0, 0, 0.04 * shake] },
      body: { rot: [0, 0, 0.02 * shake] },
    })
  },
}
