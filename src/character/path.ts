// Walking a route: measuring a line through waypoints, rounding its corners,
// finding the point a given distance along it, and moving a walker along it
// one time step at a time. Pure geometry: no clock and no scene.
import type { Vec3 } from '../scene/layout'

/** A line through points, measured: `distances[i]` is how far along it `points[i]` is. */
export interface Path {
  points: Vec3[]
  distances: number[]
  /** The whole length (m). */
  length: number
}

export interface PathSample {
  position: [number, number, number]
  /** Yaw (radians about +y) of the way the path runs there: 0 is +z, a quarter turn is +x. */
  heading: number
}

function distanceBetween(a: Vec3, b: Vec3): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
}

/** Measures the line through `points`. A point repeated in place is dropped: it has no direction to walk in. */
export function measurePath(points: readonly Vec3[]): Path {
  if (points.length === 0) throw new Error('A path needs at least one point')
  const kept: Vec3[] = [points[0]]
  const distances = [0]
  for (const point of points.slice(1)) {
    const step = distanceBetween(kept[kept.length - 1], point)
    if (step === 0) continue
    distances.push(distances[distances.length - 1] + step)
    kept.push(point)
  }
  return { points: kept, distances, length: distances[distances.length - 1] }
}

/**
 * The point `distance` metres along the path and the way the path runs there.
 * Distances before the start or past the end give the start or the end.
 * Written into `into` when given, so that sampling every frame makes no garbage.
 */
export function samplePath(
  path: Path,
  distance: number,
  into: PathSample = { position: [0, 0, 0], heading: 0 },
): PathSample {
  const { points, distances } = path
  const lastSegment = points.length - 2
  if (lastSegment < 0) {
    into.position[0] = points[0][0]
    into.position[1] = points[0][1]
    into.position[2] = points[0][2]
    into.heading = 0
    return into
  }
  const along = Math.min(path.length, Math.max(0, distance))
  let segment = 0
  while (segment < lastSegment && distances[segment + 1] < along) segment++
  const from = points[segment]
  const to = points[segment + 1]
  const share = (along - distances[segment]) / (distances[segment + 1] - distances[segment])
  // Weighted this way round, the ends of a segment come out exactly.
  into.position[0] = from[0] * (1 - share) + to[0] * share
  into.position[1] = from[1] * (1 - share) + to[1] * share
  into.position[2] = from[2] * (1 - share) + to[2] * share
  into.heading = Math.atan2(to[0] - from[0], to[2] - from[2])
  return into
}

// --- Rounding corners --------------------------------------------------------

/** An arc is drawn as straight pieces that each turn by no more than this (radians). */
const ARC_STEP = Math.PI / 32
/** Turns smaller than this are straight enough, and turns this close to a half turn have no arc to follow. */
const NO_CORNER = 1e-6

function towards(from: Vec3, to: Vec3, length: number): Vec3 {
  return [(to[0] - from[0]) / length, (to[1] - from[1]) / length, (to[2] - from[2]) / length]
}

function offset(point: Vec3, direction: Vec3, length: number): Vec3 {
  return [point[0] + direction[0] * length, point[1] + direction[1] * length, point[2] + direction[2] * length]
}

/**
 * The same route with each corner replaced by an arc of `radius`, so that
 * whoever follows it turns gradually instead of on the spot. A corner never
 * uses up more than half of either of its segments, so a short segment gets
 * tighter arcs rather than overlapping ones.
 */
export function roundCorners(points: readonly Vec3[], radius: number): Vec3[] {
  if (radius <= 0 || points.length < 3) return [...points]
  const rounded: Vec3[] = [points[0]]
  for (let index = 1; index < points.length - 1; index++) {
    const corner = points[index]
    const before = distanceBetween(points[index - 1], corner)
    const after = distanceBetween(corner, points[index + 1])
    if (before === 0 || after === 0) {
      rounded.push(corner)
      continue
    }
    const back = towards(corner, points[index - 1], before)
    const on = towards(corner, points[index + 1], after)
    // How far the route turns here: nothing when it runs straight on, a half turn when it doubles back.
    const turn = Math.acos(Math.min(1, Math.max(-1, -(back[0] * on[0] + back[1] * on[1] + back[2] * on[2]))))
    if (turn < NO_CORNER || turn > Math.PI - NO_CORNER) {
      rounded.push(corner)
      continue
    }
    /** How far from the corner the arc leaves one segment and joins the other. */
    const cut = Math.min(radius * Math.tan(turn / 2), before / 2, after / 2)
    const arcRadius = cut / Math.tan(turn / 2)
    const start = offset(corner, back, cut)
    const end = offset(corner, on, cut)
    const inwards: Vec3 = [back[0] + on[0], back[1] + on[1], back[2] + on[2]]
    const centre = offset(corner, inwards, arcRadius / Math.cos(turn / 2) / Math.hypot(...inwards))

    rounded.push(start)
    const pieces = Math.ceil(turn / ARC_STEP)
    for (let piece = 1; piece < pieces; piece++) {
      const share = piece / pieces
      // Swings the spoke from the arc's start round to its end.
      const fromStart = Math.sin((1 - share) * turn) / Math.sin(turn)
      const fromEnd = Math.sin(share * turn) / Math.sin(turn)
      rounded.push([
        centre[0] + (start[0] - centre[0]) * fromStart + (end[0] - centre[0]) * fromEnd,
        centre[1] + (start[1] - centre[1]) * fromStart + (end[1] - centre[1]) * fromEnd,
        centre[2] + (start[2] - centre[2]) * fromStart + (end[2] - centre[2]) * fromEnd,
      ])
    }
    rounded.push(end)
  }
  rounded.push(points[points.length - 1])
  return rounded
}

