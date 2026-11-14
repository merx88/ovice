import { describe, expect, it } from 'vitest'
import { holdFile } from '../character/clips/holdFile'
import { measurePath, roundCorners, samplePath } from '../character/path'
import { BADGE_ABOVE_HEAD, FLOAT, raiseFor, SYMBOL_SIZE } from '../character/statusSymbols'
import {
  BOOKSHELF_POS,
  BOOKSHELF_SIZE,
  BOOKSHELF_YAW,
  CAMERA,
  CAMERA_MOBILE,
  CHAIR_BACK,
  CHAIR_POS,
  CHARACTER_BODY_RADIUS,
  CHARACTER_HEIGHT,
  CHARACTER_HEM_HEIGHT,
  CUP_POS,
  DESK_BOUNDS,
  DESK_SIZE,
  DESK_TOP_Y,
  DRAWER_POS,
  DRAWER_SIZE,
  HANDOFF_FACING,
  HANDOFF_POS,
  LAPTOP_POS,
  PARALLAX_RANGE,
  SEAT_FACING,
  SEAT_GROUND_POS,
  SEAT_POS,
  SIDE_TABLE_POS,
  SIDE_TABLE_SIZE,
  SOFA_FACING,
  SOFA_LIFT,
  SOFA_PATH,
  SOFA_POS,
  SOFA_SEAT_HEIGHT,
  SOFA_SEAT_POS,
  SOFA_SIZE,
  SOFA_STAND_POS,
  SOFA_YAW,
  WALK_CORNER_RADIUS,
  WALK_OUT_PATH,
  WALL_Z,
  cameraFor,
  fovForAspect,
  onSofa,
  type Vec3,
} from './layout'

const X = 0
const Y = 1
const Z = 2

describe('layout', () => {
  it('makes the desk 2.4 m wide', () => {
    expect(DESK_SIZE.width).toBe(2.4)
    expect(DESK_BOUNDS.max[X] - DESK_BOUNDS.min[X]).toBeCloseTo(2.4)
  })

  it('puts the hand-off spot in front of the seat', () => {
    expect(HANDOFF_POS[Z]).toBeGreaterThan(SEAT_POS[Z])
  })

  it('keeps the hand-off spot on the floor and outside the desk footprint', () => {
    expect(HANDOFF_POS[Y]).toBe(0)
    const insideX = HANDOFF_POS[X] >= DESK_BOUNDS.min[X] && HANDOFF_POS[X] <= DESK_BOUNDS.max[X]
    const insideZ = HANDOFF_POS[Z] >= DESK_BOUNDS.min[Z] && HANDOFF_POS[Z] <= DESK_BOUNDS.max[Z]
    expect(insideX && insideZ).toBe(false)
    // In front of the desk (towards the camera), not behind or beside it.
    expect(HANDOFF_POS[Z]).toBeGreaterThan(DESK_BOUNDS.max[Z])
  })

  it('raises the seat above the floor but below the desktop', () => {
    expect(SEAT_POS[Y]).toBeGreaterThan(0)
    expect(SEAT_POS[Y]).toBeLessThan(DESK_TOP_Y)
  })

  it('seats the character behind the desk, facing the camera', () => {
    expect(SEAT_POS[Z]).toBeLessThan(DESK_BOUNDS.min[Z])
    const facingZ = Math.cos(SEAT_FACING)
    const towardsCameraZ = Math.sign(CAMERA.position[Z] - SEAT_POS[Z])
    expect(facingZ * towardsCameraZ).toBeCloseTo(1)
  })

  it('gives the floor point under the seated hips', () => {
    expect(SEAT_GROUND_POS).toEqual([SEAT_POS[X], 0, SEAT_POS[Z]])
  })

  it('seats the character far enough back for its round body to clear the desk', () => {
    // The body is about half as deep as the character is tall.
    const bodyHalfDepth = CHARACTER_HEIGHT * 0.24
    expect(SEAT_POS[Z] + bodyHalfDepth).toBeLessThan(DESK_BOUNDS.min[Z])
  })

  it('stands the chair behind the seated hips, in line with them', () => {
    expect(CHAIR_POS[X]).toBe(SEAT_POS[X])
    expect(CHAIR_POS[Y]).toBe(0)
    expect(CHAIR_POS[Z]).toBeLessThan(SEAT_POS[Z])
  })

  it('rests the laptop on the desktop in front of the seat', () => {
    expect(LAPTOP_POS[Y]).toBe(DESK_TOP_Y)
    expect(LAPTOP_POS[X]).toBeCloseTo(SEAT_POS[X])
    expect(LAPTOP_POS[Z]).toBeGreaterThan(SEAT_POS[Z])
    expect(LAPTOP_POS[Z]).toBeGreaterThan(DESK_BOUNDS.min[Z])
    expect(LAPTOP_POS[Z]).toBeLessThan(DESK_BOUNDS.max[Z])
  })

  it('stands the cup on the desktop beside the laptop, where a lean over the desk reaches it', () => {
    expect(CUP_POS[Y]).toBe(DESK_TOP_Y)
    // To the left of the seated character (the camera's right), clear of the laptop.
    expect(CUP_POS[X] - LAPTOP_POS[X]).toBeGreaterThan(0.4)
    expect(CUP_POS[Z]).toBeGreaterThan(DESK_BOUNDS.min[Z] + 0.1)
    expect(CUP_POS[Z]).toBeLessThan(DESK_BOUNDS.max[Z] - 0.1)
    expect(Math.hypot(CUP_POS[X] - SEAT_POS[X], CUP_POS[Z] - SEAT_POS[Z])).toBeLessThan(0.75)
  })

  it('lets a seated character show above the desktop', () => {
    expect(SEAT_POS[Y] + CHARACTER_HEIGHT / 2).toBeGreaterThan(DESK_TOP_Y)
  })

  it('places both cameras in front of the desk looking back at it', () => {
    for (const camera of [CAMERA, CAMERA_MOBILE]) {
      expect(camera.position[Z]).toBeGreaterThan(HANDOFF_POS[Z])
      expect(camera.target[Z]).toBeLessThan(camera.position[Z])
      expect(camera.fov).toBeGreaterThan(0)
      expect(camera.fov).toBeLessThan(90)
    }
  })
})

