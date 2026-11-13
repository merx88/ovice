import { add, ARM_ON_DESK, arms, breathing, hold, mix, seatedBase, sittingUp, TAU, type ArmPose, type Pose, type ProceduralClip } from './shared'

const DURATION = 2.2
/** Seconds the arm takes to go up, and to come back down. */
const RAISE = 0.4
/** Waves, there and back, per second. */
const RATE = 2.2
/** How much of the way from the inner to the outer end the hand sweeps. */
const SWEEP = 0.8

/** The arm raised beside the head with the hand up, at the inner and the outer end of a wave. */
const ARM_WAVE_IN: ArmPose = { upper: [2.15, 0.35, -0.23], fore: [0.11, 0.83, -0.3], hand: [-0.26, 0.01, -0.16] }
const ARM_WAVE_OUT: ArmPose = { upper: [1.29, 0.42, 0.29], fore: [0.12, -0.01, -0.08], hand: [0.01, 0.07, 0.01] }

/** The head tips towards the waving hand. */
const greeting: Pose = { head: { rot: [-0.05, 0, 0.08] } }
const wavingIn: Pose = add({ ...seatedBase, ...sittingUp, ...arms(ARM_ON_DESK, ARM_WAVE_IN) }, greeting)
const wavingOut: Pose = add({ ...seatedBase, ...sittingUp, ...arms(ARM_ON_DESK, ARM_WAVE_OUT) }, greeting)

/** A greeting: the right arm goes up, waves a few times and comes back down to the desk. */
export const wave: ProceduralClip = {
  duration: DURATION,
  sample: (time) => {
    const t = Math.min(time, DURATION)
    const raised = hold(t, 0, DURATION, RAISE)
    const outwards = SWEEP * (0.5 + 0.5 * Math.sin((t - RAISE) * TAU * RATE))
    return add(mix(seatedBase, mix(wavingIn, wavingOut, outwards), raised), breathing(t))
  },
}
