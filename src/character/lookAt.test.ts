import { describe, expect, it } from 'vitest'
import { BODY_MAX_YAW, HEAD_MAX_PITCH, HEAD_MAX_YAW } from './constants'
import { computeLookPitch, computeLookYaw, damp, lookAngles } from './lookAt'

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