/** How far `point` is from an upright box's footprint (0 inside it), on the floor. */
function distanceToFootprint(point: readonly [number, number], min: readonly [number, number], max: readonly [number, number]): number {
  const dx = Math.max(min[0] - point[0], 0, point[0] - max[0])
  const dz = Math.max(min[1] - point[1], 0, point[1] - max[1])
  return Math.hypot(dx, dz)
}

/** A point of the room in the sofa's own frame: [to its left, in front of its middle]. */
function inSofaFrame(point: Vec3): [number, number] {
  const dx = point[X] - SOFA_POS[X]
  const dz = point[Z] - SOFA_POS[Z]
  const cos = Math.cos(SOFA_YAW)
  const sin = Math.sin(SOFA_YAW)
  return [dx * cos - dz * sin, dx * sin + dz * cos]
}

describe('the sofa', () => {
  const { arm, back, cushion } = SOFA_SIZE
  const cushionFront = cushion.z + cushion.depth / 2
  const cushionBack = cushion.z - cushion.depth / 2
  /** The arms' faces towards the cushion. */
  const armInside = arm.x - arm.tube

  it('places points given in its own frame', () => {
    expect(onSofa(0, 0)).toEqual([SOFA_POS[X], 0, SOFA_POS[Z]])
    const [x, z] = inSofaFrame(onSofa(0.3, -0.2))
    expect(x).toBeCloseTo(0.3, 10)
    expect(z).toBeCloseTo(-0.2, 10)
    // In front of the sofa is nearer the camera, and the sofa is turned towards the middle of the room.
    expect(onSofa(0, 1)[Z]).toBeGreaterThan(SOFA_POS[Z] + 0.9)
    expect(onSofa(0, 1)[X]).toBeLessThan(SOFA_POS[X])
  })

  it('seats the character on the cushion, between the arms and in front of the backrest', () => {
    const [x, z] = inSofaFrame(SOFA_SEAT_POS)
    expect(SOFA_SEAT_POS[Y]).toBe(0)
    expect(Math.abs(x)).toBeLessThan(1e-9)
    // Inside the cushion's footprint...
    expect(z).toBeGreaterThan(cushionBack)
    expect(z).toBeLessThan(cushionFront)
    expect(Math.abs(x)).toBeLessThan(cushion.width / 2)
    // ...between the arms, with room for the hips...
    expect(armInside - Math.abs(x)).toBeGreaterThan(CHARACTER_BODY_RADIUS)
    // ...and far enough forward for the round body not to be inside the backrest.
    expect(z - (back.z + back.tube)).toBeGreaterThan(CHARACTER_BODY_RADIUS - 0.05)
    expect(z - (back.z + back.tube)).toBeLessThan(CHARACTER_BODY_RADIUS + 0.05)
  })

  it('lifts the seated body so that the hem of its hoodie rests on the cushion', () => {
    expect(SOFA_SEAT_HEIGHT).toBeCloseTo(cushion.y + cushion.height / 2, 10)
    expect(SOFA_LIFT + CHARACTER_HEM_HEIGHT).toBeCloseTo(SOFA_SEAT_HEIGHT, 10)
    expect(SOFA_LIFT).toBeGreaterThan(0)
  })

  it('faces the seated character the way the sofa faces', () => {
    expect(SOFA_FACING).toBe(SOFA_YAW)
  })

  it('stands the character in front of the cushion, a body radius clear of the sofa', () => {
    const [x, z] = inSofaFrame(SOFA_STAND_POS)
    expect(SOFA_STAND_POS[Y]).toBe(0)
    expect(z).toBeGreaterThan(cushionFront)
    // Clear of the cushion and of both arms.
    expect(distanceToFootprint([x, z], [-cushion.width / 2, cushionBack], [cushion.width / 2, cushionFront])).toBeGreaterThanOrEqual(CHARACTER_BODY_RADIUS)
    for (const side of [-1, 1]) {
      const inner = side * armInside
      const outer = side * (arm.x + arm.tube)
      const reach = arm.height / 2
      expect(distanceToFootprint([x, z], [Math.min(inner, outer), -reach], [Math.max(inner, outer), reach])).toBeGreaterThanOrEqual(CHARACTER_BODY_RADIUS)
    }
    // Near enough for a hop backwards onto the cushion.
    const [, seatZ] = inSofaFrame(SOFA_SEAT_POS)
    expect(Math.hypot(x, z - seatZ)).toBeLessThan(0.6)
  })

  it('stands the character a body radius clear of the desk and of the side table', () => {
    const spot: [number, number] = [SOFA_STAND_POS[X], SOFA_STAND_POS[Z]]
    expect(distanceToFootprint(spot, [DESK_BOUNDS.min[X], DESK_BOUNDS.min[Z]], [DESK_BOUNDS.max[X], DESK_BOUNDS.max[Z]])).toBeGreaterThanOrEqual(CHARACTER_BODY_RADIUS)
    const { width, depth } = SIDE_TABLE_SIZE
    const table = distanceToFootprint(
      spot,
      [SIDE_TABLE_POS[X] - width / 2, SIDE_TABLE_POS[Z] - depth / 2],
      [SIDE_TABLE_POS[X] + width / 2, SIDE_TABLE_POS[Z] + depth / 2],
    )
    expect(table).toBeGreaterThanOrEqual(CHARACTER_BODY_RADIUS)
  })

  it('keeps the side table in the picture, beside the sofa and clear of the desk', () => {
    const { width, depth } = SIDE_TABLE_SIZE
    // The right edge of the desktop view at the table's front edge, with a hand's width to spare.
    const front = SIDE_TABLE_POS[Z] + depth / 2
    const halfWidth = (CAMERA.position[Z] - front) * Math.tan((CAMERA.fov * Math.PI) / 360) * CAMERA.aspect
    expect(SIDE_TABLE_POS[X] + width / 2).toBeLessThan(CAMERA.position[X] + halfWidth - 0.08)
    expect(SIDE_TABLE_POS[X] - width / 2).toBeGreaterThan(DESK_BOUNDS.max[X])
    expect(SIDE_TABLE_POS[Y]).toBe(0)
  })
})

