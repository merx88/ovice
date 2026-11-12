import { add, arms, breathing, TAU, type ArmPose, type Pose, type ProceduralClip } from './shared'

/** An arm held forward at waist height, the hand gripping the folder's edge. */
const ARM_HOLDING: ArmPose = { upper: [-0.71, -0.43, -1.05], fore: [-0.31, -0.22, -0.69], hand: [-0.06, -0.25, 0.03] }

const holding: Pose = {
  ...arms(ARM_HOLDING),
  head: { rot: [-0.06, 0, 0] },
}

/** How far the body rises and falls (m), and how long one rise and fall takes (s). */
const BOB = { height: 0.008, period: 1.8 } as const

/** Standing with the folder held out in both hands, bobbing gently. */
export const holdFile: ProceduralClip = {
  duration: null,
  sample: (t) => {
    const bob = Math.sin((t * TAU) / BOB.period)
    const rise = BOB.height * bob
    return add(add(holding, breathing(t)), {
      // The body bobs; the feet stay where they are.
      'root 1': { pos: [0, rise, 0] },
      foot_IK_L: { pos: [0, -rise, 0] },
      foot_IK_R: { pos: [0, -rise, 0] },
      'arm_L.001': { rot: [0.03 * bob, 0, 0] },
      'arm_R.001': { rot: [0.03 * bob, 0, 0] },
      head: { rot: [0, 0, 0.03 * Math.sin((t * TAU) / (BOB.period * 2))] },
    })
  },
}
