import { describe, expect, it } from 'vitest'
import { HANDOFF_FACING, SEAT_FACING, WALK_CORNER_RADIUS, WALK_OUT_PATH, type Vec3 } from '../scene/layout'
import { WALK_PACE } from './clipForState'
import { WALK_SPEED } from './clips/walk'
import { measurePath, roundCorners, samplePath, stepWalker, turnBetween, type Path, type Walker } from './path'

const FRAME = 1 / 60
const QUARTER = Math.PI / 2

/** 3 m towards the camera, then 4 m to the right. */
const CORNER: Vec3[] = [
  [0, 0, 0],
  [0, 0, 3],
  [4, 0, 3],
]

function expectPoint(actual: Vec3, expected: Vec3) {
  actual.forEach((value, axis) => expect(value).toBeCloseTo(expected[axis], 6))
}

describe('measurePath', () => {
  it('adds up the lengths of the segments', () => {
    const path = measurePath(CORNER)
    expect(path.length).toBeCloseTo(7)
    expect(path.distances).toEqual([0, 3, 7])
    expect(path.points).toEqual(CORNER)
  })

  it('measures in all three directions', () => {
    expect(measurePath([[1, 2, 3], [3, 5, 9]]).length).toBeCloseTo(7)
  })

  it('has no length for a single point', () => {
    const path = measurePath([[1, 0, 2]])
    expect(path.length).toBe(0)
    expect(path.points).toEqual([[1, 0, 2]])
  })

  it('drops a point repeated in place, which has no direction to walk in', () => {
    const path = measurePath([[0, 0, 0], [0, 0, 0], [0, 0, 2], [0, 0, 2]])
    expect(path.points).toEqual([[0, 0, 0], [0, 0, 2]])
    expect(path.length).toBe(2)
  })

  it('refuses a path with no points', () => {
    expect(() => measurePath([])).toThrow()
  })
})

describe('samplePath', () => {
  const path = measurePath(CORNER)

  it('finds the point a given distance along the path', () => {
    expectPoint(samplePath(path, 0).position, [0, 0, 0])
    expectPoint(samplePath(path, 1.5).position, [0, 0, 1.5])
    expectPoint(samplePath(path, 3).position, [0, 0, 3])
    expectPoint(samplePath(path, 5).position, [2, 0, 3])
    expectPoint(samplePath(path, 7).position, [4, 0, 3])
  })

  it('stays at the ends for distances beyond them', () => {
    expectPoint(samplePath(path, -2).position, [0, 0, 0])
    expectPoint(samplePath(path, 7.5).position, [4, 0, 3])
    expectPoint(samplePath(path, Infinity).position, [4, 0, 3])
    expect(samplePath(path, -2).heading).toBeCloseTo(0)
    expect(samplePath(path, 99).heading).toBeCloseTo(QUARTER)
  })

  it('heads the way the segment it is on runs: 0 towards +z, a quarter turn towards +x', () => {
    expect(samplePath(path, 0).heading).toBeCloseTo(0)
    expect(samplePath(path, 2.9).heading).toBeCloseTo(0)
    expect(samplePath(path, 3.1).heading).toBeCloseTo(QUARTER)
    expect(samplePath(path, 7).heading).toBeCloseTo(QUARTER)
  })

  it.each<[string, Vec3, number]>([
    ['+z', [0, 0, 5], 0],
    ['+x', [5, 0, 0], QUARTER],
    ['-x', [-5, 0, 0], -QUARTER],
    ['+x and +z', [5, 0, 5], QUARTER / 2],
    ['-x and -z', [-5, 0, -5], -1.5 * QUARTER],
  ])('heads %s along a straight segment that way', (_, end, heading) => {
    const straight = measurePath([[0, 0, 0], end])
    for (const distance of [0, 1, 3, straight.length]) expect(samplePath(straight, distance).heading).toBeCloseTo(heading)
  })

  it('heads away from the camera along -z', () => {
    const away = measurePath([[0, 0, 0], [0, 0, -5]])
    expect(Math.abs(samplePath(away, 2).heading)).toBeCloseTo(Math.PI)
  })

  it('ignores height when working out the heading', () => {
    const ramp = measurePath([[0, 0, 0], [3, 4, 0]])
    expect(samplePath(ramp, 2.5).heading).toBeCloseTo(QUARTER)
    expectPoint(samplePath(ramp, 2.5).position, [1.5, 2, 0])
  })

  it('stands still on a path that is a single point', () => {
    const spot = measurePath([[1, 0, 2]])
    expect(samplePath(spot, 3)).toEqual({ position: [1, 0, 2], heading: 0 })
  })
})