describe('the walk from the seat to the hand-off spot', () => {
  /** The route as it is walked: the waypoints with their corners rounded. */
  const route = measurePath(roundCorners(WALK_OUT_PATH, WALK_CORNER_RADIUS))
  const points: Vec3[] = []
  for (let distance = 0; distance < route.length; distance += 0.01) points.push([...samplePath(route, distance).position])
  points.push([...samplePath(route, route.length).position])

  /** How far a ground point is from the desk's footprint; 0 inside it. */
  function gapToDesk([x, , z]: Vec3): number {
    const besideX = Math.max(DESK_BOUNDS.min[X] - x, 0, x - DESK_BOUNDS.max[X])
    const besideZ = Math.max(DESK_BOUNDS.min[Z] - z, 0, z - DESK_BOUNDS.max[Z])
    return Math.hypot(besideX, besideZ)
  }

  it('starts on the seat and ends on the hand-off spot, on the floor all the way', () => {
    expect(WALK_OUT_PATH[0]).toEqual(SEAT_GROUND_POS)
    expect(WALK_OUT_PATH[WALK_OUT_PATH.length - 1]).toEqual(HANDOFF_POS)
    expect(points[0]).toEqual([...SEAT_GROUND_POS])
    expect(points[points.length - 1]).toEqual([...HANDOFF_POS])
    for (const point of points) expect(point[Y]).toBe(0)
  })

  it('keeps the body clear of the desk all the way round', () => {
    // Seated, the character faces the desk with its belly 2 cm from the desk's
    // back edge. Until it has turned and taken its first steps it only has to
    // come no closer than that; from there on its full width has to fit.
    const FIRST_STEPS = 0.3
    const gapAtSeat = gapToDesk(SEAT_GROUND_POS)
    expect(gapAtSeat).toBeCloseTo(CHARACTER_BODY_RADIUS, 2)
    points.forEach((point, index) => {
      const walked = index * 0.01
      const least = walked < FIRST_STEPS ? gapAtSeat : CHARACTER_BODY_RADIUS
      expect(gapToDesk(point), `${walked.toFixed(2)} m along`).toBeGreaterThanOrEqual(least)
    })
  })

  it('goes round the left end of the desk, not through it or past the sofa', () => {
    for (const [x] of points) expect(x).toBeLessThanOrEqual(Math.max(SEAT_GROUND_POS[X], HANDOFF_POS[X]))
    const besideTheDesk = points.filter(([, , z]) => z > DESK_BOUNDS.min[Z] && z < DESK_BOUNDS.max[Z])
    expect(besideTheDesk.length).toBeGreaterThan(0)
    for (const [x] of besideTheDesk) expect(x).toBeLessThan(DESK_BOUNDS.min[X] - CHARACTER_BODY_RADIUS)
  })

  it('stays in the room, in front of the wall', () => {
    for (const [, , z] of points) expect(z - CHARACTER_BODY_RADIUS).toBeGreaterThan(WALL_Z)
  })

  it('rounds its corners without cutting them short', () => {
    // Each corner has room for the whole arc: no segment is shorter than two radii.
    for (let index = 1; index < WALK_OUT_PATH.length; index++) {
      const [ax, , az] = WALK_OUT_PATH[index - 1]
      const [bx, , bz] = WALK_OUT_PATH[index]
      expect(Math.hypot(bx - ax, bz - az)).toBeGreaterThan(WALK_CORNER_RADIUS * 2)
    }
    expect(route.length).toBeLessThan(measurePath(WALK_OUT_PATH).length)
  })

  it('hands the file over facing the camera', () => {
    const towardsCameraZ = Math.sign(CAMERA.position[Z] - HANDOFF_POS[Z])
    expect(Math.cos(HANDOFF_FACING) * towardsCameraZ).toBeCloseTo(1)
  })
})

