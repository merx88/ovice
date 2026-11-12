import { add, arms, breathing, TAU, type ArmPose, type Pose, type ProceduralClip } from './shared'

/** An arm held forward at waist height, the hand gripping the folder's edge. */
const ARM_HOLDING: ArmPose = { upper: [-0.71, -0.43, -1.05], fore: [-0.31, -0.22, -0.69], hand: [-0.06, -0.25, 0.03] }

const holding: Pose = {
  ...arms(ARM_HOLDING),
  head: { rot: [-0.06, 0, 0] },
}

/** Standing with the folder held out in both hands, bobbing gently. */
export const holdFile: ProceduralClip = {
  duration: null,
  sample: (t) => {
    const bob = Math.sin((t * TAU) / 1.8)
    return add(add(holding, breathing(t)), {
      'root 1': { pos: [0, 0.008 * bob, 0] },
      'arm_L.001': { rot: [0.03 * bob, 0, 0] },
      'arm_R.001': { rot: [0.03 * bob, 0, 0] },
      head: { rot: [0, 0, 0.03 * Math.sin((t * TAU) / 3.6)] },
    })
  },
}