describe('roundCorners', () => {
  const RADIUS = 0.5
  const rounded = roundCorners(CORNER, RADIUS)

  it('keeps both ends where they are', () => {
    expect(rounded[0]).toEqual(CORNER[0])
    expect(rounded[rounded.length - 1]).toEqual(CORNER[2])
  })

  it('replaces the corner with an arc of the given radius', () => {
    const centre = [RADIUS, 0, 3 - RADIUS]
    const arc = rounded.slice(1, -1)
    expect(arc.length).toBeGreaterThan(4)
    for (const [x, y, z] of arc) {
      expect(Math.hypot(x - centre[0], z - centre[2])).toBeCloseTo(RADIUS, 6)
      expect(y).toBe(0)
    }
    // The arc starts and ends on the old segments, one radius short of the corner.
    expectPoint(arc[0], [0, 0, 3 - RADIUS])
    expectPoint(arc[arc.length - 1], [RADIUS, 0, 3])
  })

  it('makes the path shorter by what the arc saves over the corner', () => {
    const saved = 2 * RADIUS - QUARTER * RADIUS
    expect(measurePath(rounded).length).toBeCloseTo(7 - saved, 2)
  })

  it('turns the heading gradually instead of all at once', () => {
    const path = measurePath(rounded)
    let previous = samplePath(path, 0).heading
    for (let distance = 0; distance <= path.length; distance += 0.01) {
      const { heading } = samplePath(path, distance)
      expect(Math.abs(turnBetween(previous, heading))).toBeLessThan(0.3)
      previous = heading
    }
    expect(samplePath(path, 0).heading).toBeCloseTo(0)
    expect(samplePath(path, path.length).heading).toBeCloseTo(QUARTER)
  })

  it('never rounds more than half of a segment away', () => {
    // Two corners 1 m apart cannot both take a 2 m radius.
    const zigzag: Vec3[] = [[0, 0, 0], [0, 0, 4], [1, 0, 4], [1, 0, 8]]
    const path = measurePath(roundCorners(zigzag, 2))
    expectPoint(samplePath(path, 0).position, [0, 0, 0])
    expectPoint(samplePath(path, path.length).position, [1, 0, 8])
    // The middle of the short segment is still on the path.
    const onPath = path.points.some(([x, , z]) => Math.abs(x - 0.5) < 1e-6 && Math.abs(z - 4) < 1e-6)
    expect(onPath).toBe(true)
    for (const [x, , z] of path.points) {
      expect(x).toBeGreaterThanOrEqual(-1e-9)
      expect(x).toBeLessThanOrEqual(1 + 1e-9)
      expect(z).toBeGreaterThanOrEqual(-1e-9)
      expect(z).toBeLessThanOrEqual(8 + 1e-9)
    }
  })

  it('leaves a straight path, a reversal and a path without corners alone', () => {
    const straight: Vec3[] = [[0, 0, 0], [0, 0, 1], [0, 0, 2]]
    expect(roundCorners(straight, RADIUS)).toEqual(straight)
    const reversal: Vec3[] = [[0, 0, 0], [0, 0, 2], [0, 0, 1]]
    expect(roundCorners(reversal, RADIUS)).toEqual(reversal)
    const segment: Vec3[] = [[0, 0, 0], [1, 0, 1]]
    expect(roundCorners(segment, RADIUS)).toEqual(segment)
  })

  it('leaves the path alone for a radius of zero', () => {
    expect(roundCorners(CORNER, 0)).toEqual(CORNER)
  })

  it('does not change the points it is given', () => {
    const points: Vec3[] = [[0, 0, 0], [0, 0, 3], [4, 0, 3]]
    roundCorners(points, RADIUS)
    expect(points).toEqual(CORNER)
  })
})

