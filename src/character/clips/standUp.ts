import { add, ARM_TUCKED, arms, hold, mix, ramp, seatedBase, standingBase, type Pose, type ProceduralClip } from './shared'

const DURATION = 0.9

/** Seated, with the hands drawn back off the desk. */
const tucked: Pose = { ...seatedBase, ...arms(ARM_TUCKED) }

/** Off the chair: the hands leave the desk, the body leans forward and drops onto its feet. Ends in the standing pose. */
export const standUp: ProceduralClip = {
  duration: DURATION,
  sample: (time) => {
    const t = Math.min(time, DURATION)
    const lean = hold(t, 0, DURATION, 0.35, 0.45)
    const seated = mix(seatedBase, tucked, ramp(t, 0, 0.3))
    return add(mix(seated, standingBase, ramp(t, 0.25, DURATION)), {
      body: { rot: [0.16 * lean, 0, 0] },
      'root 1': { pos: [0, 0.03 * lean, 0] },
    })
  },
}