// --- Walking -----------------------------------------------------------------

/** Someone on a path: how far along it they are (m) and the yaw they face (radians, within a half turn of 0). */
export interface Walker {
  distance: number
  facing: number
}

/** How the walker turns: it closes this share of the turn left per second (1/s), but never faster than `maxSpeed` (rad/s). */
const TURN = { rate: 10, maxSpeed: 7 } as const
/** A turn with less than this left (radians) is finished. */
const TURN_DONE = 1e-3
/**
 * The walker takes its heading from where it will be this many seconds from
 * now, which is how long its turning lags: it leans into a bend as it gets
 * there instead of drifting through it sideways.
 */
const LOOK_AHEAD = 1 / TURN.rate
/**
 * The walker only moves while it faces within this (radians) of the way it is
 * going, and faster the closer it faces it: further off than this it stands
 * and turns first, so it never slides sideways.
 */
const MOVES_WITHIN = Math.PI / 4
/** Over the last `distance` metres it slows down, to no less than `least` of its speed. */
const SLOW_DOWN = { distance: 0.3, least: 0.35 } as const
/**
 * Over the last stretch (m) it starts turning to the way it is to face on
 * arrival, as far as it may while still moving; it finishes the turn standing.
 */
const TURN_IN_DISTANCE = 0.4
/**
 * It has arrived once it stands at its goal and faces within this (radians) of
 * where it should: the last of a turn is slow, and whatever comes next need
 * not wait for it.
 */
const ARRIVED_WITHIN = 0.25

/** The signed turn (radians) that takes yaw `from` to yaw `to` the short way round. */
export function turnBetween(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from))
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function ease(value: number): number {
  return value * value * (3 - 2 * value)
}

/** The same yaw, within a half turn of 0. */
function wrapYaw(yaw: number): number {
  return Math.abs(yaw) <= Math.PI ? yaw : turnBetween(0, yaw)
}

function turnWalker(walker: Walker, goal: number, dt: number): void {
  const left = turnBetween(walker.facing, goal)
  const size = Math.abs(left)
  if (size <= TURN_DONE) {
    walker.facing = wrapYaw(goal)
    return
  }
  const step = Math.min(size * (1 - Math.exp(-TURN.rate * dt)), TURN.maxSpeed * dt)
  walker.facing = wrapYaw(walker.facing + Math.sign(left) * step)
}

/**
 * Moves `walker` on by `dt` seconds towards the point `goal` metres along
 * `path` (in either direction), where it is to end up facing `goalFacing`.
 * Returns true once it stands there facing that way.
 *
 * It faces the way it goes: it turns on the spot before it sets off in a new
 * direction, follows bends, slows over the last steps and turns to
 * `goalFacing` as it arrives, finishing the turn on the spot. `speed` (m/s) is
 * how fast it walks when nothing holds it back.
 */
export function stepWalker(
  walker: Walker,
  path: Path,
  goal: number,
  goalFacing: number,
  speed: number,
  dt: number,
): boolean {
  const target = Math.min(path.length, Math.max(0, goal))
  const left = Math.abs(target - walker.distance)
  if (left === 0) {
    turnWalker(walker, goalFacing, dt)
    return Math.abs(turnBetween(walker.facing, goalFacing)) <= ARRIVED_WITHIN
  }

  const direction = Math.sign(target - walker.distance)
  const ahead = walker.distance + direction * Math.min(left, speed * LOOK_AHEAD)
  let heading = samplePath(path, ahead, scratch).heading + (direction < 0 ? Math.PI : 0)
  if (left < TURN_IN_DISTANCE) {
    const turnIn = Math.min(MOVES_WITHIN, Math.max(-MOVES_WITHIN, turnBetween(heading, goalFacing)))
    heading += turnIn * ease(1 - left / TURN_IN_DISTANCE)
  }
  turnWalker(walker, heading, dt)

  const facingIt = Math.cos(turnBetween(walker.facing, heading))
  const pace =
    clamp01((facingIt - Math.cos(MOVES_WITHIN)) / (1 - Math.cos(MOVES_WITHIN))) *
    Math.max(SLOW_DOWN.least, Math.min(1, left / SLOW_DOWN.distance))
  const stride = speed * pace * dt
  walker.distance = stride >= left ? target : walker.distance + direction * stride
  return false
}

const scratch: PathSample = { position: [0, 0, 0], heading: 0 }
