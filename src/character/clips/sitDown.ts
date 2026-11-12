import { add, ARM_TUCKED, arms, hold, mix, ramp, seatedBase, standingBase, type Pose, type ProceduralClip } from './shared'

const DURATION = 0.9

/** Seated, with the hands held back from the desk. */
const tucked: Pose = { ...seatedBase, ...arms(ARM_TUCKED) }

/** Up onto the chair: a small hop, then the hands come down on the desk. Ends in the seated pose. */
export const sitDown: ProceduralClip = {
  duration: DURATION,
  sample: (time) => {
    const t = Math.min(time, DURATION)
    const hop = hold(t, 0, DURATION, 0.4, 0.4)
    const seated = mix(tucked, seatedBase, ramp(t, 0.6, DURATION))
    return add(mix(standingBase, seated, ramp(t, 0, 0.65)), {
      body: { rot: [0.1 * hop, 0, 0] },
      'root 1': { pos: [0, 0.04 * hop, 0] },
    })
  },
}