describe('the ring above the character holding out the file', () => {
  /**
   * The head bone of the standing character above the floor: 0.4941 of the
   * model's 0.7896 units of height (measured on the model). It is right above
   * the point the character stands on, and the hand-over's bob takes the
   * whole body up and down a little.
   */
  const HEAD_HEIGHT = CHARACTER_HEIGHT * (0.4941 / 0.7896)
  const BOB = Math.max(...Array.from({ length: 401 }, (_, i) => -(holdFile.sample(i / 100)['root 1']?.pos?.[Y] ?? 0)))
  /** The ring at its lowest, where the bob and its own drift take it, and how far it reaches round its middle. */
  const ring = {
    centre: [HANDOFF_POS[X], HEAD_HEIGHT - BOB + BADGE_ABOVE_HEAD + raiseFor('done') - FLOAT.height, HANDOFF_POS[Z]],
    radius: SYMBOL_SIZE / 2,
  } as const
  /** The outer ring of the chair's back, behind the desk. */
  const back = { centre: [CHAIR_POS[X], CHAIR_BACK.centerY, CHAIR_POS[Z] + CHAIR_BACK.z], radius: CHAIR_BACK.radius } as const

  /**
   * How much wall shows between the ring and the chair's back (m) to an eye
   * at `eye`, measured on the upright plane through the ring. Both are taken
   * as flat discs facing the camera (the ring's depth and lean and the
   * thickness of the chair's back make a millimetre or two of difference), so
   * this is the distance between two circles once the chair's back is
   * projected onto that plane from the eye.
   */
  function wallBetween(eye: Vec3): number {
    const scale = (eye[Z] - ring.centre[Z]) / (eye[Z] - back.centre[Z])
    const x = eye[X] + (back.centre[X] - eye[X]) * scale
    const y = eye[Y] + (back.centre[Y] - eye[Y]) * scale
    return Math.hypot(ring.centre[X] - x, ring.centre[Y] - y) - ring.radius - back.radius * scale
  }

  it('shows at least 5 cm of wall between itself and the chair behind, from either camera, wherever the pointer draws it', () => {
    expect(BOB).toBeGreaterThan(0)
    /** Every centimetre of the way the camera drifts towards the pointer, on each axis. */
    const drifts = Array.from({ length: 31 }, (_, i) => PARALLAX_RANGE * (i / 15 - 1))
    for (const [name, camera] of [
      ['desktop', CAMERA],
      ['phone', CAMERA_MOBILE],
    ] as const) {
      let least = Infinity
      for (const right of drifts) {
        for (const up of drifts) {
          least = Math.min(least, wallBetween([camera.position[X] + right, camera.position[Y] + up, camera.position[Z]]))
        }
      }
      expect(least, `the least wall seen from the ${name} camera`).toBeGreaterThanOrEqual(0.05)
    }
  })
})

