// Keeping the body where it is in the room when the character's placement
// jumps under it. A hop on or off the sofa is played with the character
// placed on the sofa's seat spot while it walks and runs placed where it
// stands: at the join of two such clips the placement changes by half a
// metre from one frame to the next, and the pose the cross-fade starts from
// has to be carried over into the new placement, or the body would jump.
import { Matrix4, Quaternion, Vector3 } from 'three'

/** Where a character is placed: a point on the ground and a yaw about +y (0 faces +z). */
export interface Placed {
  position: readonly [number, number, number]
  facing: number
}

const up = new Vector3(0, 1, 0)
const one = new Vector3(1, 1, 1)
const turn = new Quaternion()
const moved = new Matrix4()
const local = new Matrix4()
const frame = new Matrix4()
const scale = new Vector3()

/** The transform of a group placed at `placed`. */
function placement(placed: Placed, into: Matrix4): Matrix4 {
  return into.compose(new Vector3(placed.position[0], placed.position[1], placed.position[2]), turn.setFromAxisAngle(up, placed.facing), one)
}

/**
 * Rewrites a bone's own `position` and `quaternion` so that the bone is in
 * the same place in the room with its character placed at `to` as it was
 * with the character placed at `from`. `parent` is the bone's parent in the
 * frame of the group that is placed (everything between that group and the
 * bone: the model's scale and the bones above it).
 */
export function carryOver(position: Vector3, quaternion: Quaternion, parent: Matrix4, from: Placed, to: Placed): void {
  // In the placed group's frame the jump is: out of the old placement, into the new.
  placement(to, moved).invert().multiply(placement(from, frame))
  local.compose(position, quaternion, one)
  frame.copy(parent).invert().multiply(moved).multiply(parent).multiply(local)
  frame.decompose(position, quaternion, scale)
}

/** How far `pose` holds the root away from where the character is placed, sideways (m): more than nothing only during a hop. */
export function rootReach(pose: { 'root 1'?: { pos?: readonly [number, number, number] } }): number {
  const pos = pose['root 1']?.pos
  return pos ? Math.hypot(pos[0], pos[2]) : 0
}
