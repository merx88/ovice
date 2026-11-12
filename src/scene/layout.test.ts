import { describe, expect, it } from 'vitest'
import { measurePath, roundCorners, samplePath } from '../character/path'
import {
  CAMERA,
  CAMERA_MOBILE,
  CHAIR_POS,
  CHARACTER_BODY_RADIUS,
  CHARACTER_HEIGHT,
  DESK_BOUNDS,
  DESK_SIZE,
  DESK_TOP_Y,
  HANDOFF_FACING,
  HANDOFF_POS,
  LAPTOP_POS,
  SEAT_FACING,
  SEAT_GROUND_POS,
  SEAT_POS,
  WALK_CORNER_RADIUS,
  WALK_OUT_PATH,
  WALL_Z,
  cameraFor,
  fovForAspect,
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
