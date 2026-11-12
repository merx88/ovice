import { add, breathing, hold, seatedBase, TAU, type ProceduralClip } from './shared'

const DURATION = 2

/** Taps per second of each hand. */
const RATE = 4

/** Drumming on the desk beside the laptop, one hand after the other. */
export const tap: ProceduralClip = {
  duration: DURATION,
  sample: (time) => {
    const t = Math.min(time, DURATION)
    const drumming = hold(t, 0, DURATION, 0.25)
    const left = Math.max(0, Math.sin(t * TAU * RATE)) * drumming
    const right = Math.max(0, Math.sin(t * TAU * RATE + Math.PI)) * drumming
    return add(add(seatedBase, breathing(t)), {
      'arm_L.002': { rot: [0, 0, 0.16 * left] },
      'arm_L.003': { rot: [0, 0, 0.3 * left] },
      'arm_R.002': { rot: [0, 0, -0.16 * right] },
      'arm_R.003': { rot: [0, 0, -0.3 * right] },
      head: { rot: [0.03 * drumming, 0, 0.05 * Math.sin(t * TAU * (RATE / 4)) * drumming] },
    })
  },
}
