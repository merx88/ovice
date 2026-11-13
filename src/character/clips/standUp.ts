import { add, hold, mix, ramp, standingBase, tucking, type ProceduralClip } from './shared'

const DURATION = 0.9

/** Off the chair: the hands leave the keys, the body leans forward and drops onto its feet. Ends in the standing pose. */
export const standUp: ProceduralClip = {
  duration: DURATION,
  sample: (time) => {
    const t = Math.min(time, DURATION)
    const lean = hold(t, 0, DURATION, 0.35, 0.45)
    const seated = tucking(ramp(t, 0, 0.3))
    return add(mix(seated, standingBase, ramp(t, 0.25, DURATION)), {
      body: { rot: [0.16 * lean, 0, 0] },
      'root 1': { pos: [0, 0.03 * lean, 0] },
    })
  },
}