describe('turnBetween', () => {
  it('gives the signed turn from one yaw to another', () => {
    expect(turnBetween(0, 1)).toBeCloseTo(1)
    expect(turnBetween(1, 0)).toBeCloseTo(-1)
    expect(turnBetween(0.5, 0.5)).toBe(0)
  })

  it('takes the short way round', () => {
    expect(turnBetween(3, -3)).toBeCloseTo(2 * Math.PI - 6)
    expect(turnBetween(-3, 3)).toBeCloseTo(6 - 2 * Math.PI)
    expect(turnBetween(0, 1.5 * Math.PI)).toBeCloseTo(-QUARTER)
    expect(turnBetween(0, 5 * Math.PI + 0.1)).toBeCloseTo(-Math.PI + 0.1)
  })
})

describe('stepWalker', () => {
  const SPEED = 1.5
  const straight = measurePath([[0, 0, 0], [0, 0, 6]])

  /** Steps until the walker reports arriving; returns the seconds it took. */
  function walk(walker: Walker, path: Path, goal: number, goalFacing: number, limit = 30): number {
    let elapsed = 0
    while (!stepWalker(walker, path, goal, goalFacing, SPEED, FRAME)) {
      elapsed += FRAME
      if (elapsed > limit) throw new Error('the walker never arrived')
    }
    return elapsed
  }

  it('walks at the given speed when it faces the way it is going', () => {
    const walker: Walker = { distance: 0, facing: 0 }
    for (let frame = 0; frame < 60; frame++) stepWalker(walker, straight, 6, 0, SPEED, FRAME)
    expect(walker.distance).toBeCloseTo(SPEED, 5)
    expect(walker.facing).toBeCloseTo(0)
  })

  it('stops exactly at the goal and reports arriving', () => {
    const walker: Walker = { distance: 0, facing: 0 }
    const seconds = walk(walker, straight, 6, 0)
    expect(walker.distance).toBe(6)
    // A moment longer than the distance over the speed: it slows down over its last steps.
    expect(seconds).toBeGreaterThan(6 / SPEED)
    expect(seconds).toBeLessThan(6 / SPEED + 0.4)
    // It stays there for as long as it is asked to be there.
    expect(stepWalker(walker, straight, 6, 0, SPEED, FRAME)).toBe(true)
    expect(walker).toEqual({ distance: 6, facing: 0 })
  })

  it('slows down over its last steps instead of stopping dead', () => {
    const walker: Walker = { distance: 0, facing: 0 }
    const strides: number[] = []
    for (let before = walker.distance; !stepWalker(walker, straight, 6, 0, SPEED, FRAME); before = walker.distance) {
      if (walker.distance > before) strides.push(walker.distance - before)
    }
    const full = SPEED * FRAME
    expect(strides[0]).toBeCloseTo(full)
    expect(strides[strides.length - 2]).toBeLessThan(full * 0.5)
    // Slower, but still walking: the last metre does not drag on.
    expect(Math.min(...strides.slice(0, -1))).toBeGreaterThan(full * 0.2)
  })

  it('never passes the goal, whatever the size of the step', () => {
    const walker: Walker = { distance: 5.9, facing: 0 }
    stepWalker(walker, straight, 6, 0, SPEED, 1)
    expect(walker.distance).toBe(6)
  })

  it('stops at a goal in the middle of the path', () => {
    const walker: Walker = { distance: 0, facing: 0 }
    walk(walker, straight, 2.5, 0)
    expect(walker.distance).toBe(2.5)
  })

  it('treats a goal beyond the path as its end', () => {
    const walker: Walker = { distance: 0, facing: 0 }
    walk(walker, straight, 99, 0)
    expect(walker.distance).toBe(6)
    walk(walker, straight, -5, 0)
    expect(walker.distance).toBe(0)
  })

  it('turns on the spot before setting off when it faces the wrong way', () => {
    const walker: Walker = { distance: 0, facing: Math.PI }
    stepWalker(walker, straight, 6, 0, SPEED, FRAME)
    expect(walker.distance).toBe(0)
    expect(Math.abs(turnBetween(walker.facing, 0))).toBeLessThan(Math.PI)
    // A quarter of a second on it has turned most of the way and still stands where it was.
    for (let frame = 1; frame < 15; frame++) stepWalker(walker, straight, 6, 0, SPEED, FRAME)
    expect(walker.distance).toBe(0)
    expect(Math.abs(walker.facing)).toBeLessThan(Math.PI / 2)
    // It is on its way, facing where it goes, within a second.
    for (let frame = 15; frame < 60; frame++) stepWalker(walker, straight, 6, 0, SPEED, FRAME)
    expect(walker.distance).toBeGreaterThan(0.5)
    expect(walker.facing).toBeCloseTo(0, 1)
  })

  it('takes about half a second over a half turn: quick, but not in a flash', () => {
    const walker: Walker = { distance: 6, facing: 0 }
    let seconds = 0
    while (!stepWalker(walker, straight, 6, Math.PI, SPEED, FRAME)) seconds += FRAME
    expect(seconds).toBeGreaterThan(0.4)
    expect(seconds).toBeLessThan(0.8)
    // Its first frame is no larger a turn than any frame after it.
    const starting: Walker = { distance: 6, facing: 0 }
    stepWalker(starting, straight, 6, Math.PI, SPEED, FRAME)
    expect(Math.abs(starting.facing)).toBeLessThan(0.15)
  })

  it('sets off at once along a path it already faces', () => {
    const walker: Walker = { distance: 0, facing: 0 }
    stepWalker(walker, straight, 6, 0, SPEED, FRAME)
    expect(walker.distance).toBeCloseTo(SPEED * FRAME)
  })

  it('walks back along the path facing the other way', () => {
    const walker: Walker = { distance: 6, facing: 0 }
    for (let frame = 0; frame < 60; frame++) stepWalker(walker, straight, 0, 0, SPEED, FRAME)
    expect(walker.distance).toBeLessThan(6)
    expect(walker.distance).toBeGreaterThan(3)
    expect(Math.abs(walker.facing)).toBeCloseTo(Math.PI, 1)
  })

  it('turns to the facing asked for as it arrives, and only reports arriving once it faces that way', () => {
    const walker: Walker = { distance: 0, facing: 0 }
    let arrivedAt: number | null = null
    let reachedGoalAt: number | null = null
    let facingOneStepShort = 0
    for (let frame = 0; frame < 600 && arrivedAt === null; frame++) {
      if (walker.distance < 6) facingOneStepShort = walker.facing
      const arrived = stepWalker(walker, straight, 6, QUARTER, SPEED, FRAME)
      if (reachedGoalAt === null && walker.distance === 6) reachedGoalAt = frame
      if (arrived) arrivedAt = frame
    }
    expect(reachedGoalAt).not.toBeNull()
    expect(arrivedAt).toBeGreaterThan(reachedGoalAt as number)
    // The turn began before the last step, but only as far as it could while still walking forwards.
    expect(facingOneStepShort).toBeGreaterThan(QUARTER / 4)
    expect(facingOneStepShort).toBeLessThanOrEqual(QUARTER / 2)
    // It reports arriving with the last few degrees of the turn still to go...
    expect(Math.abs(turnBetween(walker.facing, QUARTER))).toBeLessThan(0.26)
    // ...and left alone at the goal it finishes the turn exactly.
    for (let frame = 0; frame < 60; frame++) stepWalker(walker, straight, 6, QUARTER, SPEED, FRAME)
    expect(walker.facing).toBe(QUARTER)
  })

  it('keeps facing the way it walks until the last stretch', () => {
    const walker: Walker = { distance: 0, facing: 0 }
    while (walker.distance < 5) stepWalker(walker, straight, 6, QUARTER, SPEED, FRAME)
    expect(walker.facing).toBe(0)
  })

  it('does not report arriving while it stands at the goal facing the wrong way', () => {
    const walker: Walker = { distance: 6, facing: Math.PI }
    expect(stepWalker(walker, straight, 6, 0, SPEED, FRAME)).toBe(false)
    expect(walker.distance).toBe(6)
  })

  it('follows a rounded corner, facing the way it goes', () => {
    const path = measurePath(roundCorners(CORNER, 0.5))
    const walker: Walker = { distance: 0, facing: 0 }
    let widestOff = 0
    while (!stepWalker(walker, path, path.length, QUARTER, SPEED, FRAME)) {
      const off = Math.abs(turnBetween(walker.facing, samplePath(path, walker.distance).heading))
      widestOff = Math.max(widestOff, off)
    }
    expect(walker.distance).toBe(path.length)
    // Through the bend it never looks more than a little away from where it is heading.
    expect(widestOff).toBeLessThan(0.5)
  })

  it('keeps its yaw within a turn however often it turns round', () => {
    const walker: Walker = { distance: 3, facing: 0 }
    for (let lap = 0; lap < 6; lap++) {
      walk(walker, straight, lap % 2 === 0 ? 6 : 0, lap)
      expect(Math.abs(walker.facing)).toBeLessThanOrEqual(Math.PI + 1e-9)
    }
  })

  it('makes the same progress in a few long steps as in many short ones', () => {
    const coarse: Walker = { distance: 0, facing: QUARTER }
    const fine: Walker = { distance: 0, facing: QUARTER }
    for (let step = 0; step < 20; step++) stepWalker(coarse, straight, 6, 0, SPEED, 0.1)
    for (let step = 0; step < 200; step++) stepWalker(fine, straight, 6, 0, SPEED, 0.01)
    expect(coarse.distance).toBeCloseTo(fine.distance, 0)
    expect(coarse.facing).toBeCloseTo(fine.facing, 2)
  })
})

