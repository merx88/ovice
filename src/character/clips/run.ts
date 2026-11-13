import { ARM_DOWN, mixArm, arms, TAU, type ArmPose, type Pose, type ProceduralClip } from './shared'
import { LEG_LENGTH } from './walk'

/**
 * The speed (m/s) to move the character at while this clip plays at its own
 * pace: the speed at which the foot on the ground stays where it is.
 */
export const RUN_SPEED = 3.6

/** Seconds per full cycle (two steps): quick little steps, a scurry rather than a stride. */
export const RUN_CYCLE = 0.3
/** The part of each step a foot is on the ground; for the rest of it both feet are in the air. */
const ON_GROUND = 0.4
/** How far ahead of the hip a foot lands, and how far behind it leaves the ground (m). */
const REACH = (RUN_SPEED * ON_GROUND * RUN_CYCLE) / 4
/** How high a foot is lifted on its way forward (m), and how far its toes tip down after push-off and up before landing (rad). */
const STEP = { height: 0.06, toes: 0.3 } as const
/** The body bounces between this far below standing, as a foot takes its weight, and this far above, in mid-air (m). */
const BOUNCE = { low: -0.04, high: 0.01 } as const
/** How far the body leans into the run (rad). */
const LEAN = 0.36

/** The arms pump with bent elbows: the hand of the arm that is forward comes up to the chest, the other goes back past the hip. */
const ARM_FORWARD: ArmPose = { upper: [ARM_DOWN.upper![0] - 0.8, ARM_DOWN.upper![1], ARM_DOWN.upper![2]], fore: [ARM_DOWN.fore![0], ARM_DOWN.fore![1] - 1.3, ARM_DOWN.fore![2]], hand: ARM_DOWN.hand }
const ARM_BACK: ArmPose = { upper: [ARM_DOWN.upper![0] + 0.75, ARM_DOWN.upper![1], ARM_DOWN.upper![2]], fore: [ARM_DOWN.fore![0], ARM_DOWN.fore![1] - 0.75, ARM_DOWN.fore![2]], hand: ARM_DOWN.hand }

/** Where one foot is at `phase` (0..1) of its cycle, which starts as it lands: ahead of the hip (m), above the ground (m), toes up (rad). */
function footAt(phase: number): { ahead: number; lift: number; toes: number } {
  const stance = ON_GROUND / 2
  // On the ground it goes back under the body at exactly the speed the body goes forward.
  if (phase < stance) return { ahead: REACH * (1 - (2 * phase) / stance), lift: 0, toes: 0 }
  // In the air it swings forward again, lifted, toes down as it leaves the ground and up before it lands.
  const swing = (phase - stance) / (1 - stance)
  return {
    ahead: -REACH * Math.cos(Math.PI * swing),
    lift: STEP.height * Math.sin(Math.PI * swing) ** 2,
    // Only as far as the lift leaves room for under the long boot.
    toes: 2 * STEP.toes * Math.sin(Math.PI * swing) ** 2 * (2 * swing - 1),
  }
}

/**
 * One leg with its foot `ahead` of the hip and `below` it (m): the leg swings
 * to point at the foot and takes the boot up into the hem, or lets it out, by
 * what the distance differs from the leg's length. The sole stays level but
 * for `toes`.
 */
function leg(ahead: number, below: number, toes: number): { thigh: [number, number, number]; foot: { rot: [number, number, number]; pos: [number, number, number] } } {
  const angle = Math.atan2(ahead, below)
  return { thigh: [-angle, 0, 0], foot: { rot: [angle - toes, 0, 0], pos: [0, LEG_LENGTH - Math.hypot(ahead, below), 0] } }
}

/**
 * Scurrying on the spot, in a hurry; whoever plays the clip moves the
 * character. Small quick steps, the body leaning into it and bouncing, the
 * elbows pumping. It starts as the left foot lands.
 */
export const run: ProceduralClip = {
  duration: null,
  sample: (t) => {
    const phase = (((t / RUN_CYCLE) % 1) + 1) % 1
    const left = footAt(phase)
    const right = footAt((phase + 0.5) % 1)
    // The body is lowest in the middle of each foot's time on the ground and highest in mid-air.
    const step = (phase * 2) % 1
    const rise = 0.5 - 0.5 * Math.cos(TAU * (step - ON_GROUND / 2))
    const height = BOUNCE.low + (BOUNCE.high - BOUNCE.low) * rise
    const ground = LEG_LENGTH + height
    const leftLeg = leg(left.ahead, ground - left.lift, left.toes)
    const rightLeg = leg(right.ahead, ground - right.lift, right.toes)
    /** Which way the body twists: with the left foot forward (+1) or the right (-1). */
    const twist = Math.cos(TAU * phase - 0.6)
    const pose: Pose = {
      'root 1': { pos: [0, height, 0] },
      // The shoulders turn against the hips, and the head stays on where it is going.
      body: { rot: [LEAN + 0.05 * rise, 0.16 * twist, 0.04 * twist] },
      head: { rot: [-0.3 - 0.03 * rise, -0.12 * twist, -0.02 * twist] },
      hip: { rot: [0, -0.12 * twist, 0] },
      // Each arm pumps against the leg on its side.
      ...arms(mixArm(ARM_FORWARD, ARM_BACK, 0.5 + 0.5 * twist), mixArm(ARM_FORWARD, ARM_BACK, 0.5 - 0.5 * twist)),
      'Leg_L.001': { rot: leftLeg.thigh },
      'Leg_R.001': { rot: rightLeg.thigh },
      foot_IK_L: leftLeg.foot,
      foot_IK_R: rightLeg.foot,
    }
    return pose
  },
}