describe('the way from the seat to the sofa', () => {
  /** The route as it is walked out and run back: the waypoints with their corners rounded. */
  const route = measurePath(roundCorners(SOFA_PATH, WALK_CORNER_RADIUS))
  const STEP = 0.01
  const points: Vec3[] = []
  for (let distance = 0; distance < route.length; distance += STEP) points.push([...samplePath(route, distance).position])
  points.push([...samplePath(route, route.length).position])

  /** A point of the room in the frame of a piece of furniture that stands at `origin`, turned by `yaw`: [across it, in front of its middle]. */
  function inFrameOf(point: Vec3, origin: Vec3, yaw: number): [number, number] {
    const dx = point[X] - origin[X]
    const dz = point[Z] - origin[Z]
    return [dx * Math.cos(yaw) - dz * Math.sin(yaw), dx * Math.sin(yaw) + dz * Math.cos(yaw)]
  }

  /** How far a point is from a box that stands at `origin`, `width` across and `depth` deep, turned by `yaw`. */
  function gapToBox(point: Vec3, origin: Vec3, width: number, depth: number, yaw = 0): number {
    return distanceToFootprint(inFrameOf(point, origin, yaw), [-width / 2, -depth / 2], [width / 2, depth / 2])
  }

  /** How far a point is from the sofa: its cushion, its two arms and its backrest. */
  function gapToSofa(point: Vec3): number {
    const { arm, back, cushion } = SOFA_SIZE
    const spot = inFrameOf(point, SOFA_POS, SOFA_YAW)
    return Math.min(
      distanceToFootprint(spot, [-cushion.width / 2, cushion.z - cushion.depth / 2], [cushion.width / 2, cushion.z + cushion.depth / 2]),
      distanceToFootprint(spot, [-arm.x - arm.tube, -arm.height / 2], [-arm.x + arm.tube, arm.height / 2]),
      distanceToFootprint(spot, [arm.x - arm.tube, -arm.height / 2], [arm.x + arm.tube, arm.height / 2]),
      distanceToFootprint(spot, [-back.radius - back.tube, back.z - back.tube], [back.radius + back.tube, back.z + back.tube]),
    )
  }

  const gapToDesk = (point: Vec3) =>
    distanceToFootprint([point[X], point[Z]], [DESK_BOUNDS.min[X], DESK_BOUNDS.min[Z]], [DESK_BOUNDS.max[X], DESK_BOUNDS.max[Z]])

  it('starts on the seat and ends on the spot in front of the sofa, on the floor all the way', () => {
    expect(SOFA_PATH[0]).toEqual(SEAT_GROUND_POS)
    expect(SOFA_PATH[SOFA_PATH.length - 1]).toEqual(SOFA_STAND_POS)
    expect(points[0]).toEqual([...SEAT_GROUND_POS])
    expect(points[points.length - 1]).toEqual([...SOFA_STAND_POS])
    for (const point of points) expect(point[Y]).toBe(0)
  })

  it('is the way to the hand-off spot as far as that goes, and passes over it', () => {
    expect(SOFA_PATH.slice(0, WALK_OUT_PATH.length - 1)).toEqual(WALK_OUT_PATH.slice(0, -1))
    const handOver = measurePath(roundCorners(WALK_OUT_PATH, WALK_CORNER_RADIUS))
    // The same ground, step for step, up to the hand-off spot.
    for (let distance = 0; distance <= handOver.length; distance += 0.25) {
      const [x, , z] = samplePath(route, distance).position
      const [hx, , hz] = samplePath(handOver, distance).position
      expect(Math.hypot(x - hx, z - hz), `${distance} m along`).toBeLessThan(1e-9)
    }
    const [x, , z] = samplePath(route, handOver.length).position
    expect(Math.hypot(x - HANDOFF_POS[X], z - HANDOFF_POS[Z])).toBeLessThan(1e-9)
  })

  it('keeps the body clear of the desk and of the drawer unit under it all the way', () => {
    // As on the way to the hand-off spot: for its first steps it only has to come no closer than it sits.
    const FIRST_STEPS = 0.3
    const gapAtSeat = gapToDesk(SEAT_GROUND_POS)
    points.forEach((point, index) => {
      const walked = index * STEP
      const least = walked < FIRST_STEPS ? gapAtSeat : CHARACTER_BODY_RADIUS
      expect(gapToDesk(point), `${walked.toFixed(2)} m along`).toBeGreaterThanOrEqual(least)
      // The drawers' fronts and knobs stand a little proud of the unit's footprint.
      expect(gapToBox(point, DRAWER_POS, DRAWER_SIZE.width, DRAWER_SIZE.depth), `${walked.toFixed(2)} m along`).toBeGreaterThanOrEqual(CHARACTER_BODY_RADIUS + 0.03)
    })
  })

  it('keeps the body clear of the bookshelf', () => {
    points.forEach((point, index) => {
      // The cells stand 2.5 cm proud of the frame in front.
      const gap = gapToBox(point, BOOKSHELF_POS, BOOKSHELF_SIZE.width, BOOKSHELF_SIZE.depth, BOOKSHELF_YAW)
      expect(gap, `${(index * STEP).toFixed(2)} m along`).toBeGreaterThanOrEqual(CHARACTER_BODY_RADIUS + 0.03)
    })
  })

  it('keeps the body clear of the sofa and of the side table, up to where it stands before the hop', () => {
    points.forEach((point, index) => {
      const along = `${(index * STEP).toFixed(2)} m along`
      expect(gapToSofa(point), along).toBeGreaterThanOrEqual(CHARACTER_BODY_RADIUS)
      expect(gapToBox(point, SIDE_TABLE_POS, SIDE_TABLE_SIZE.width, SIDE_TABLE_SIZE.depth), along).toBeGreaterThanOrEqual(CHARACTER_BODY_RADIUS)
    })
  })

  it('goes round the left end of the desk and along its front, never between the desk and the sofa', () => {
    const leftmost = Math.min(...points.map(([x]) => x))
    expect(leftmost).toBeLessThan(DESK_BOUNDS.min[X] - CHARACTER_BODY_RADIUS)
    // Past the desk's right end it is in front of the desk, or already on the stretch that ends before the cushion.
    const lastStretch = route.length - Math.hypot(SOFA_STAND_POS[X] - SOFA_PATH[3][X], SOFA_STAND_POS[Z] - SOFA_PATH[3][Z])
    points.forEach(([x, , z], index) => {
      if (x > DESK_BOUNDS.max[X] && index * STEP < lastStretch) expect(z).toBeGreaterThan(DESK_BOUNDS.max[Z] + CHARACTER_BODY_RADIUS)
    })
  })

  it('comes up to the sofa along the line a character faces that has just hopped off it', () => {
    const [bx, , bz] = SOFA_PATH[SOFA_PATH.length - 2]
    const away = Math.atan2(bx - SOFA_STAND_POS[X], bz - SOFA_STAND_POS[Z])
    // So it sets off on its run back without a turn, and on arriving turns its back to the sofa.
    expect(away).toBeCloseTo(SOFA_FACING, 10)
    expect(samplePath(route, route.length - 0.05).heading).toBeCloseTo(SOFA_FACING + Math.PI, 10)
  })

  it('stays in the room and in the picture', () => {
    for (const [x, , z] of points) {
      expect(z - CHARACTER_BODY_RADIUS).toBeGreaterThan(WALL_Z)
      const halfWidth = (CAMERA.position[Z] - z) * Math.tan((CAMERA.fov * Math.PI) / 360) * CAMERA.aspect
      expect(Math.abs(x - CAMERA.position[X]) + CHARACTER_BODY_RADIUS).toBeLessThan(halfWidth)
    }
  })

  it('has room for every one of its arcs', () => {
    for (let index = 1; index < SOFA_PATH.length - 1; index++) {
      const [ax, , az] = SOFA_PATH[index - 1]
      const [bx, , bz] = SOFA_PATH[index]
      const [cx, , cz] = SOFA_PATH[index + 1]
      const before = Math.hypot(bx - ax, bz - az)
      const after = Math.hypot(cx - bx, cz - bz)
      const turn = Math.acos(((bx - ax) * (cx - bx) + (bz - az) * (cz - bz)) / (before * after))
      /** How far from the corner an arc of the full radius leaves one stretch and joins the next. */
      const cut = WALK_CORNER_RADIUS * Math.tan(turn / 2)
      expect(cut, `corner ${index}`).toBeLessThan(Math.min(before, after) / 2)
    }
  })

  it('is about seven metres long: a walk of some five seconds, a run of two', () => {
    expect(route.length).toBeGreaterThan(7)
    expect(route.length).toBeLessThan(7.5)
  })
})

