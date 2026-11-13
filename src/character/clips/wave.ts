import { add, ARM_ON_KEYS, armFromKeys, arms, breathing, hold, mixArm, seatedBase, TAU, type ArmPose, type ProceduralClip } from './shared'

const DURATION = 2.2
/** Seconds the arm takes to go up, and to come back down. */
const RAISE = 0.45
/** Waves, there and back, per second. */
const RATE = 2.2

/**
 * The arm raised beside the head, the open hand up with its palm to the room
 * and its thumb on the head's side, at the inner and the outer end of a wave.
 * Between the two only the forearm swings, like a wiper, so the palm faces
 * the same way through the whole sweep.
 */
const ARM_WAVE_IN: ArmPose = { upper: [0.23, -0.14, 0.44], fore: [-1.31, -0.89, 0.78], hand: [-0.14, -0.04, 0] }
const ARM_WAVE_OUT: ArmPose = { upper: [0.23, -0.14, 0.44], fore: [-1.73, -0.37, 0.42], hand: [-0.14, 0.05, 0] }

/** A greeting: the right hand leaves the keys, waves a few times beside the head and goes back. */
export const wave: ProceduralClip = {
  duration: DURATION,
  sample: (time) => {
    const t = Math.min(time, DURATION)
    const raised = hold(t, 0, DURATION, RAISE)
    const outwards = 0.5 - 0.5 * Math.cos((t - RAISE) * TAU * RATE)
    const waving = armFromKeys(mixArm(ARM_WAVE_IN, ARM_WAVE_OUT, outwards), raised)
    return add(add({ ...seatedBase, ...arms(ARM_ON_KEYS, waving) }, breathing(t)), {
      // The head tips towards the waving hand.
      head: { rot: [-0.05 * raised, 0, 0.08 * raised] },
    })
  },
}
