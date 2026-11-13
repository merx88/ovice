import { add, ARM_ON_KEYS, ARM_OVER_KEYS, arms, breathing, mixArm, seatedBase, TAU, type Pose, type ProceduralClip } from './shared'

/** At work the eyes are on the screen. */
const typingBase: Pose = add(seatedBase, { head: { rot: [0.1, 0, 0] } })

/** Keystrokes per second of each hand; the hands run at different rates so they never fall into step. */
const LEFT_RATE = 5.3
const RIGHT_RATE = 4.1

/** How far a hand has lifted off the keys, 0..1. */
function lift(t: number, rate: number, phase: number): number {
  return 0.5 + 0.5 * Math.sin(t * TAU * rate + phase)
}

/**
 * Typing on the laptop: the hands patter on the keys while the eyes follow the
 * text. The lid hides the hands; what shows of the patter is the cuffs and
 * forearms at its sides, and the shoulders.
 */
export const typing: ProceduralClip = {
  duration: null,
  sample: (t) => {
    const left = lift(t, LEFT_RATE, 0)
    const right = lift(t, RIGHT_RATE, 1)
    const reading = Math.sin((t * TAU) / 2.8)
    const hands = arms(mixArm(ARM_ON_KEYS, ARM_OVER_KEYS, left), mixArm(ARM_ON_KEYS, ARM_OVER_KEYS, right))
    return add(add({ ...typingBase, ...hands }, breathing(t)), {
      head: { rot: [0.02 * Math.sin(t * TAU * 0.9), 0.06 * reading, 0] },
    })
  },
}