describe('cameraFor', () => {
  it('uses the desktop camera from 768 px wide', () => {
    expect(cameraFor(768)).toBe(CAMERA)
    expect(cameraFor(1728)).toBe(CAMERA)
  })

  it('uses the mobile camera below 768 px wide', () => {
    expect(cameraFor(767)).toBe(CAMERA_MOBILE)
    expect(cameraFor(390)).toBe(CAMERA_MOBILE)
  })
})

describe('fovForAspect', () => {
  const horizontalExtent = (fov: number, aspect: number) => Math.tan((fov * Math.PI) / 360) * aspect

  it('keeps the designed fov at the designed aspect and on wider viewports', () => {
    expect(fovForAspect(CAMERA, CAMERA.aspect)).toBeCloseTo(CAMERA.fov)
    expect(fovForAspect(CAMERA, CAMERA.aspect * 1.5)).toBeCloseTo(CAMERA.fov)
  })

  it('widens the fov on narrower viewports so the same width stays in view', () => {
    const narrow = CAMERA.aspect / 1.6
    const fov = fovForAspect(CAMERA, narrow)
    expect(fov).toBeGreaterThan(CAMERA.fov)
    expect(horizontalExtent(fov, narrow)).toBeCloseTo(horizontalExtent(CAMERA.fov, CAMERA.aspect))
  })
})
