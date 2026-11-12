import { add, arms, breathing, seatedBase, TAU, type ArmPose, type Pose, type ProceduralClip } from './shared'

/** A hand on the keyboard, behind the laptop's lid. */
const ARM_ON_KEYS: ArmPose = { upper: [1.67, -1.5, 1.25], fore: [0.19, -0.43, 0.13], hand: [-0.07, 0.08, 0.06] }

const typingBase: Pose = add({ ...seatedBase, ...arms(ARM_ON_KEYS) }, {
  body: { rot: [0.06, 0, 0] },
  head: { rot: [0.12, 0, 0] },
})

/** Keystrokes per second of each hand; the hands run at different rates so they never fall into step. */
const LEFT_RATE = 5.3
const RIGHT_RATE = 4.1

/** Typing on the laptop: the hands patter on the keys while the eyes follow the text. */
export const typing: ProceduralClip = {
  duration: null,
  sample: (t) => {
    const left = Math.sin(t * TAU * LEFT_RATE)
    const right = Math.sin(t * TAU * RIGHT_RATE + 1)
    const reading = Math.sin((t * TAU) / 2.8)
    return add(add(typingBase, breathing(t)), {
      'arm_L.002': { rot: [0, 0, 0.07 * left] },
      'arm_L.003': { rot: [0, 0, 0.12 * left] },
      'arm_R.002': { rot: [0, 0, -0.07 * right] },
      'arm_R.003': { rot: [0, 0, -0.12 * right] },
      head: { rot: [0.02 * Math.sin(t * TAU * 0.9), 0.06 * reading, 0] },
    })
  },
}
