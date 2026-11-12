import { describe, expect, it } from 'vitest'
import { CAMERA, CAMERA_MOBILE, SEAT_GROUND_POS } from '../scene/layout'
import { BODY_MAX_YAW, HEAD_MAX_PITCH, HEAD_MAX_YAW, LOOK_EDGE_YAW } from './constants'
import { computeLookPitch, computeLookYaw, damp, lookAngles, lookPlaneDistance } from './lookAt'

describe('computeLookYaw', () => {
  it('turns only the head for small angles', () => {
    expect(computeLookYaw(0.3)).toEqual({ head: 0.3, body: 0 })
    expect(computeLookYaw(0)).toEqual({ head: 0, body: 0 })
  })

  it('passes what the head cannot cover on to the body', () => {
    const { head, body } = computeLookYaw(1.2)
    expect(head).toBeCloseTo(Math.PI / 4)
    expect(body).toBeCloseTo(1.2 - Math.PI / 4)
  })

  it('stops the body at its own limit', () => {
    const { head, body } = computeLookYaw(2.5)
    expect(head).toBeCloseTo(HEAD_MAX_YAW)
    expect(body).toBeCloseTo(BODY_MAX_YAW)
    expect(BODY_MAX_YAW).toBeCloseTo(Math.PI / 6)
  })

  it('mirrors for negative angles', () => {
    expect(computeLookYaw(-0.3).head).toBeCloseTo(-0.3)
    expect(computeLookYaw(-0.3).body).toBeCloseTo(0)
    expect(computeLookYaw(-1.2).head).toBeCloseTo(-Math.PI / 4)
    expect(computeLookYaw(-1.2).body).toBeCloseTo(-(1.2 - Math.PI / 4))
    expect(computeLookYaw(-2.5).head).toBeCloseTo(-HEAD_MAX_YAW)
    expect(computeLookYaw(-2.5).body).toBeCloseTo(-BODY_MAX_YAW)
  })
})

describe('computeLookPitch', () => {
  it('follows small angles and stops at 20 degrees either way', () => {
    expect(computeLookPitch(0.1)).toBeCloseTo(0.1)
    expect(computeLookPitch(1)).toBeCloseTo((20 * Math.PI) / 180)
    expect(computeLookPitch(-1)).toBeCloseTo(-HEAD_MAX_PITCH)
  })
})

describe('lookAngles', () => {
  const eye = [1, 1, -1] as const

  it('is zero for a target straight ahead at eye height', () => {
    const { yaw, pitch } = lookAngles(eye, 0, [1, 1, 5])
    expect(yaw).toBeCloseTo(0)
    expect(pitch).toBeCloseTo(0)
  })

  it('gives a positive yaw towards +x and a positive pitch upwards', () => {
    const { yaw, pitch } = lookAngles(eye, 0, [2, 2, 0])
    expect(yaw).toBeCloseTo(Math.PI / 4)
    expect(pitch).toBeCloseTo(Math.atan2(1, Math.SQRT2))
    expect(lookAngles(eye, 0, [0, 0, 0]).yaw).toBeCloseTo(-Math.PI / 4)
    expect(lookAngles(eye, 0, [0, 0, 0]).pitch).toBeLessThan(0)
  })

  it('measures yaw from the way the character faces', () => {
    expect(lookAngles(eye, Math.PI / 4, [2, 1, 0]).yaw).toBeCloseTo(0)
    expect(lookAngles(eye, Math.PI / 2, [1, 1, 5]).yaw).toBeCloseTo(-Math.PI / 2)
  })

  it('wraps yaw into -π..π', () => {
    // Facing -z (yaw π) with the target a little to one side, behind the +z axis.
    const { yaw } = lookAngles([0, 0, 0], Math.PI, [-0.1, 0, -1])
    expect(Math.abs(yaw)).toBeLessThan(0.2)
  })
})

describe('damp', () => {
  it('moves towards the goal without overshooting, faster for longer steps', () => {
    const short = damp(0, 1, 8, 0.016)
    const long = damp(0, 1, 8, 0.1)
    expect(short).toBeGreaterThan(0)
    expect(long).toBeGreaterThan(short)
    expect(long).toBeLessThan(1)
    expect(damp(0, 1, 8, 100)).toBeCloseTo(1)
  })

  it('stays put with no time step', () => {
    expect(damp(0.4, 1, 8, 0)).toBe(0.4)
  })
})

describe('lookPlaneDistance', () => {
  it('puts the plane where the edge of the view is the asked angle to the side', () => {
    const cameraDistance = 9
    const viewHalfWidth = 0.3
    const edgeYaw = Math.PI / 5
    const distance = lookPlaneDistance(cameraDistance, viewHalfWidth, edgeYaw)
    const halfWidthAtPlane = (cameraDistance - distance) * viewHalfWidth
    expect(Math.atan2(halfWidthAtPlane, distance)).toBeCloseTo(edgeYaw)
    // The same thing through the look-at maths: a target on the plane's edge, seen from the character.
    expect(lookAngles([0, 1, 0], 0, [halfWidthAtPlane, 1, distance]).yaw).toBeCloseTo(edgeYaw)
  })

  it('stands the plane between the character and the camera', () => {
    for (const viewHalfWidth of [0.05, 0.3, 1.5]) {
      const distance = lookPlaneDistance(9, viewHalfWidth, LOOK_EDGE_YAW)
      expect(distance).toBeGreaterThan(0)
      expect(distance).toBeLessThan(9)
    }
  })

  it('moves the plane closer for a narrower view, so the edge keeps its angle', () => {
    const wide = lookPlaneDistance(9, 0.3, LOOK_EDGE_YAW)
    const narrow = lookPlaneDistance(9, 0.15, LOOK_EDGE_YAW)
    expect(narrow).toBeLessThan(wide)
  })

  it.each([
    ['desktop', CAMERA],
    ['mobile', CAMERA_MOBILE],
  ])('keeps a pointer at the edge of the %s view from turning the body', (_, camera) => {
    expect(LOOK_EDGE_YAW).toBeLessThan(HEAD_MAX_YAW)
    const seatZ = SEAT_GROUND_POS[2]
    const viewHalfWidth = Math.tan((camera.fov * Math.PI) / 360) * camera.aspect
    const distance = lookPlaneDistance(camera.position[2] - seatZ, viewHalfWidth, LOOK_EDGE_YAW)
    const halfWidthAtPlane = (camera.position[2] - seatZ - distance) * viewHalfWidth
    for (const side of [-1, 1]) {
      // The camera is not straight in front of the seat, which shifts the edges by a few degrees.
      const edge = [camera.position[0] + side * halfWidthAtPlane, 1, seatZ + distance] as const
      const { yaw } = lookAngles([SEAT_GROUND_POS[0], 1, seatZ], 0, edge)
      expect(Math.abs(yaw)).toBeGreaterThan((30 * Math.PI) / 180)
      expect(computeLookYaw(yaw).body).toBe(0)
    }
  })
})