describe('the walk round the desk', () => {
  const route = measurePath(roundCorners(WALK_OUT_PATH, WALK_CORNER_RADIUS))
  const speed = WALK_SPEED * WALK_PACE

  interface Step {
    /** Metres along the route after the step. */
    distance: number
    /** How far the step moved the walker over the ground. */
    moved: number
    /** The angle between the way the walker faced and the way the step moved it. */
    askew: number
  }

  /** Walks from where `walker` is to `goal`; returns the seconds it took and every step that moved it. */
  function walkTo(walker: Walker, goal: number, goalFacing: number): { seconds: number; steps: Step[] } {
    const steps: Step[] = []
    let seconds = 0
    let from = [...samplePath(route, walker.distance).position]
    while (!stepWalker(walker, route, goal, goalFacing, speed, FRAME)) {
      seconds += FRAME
      const to = samplePath(route, walker.distance).position
      const moved = Math.hypot(to[0] - from[0], to[2] - from[2])
      if (moved > 1e-9) {
        const course = Math.atan2(to[0] - from[0], to[2] - from[2])
        steps.push({ distance: walker.distance, moved, askew: Math.abs(turnBetween(walker.facing, course)) })
      }
      from = [...to]
      if (seconds > 30) throw new Error('the walker never arrived')
    }
    return { seconds, steps }
  }

  it('takes between 3.2 and 3.8 seconds each way', () => {
    const walker: Walker = { distance: 0, facing: SEAT_FACING }
    const out = walkTo(walker, route.length, HANDOFF_FACING).seconds
    expect(out).toBeGreaterThan(3.2)
    expect(out).toBeLessThan(3.8)
    expect(walker.distance).toBe(route.length)
    expect(Math.abs(turnBetween(walker.facing, HANDOFF_FACING))).toBeLessThan(0.26)

    const back = walkTo(walker, 0, SEAT_FACING).seconds
    expect(back).toBeGreaterThan(3.2)
    expect(back).toBeLessThan(3.8)
    expect(walker.distance).toBe(0)
    expect(Math.abs(turnBetween(walker.facing, SEAT_FACING))).toBeLessThan(0.26)
  })

  it.each([
    ['out', 0, 1, SEAT_FACING, HANDOFF_FACING],
    ['back', 1, 0, HANDOFF_FACING, SEAT_FACING],
  ] as const)('never slides sideways on the way %s', (_, from, to, startFacing, goalFacing) => {
    const walker: Walker = { distance: from * route.length, facing: startFacing }
    const { steps } = walkTo(walker, to * route.length, goalFacing)
    expect(steps.length).toBeGreaterThan(100)
    // It never moves while it faces more than an eighth of a turn away from where the step takes it...
    for (const step of steps) expect(step.askew, `${step.distance.toFixed(2)} m along`).toBeLessThan(Math.PI / 4 + 0.02)
    // ...and between setting off and arriving, bends included, it faces within a few degrees of it.
    const underWay = steps.filter(({ distance }) => distance > 0.5 && distance < route.length - 0.5)
    for (const step of underWay) expect(step.askew, `${step.distance.toFixed(2)} m along`).toBeLessThan(0.15)
  })

  it('walks at a steady pace through the bends', () => {
    const walker: Walker = { distance: 0, facing: SEAT_FACING }
    const { steps } = walkTo(walker, route.length, HANDOFF_FACING)
    const underWay = steps.filter(({ distance }) => distance > 0.5 && distance < route.length - 0.5)
    for (const step of underWay) {
      expect(step.moved / FRAME).toBeGreaterThan(speed * 0.85)
      expect(step.moved / FRAME).toBeLessThanOrEqual(speed * 1.0001)
    }
  })
})
