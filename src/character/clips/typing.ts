import { add, arms, breathing, seatedBase, TAU, type ArmPose, type Pose, type ProceduralClip } from './shared'

/** A hand on the keyboard, behind the laptop's lid. */
const ARM_ON_KEYS: ArmPose = { upper: [0.91, -1.09, 0.37], fore: [0.04, -0.66, 0.28], hand: [-0.02, -0.04, 0.08] }

const typingBase: Pose = add({ ...seatedBase, ...arms(ARM_ON_KEYS) }, {
  body: { rot: [0.06, 0, 0] },
  head: { rot: [0.12, 0, 0] },
})

/** Keystrokes per second of each hand; the hands run at different rates so they never fall into step. */
const LEFT_RATE = 5.3
const RIGHT_RATE = 4.1

/** How far a hand has lifted off the keys, 0..1. */
function lift(t: number, rate: number, phase: number): number {
  return 0.5 + 0.5 * Math.sin(t * TAU * rate + phase)
}

/** Typing on the laptop: the hands patter on the keys while the eyes follow the text. */
export const typing: ProceduralClip = {
  duration: null,
  sample: (t) => {
    const left = lift(t, LEFT_RATE, 0)
    const right = lift(t, RIGHT_RATE, 1)
    const reading = Math.sin((t * TAU) / 2.8)
    return add(add(typingBase, breathing(t)), {
      'arm_L.002': { rot: [0, 0, 0.12 * left] },
      'arm_L.003': { rot: [0, 0, 0.2 * left] },
      'arm_R.002': { rot: [0, 0, -0.12 * right] },
      'arm_R.003': { rot: [0, 0, -0.2 * right] },
      head: { rot: [0.02 * Math.sin(t * TAU * 0.9), 0.06 * reading, 0] },
    })
  },
}
