import { describe, expect, it } from 'vitest'
import {
  CAMERA,
  CAMERA_MOBILE,
  CHAIR_POS,
  CHARACTER_HEIGHT,
  DESK_BOUNDS,
  DESK_SIZE,
  DESK_TOP_Y,
  HANDOFF_POS,
  LAPTOP_POS,
  SEAT_FACING,
  SEAT_GROUND_POS,
  SEAT_POS,
  cameraFor,
  fovForAspect,
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
