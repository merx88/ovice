import { add, ARM_DOWN, arms, legs, standingBase, TAU, type ProceduralClip } from './shared'

/** Seconds per full cycle (two steps). */
const CYCLE = 0.62
/** How far each leg swings forward and back, in radians. */
const STRIDE = 0.55
/** How far each arm swings, in radians. */
const ARM_SWING = 0.45

/** Walking on the spot; whoever plays the clip moves the character. */
export const walk: ProceduralClip = {
  duration: null,
  sample: (t) => {
    const phase = (t / CYCLE) * TAU
    const swing = Math.sin(phase)
    // A foot lifts while it swings forward.
    const leftLift = Math.max(0, Math.cos(phase))
    const rightLift = Math.max(0, -Math.cos(phase))
    return add(standingBase, {
      'root 1': { pos: [0, 0.025 * Math.abs(Math.cos(phase)), 0] },
      body: { rot: [0.06, 0.07 * swing, 0.03 * swing] },
      head: { rot: [-0.03, -0.05 * swing, -0.02 * swing] },
      hip: { rot: [0, -0.06 * swing, 0] },
      ...arms(
        { upper: [ARM_SWING * swing + ARM_DOWN.upper![0], ARM_DOWN.upper![1], ARM_DOWN.upper![2]], fore: ARM_DOWN.fore },
        { upper: [-ARM_SWING * swing + ARM_DOWN.upper![0], ARM_DOWN.upper![1], ARM_DOWN.upper![2]], fore: ARM_DOWN.fore },
      ),
      ...legs(
        { thigh: [-STRIDE * swing, 0, 0], shin: [0.5 * leftLift, 0, 0] },
        { thigh: [STRIDE * swing, 0, 0], shin: [0.5 * rightLift, 0, 0] },
      ),
    })
  },
}
