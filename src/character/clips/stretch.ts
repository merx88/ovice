import { add, arms, hold, mix, seatedBase, TAU, type ArmPose, type Pose, type ProceduralClip } from './shared'

const DURATION = 3

/** Both arms thrown up and out. */
const ARM_UP: ArmPose = { upper: [-1.31, -0.81, 0.28], fore: [-0.41, -0.55, -0.26], hand: [0.06, -0.01, 0.08] }

const stretched: Pose = add({ ...seatedBase, ...arms(ARM_UP) }, {
  body: { rot: [-0.3, 0, 0] },
  head: { rot: [-0.18, 0, 0] },
})

/** A big stretch: arms up, leaning back, a little shake at the top, and back to the desk. */
export const stretch: ProceduralClip = {
  duration: DURATION,
  sample: (time) => {
    const t = Math.min(time, DURATION)
    const up = hold(t, 0, DURATION, 0.8, 0.9)
    const shake = Math.sin(t * TAU * 3) * hold(t, 0.9, 2.1, 0.3)
    return add(mix(seatedBase, stretched, up), {
      'arm_L.001': { rot: [0, 0, 0.04 * shake] },
      'arm_R.001': { rot: [0, 0, 0.04 * shake] },
      body: { rot: [0, 0, 0.02 * shake] },
    })
  },
}
