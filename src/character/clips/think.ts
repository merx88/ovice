import { add, ARM_ON_DESK, arms, breathing, seatedBase, TAU, type ArmPose, type Pose, type ProceduralClip } from './shared'

/** The hand raised to the chin. */
const ARM_TO_CHIN: ArmPose = { upper: [2.51, 1.12, 0.53], fore: [-0.16, 1.28, 0.39], hand: [0.55, -0.19, -0.31] }

const thinkBase: Pose = add({ ...seatedBase, ...arms(ARM_ON_DESK, ARM_TO_CHIN) }, {
  head: { rot: [0, -0.08, -0.06] },
})

/** Thinking it over: one hand at the chin, the other on the desk, the head tilting slowly. */
export const think: ProceduralClip = {
  duration: null,
  sample: (t) => {
    const ponder = Math.sin((t * TAU) / 4.2)
    const tapping = Math.max(0, Math.sin(t * TAU * 1.1))
    return add(add(thinkBase, breathing(t)), {
      head: { rot: [0.02 * ponder, 0.05 * ponder, 0.04 * ponder] },
      'arm_R.003': { rot: [0, 0.1 * tapping, 0] },
    })
  },
}
