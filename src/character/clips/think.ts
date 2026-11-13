import { add, ARM_ON_KEYS, armFromKeys, arms, breathing, mix, ramp, seatedBase, TAU, type ArmPose, type Pose, type ProceduralClip } from './shared'

/** The hand raised to the chin. */
const ARM_TO_CHIN: ArmPose = { upper: [-1.94, 0.41, -1.19], fore: [0.04, 0.8, -1.05], hand: [-0.25, -0.15, -0.33] }

/** While it thinks, the head is turned a little away from the hand. */
const pondering: Pose = add(seatedBase, { head: { rot: [0, -0.08, -0.06] } })

/** How long the hand takes to come up from the keys when the clip begins (s). */
const RAISE = 0.45

/** Thinking it over: one hand at the chin, the other on the keys, the head tilting slowly. */
export const think: ProceduralClip = {
  duration: null,
  sample: (t) => {
    const raised = ramp(t, 0, RAISE)
    const ponder = Math.sin((t * TAU) / 4.2)
    // The hand at the chin taps now and then.
    const tapping = Math.max(0, Math.sin(t * TAU * 1.1)) * raised
    return add(add({ ...mix(seatedBase, pondering, raised), ...arms(ARM_ON_KEYS, armFromKeys(ARM_TO_CHIN, raised)) }, breathing(t)), {
      head: { rot: [0.02 * ponder, 0.05 * ponder, 0.04 * ponder] },
      'arm_R.003': { rot: [0, 0.1 * tapping, 0] },
    })
  },
}
