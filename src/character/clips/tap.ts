import { add, ARM_ON_KEYS, ARM_OVER_KEYS, arms, breathing, hold, mixArm, seatedBase, TAU, type ArmPose, type ProceduralClip } from './shared'

const DURATION = 2
/** How long the hand takes to come out from behind the laptop, and to go back (s). */
const TRAVEL = 0.4
/** Taps per second. */
const RATE = 5

/** The hand on the desk beside the laptop, fingertips down, and the same hand lifted off the desk. */
const ARM_BESIDE: ArmPose = { upper: [0.07, -0.74, -0.62], fore: [0.13, -0.28, 0.35], hand: [0.06, -0.32, 0.15] }
const ARM_BESIDE_UP: ArmPose = { upper: [0.11, -0.59, -0.66], fore: [0.22, -0.48, 0.61], hand: [0.04, -0.24, 0.09] }

/**
 * A fidget: the right hand comes out from behind the laptop, drums its
 * fingers on the desk beside it and goes back to the keys. The other hand
 * stays where it is.
 */
export const tap: ProceduralClip = {
  duration: DURATION,
  sample: (time) => {
    const t = Math.min(time, DURATION)
    /** Where the hand is between the keys (0) and the desk beside the laptop (1). */
    const out = hold(t, 0, DURATION, TRAVEL)
    /** On the way it is lifted over the laptop's edge; beside the laptop it lifts with every beat. */
    const hop = Math.min(1, 1.5 * Math.sin(Math.PI * out))
    const drumming = hold(t, TRAVEL, DURATION - TRAVEL, 0.1)
    const beat = drumming * Math.max(0, Math.sin((t - TRAVEL) * TAU * RATE))
    const lifted = Math.max(hop, 0.8 * beat)
    const hand = mixArm(mixArm(ARM_ON_KEYS, ARM_BESIDE, out), mixArm(ARM_OVER_KEYS, ARM_BESIDE_UP, out), lifted)
    return add(add({ ...seatedBase, ...arms(ARM_ON_KEYS, hand) }, breathing(t)), {
      // The eyes go to the drumming hand, and the head nods along a little.
      head: { rot: [0.05 * out + 0.02 * beat, -0.24 * out, -0.04 * out] },
    })
  },
}
