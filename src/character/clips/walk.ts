import { CHARACTER_HEIGHT } from '../../scene/layout'
import { add, standingBase, TAU, type ProceduralClip } from './shared'

/** Seconds per full cycle (two steps). */
const CYCLE = 0.52
/** How far each leg swings forward and back, in radians. */
const STRIDE = 0.7
/** How high a foot lifts as it swings forward, in metres, and how far its toes tip up, in radians. */
const STEP = { height: 0.05, toesUp: 0.22 } as const
/** How far each arm swings, in radians. */
const ARM_SWING = 0.4
/** From the hip joint down to the ankle, which is all the leg this character has. */
export const LEG_LENGTH = 0.18 * CHARACTER_HEIGHT

/**
 * The speed (m/s) to move the character at while this clip plays: the speed at
 * which the standing foot stays put on the floor. Each step carries the body
 * from one end of the leg's swing to the other, and a cycle is two steps.
 */
export const WALK_SPEED = (4 * LEG_LENGTH * Math.sin(STRIDE)) / CYCLE

/** Walking on the spot; whoever plays the clip moves the character. */
export const walk: ProceduralClip = {
  duration: null,
  sample: (t) => {
    const phase = (t / CYCLE) * TAU
    const swing = Math.sin(phase)
    /** The left leg's angle forward; the right leg mirrors it. */
    const stride = STRIDE * swing
    // A foot lifts while it swings forward.
    const leftLift = Math.max(0, Math.cos(phase))
    const rightLift = Math.max(0, -Math.cos(phase))
    return add(standingBase, {
      // Swinging a leg raises its foot; the body sinks by as much to keep the standing foot on the ground.
      'root 1': { pos: [0, -LEG_LENGTH * (1 - Math.cos(stride)), 0] },
      body: { rot: [0.06, 0.07 * swing, 0.03 * swing] },
      head: { rot: [-0.03, -0.05 * swing, -0.02 * swing] },
      hip: { rot: [0, -0.06 * swing, 0] },
      // Each arm swings against the leg on its side.
      'arm_L.001': { rot: [ARM_SWING * swing, 0, 0] },
      'arm_R.001': { rot: [-ARM_SWING * swing, 0, 0] },
      // The ankles turn back by what the legs turn, so the soles stay level.
      'Leg_L.001': { rot: [-stride, 0, 0] },
      'Leg_R.001': { rot: [stride, 0, 0] },
      foot_IK_L: { rot: [stride - STEP.toesUp * leftLift, 0, 0], pos: [0, STEP.height * leftLift, 0] },
      foot_IK_R: { rot: [-stride - STEP.toesUp * rightLift, 0, 0], pos: [0, STEP.height * rightLift, 0] },
    })
  },
}
