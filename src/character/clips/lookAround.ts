import { add, breathing, hold, seatedBase, type ProceduralClip } from './shared'

const DURATION = 3

/** A look around the room: to one side, to the other, and back to the screen. */
export const lookAround: ProceduralClip = {
  duration: DURATION,
  sample: (time) => {
    const t = Math.min(time, DURATION)
    const side = hold(t, 0, 1.5, 0.5) - hold(t, 1.4, DURATION, 0.5)
    return add(add(seatedBase, breathing(t)), {
      head: { rot: [-0.06 * Math.abs(side), 0.6 * side, 0] },
      body: { rot: [0, 0.14 * side, 0] },
      // The arms stay on the desk while the chest turns.
      'arm_L.001': { rot: [0, -0.12 * side, 0] },
      'arm_R.001': { rot: [0, -0.12 * side, 0] },
    })
  },
}
