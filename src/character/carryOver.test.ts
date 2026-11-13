import { Euler, Matrix4, Quaternion, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { SOFA_FACING, SOFA_SEAT_POS, SOFA_STAND_POS } from '../scene/layout'
import { carryOver, rootReach, type Placed } from './carryOver'
import { CLIPS } from './clips'

const up = new Vector3(0, 1, 0)

function placedGroup({ position, facing }: Placed): Matrix4 {
  return new Matrix4().compose(new Vector3(...position), new Quaternion().setFromAxisAngle(up, facing), new Vector3(1, 1, 1))
}

/** The bone's place in the room: the placed group, then the bone's parent, then the bone itself. */
function inRoom(placed: Placed, parent: Matrix4, position: Vector3, quaternion: Quaternion): Matrix4 {
  return placedGroup(placed).multiply(parent).multiply(new Matrix4().compose(position, quaternion, new Vector3(1, 1, 1)))
}

function expectSameMatrix(actual: Matrix4, expected: Matrix4) {
  actual.elements.forEach((value, index) => expect(value).toBeCloseTo(expected.elements[index], 9))
}

/** A parent like the model's: scaled, its axes turned, off the origin. */
const parent = new Matrix4().compose(new Vector3(0, 0, -0.357), new Quaternion(0.5, 0.5, 0.5, 0.5), new Vector3(1.52, 1.52, 1.52))

describe('carryOver', () => {
  it('leaves a bone as it is when the placement does not change', () => {
    const position = new Vector3(0.26, 0.23, 0)
    const quaternion = new Quaternion().setFromEuler(new Euler(0.2, -0.4, 0.1))
    const placed: Placed = { position: [1, 0, 2], facing: 0.7 }
    carryOver(position, quaternion, parent, placed, { ...placed })
    expect(position.distanceTo(new Vector3(0.26, 0.23, 0))).toBeLessThan(1e-9)
    // (An angle this near nothing comes out of the arithmetic a few hundred-millionths off.)
    expect(quaternion.angleTo(new Quaternion().setFromEuler(new Euler(0.2, -0.4, 0.1)))).toBeLessThan(1e-6)
  })

  it('keeps the bone where it is in the room when the placement jumps and turns', () => {
    const from: Placed = { position: [1.76, 0, 0.11], facing: -0.2 }
    const to: Placed = { position: [2.0, 0, -0.33], facing: 0.4 }
    const position = new Vector3(0.26, 0.23, 0.05)
    const quaternion = new Quaternion().setFromEuler(new Euler(0.2, -0.4, 0.1))
    const before = inRoom(from, parent, position, quaternion)
    carryOver(position, quaternion, parent, from, to)
    expectSameMatrix(inRoom(to, parent, position, quaternion), before)
    // It did have to change for that.
    expect(position.distanceTo(new Vector3(0.26, 0.23, 0.05))).toBeGreaterThan(0.1)
  })

  it('works whatever lies between the placed group and the bone', () => {
    const plain = new Matrix4()
    const from: Placed = { position: [0, 0, 0], facing: 0 }
    const to: Placed = { position: [0.5, 0, -1], facing: Math.PI / 2 }
    const position = new Vector3(0, 0.6, 0)
    const quaternion = new Quaternion()
    const before = inRoom(from, plain, position, quaternion)
    carryOver(position, quaternion, plain, from, to)
    expectSameMatrix(inRoom(to, plain, position, quaternion), before)
  })

  it('brings a character that stood in front of the sofa to where the hop starts', () => {
    // The walk ends standing on the stand spot; the hop is played from the seat spot with the root held out to it.
    const from: Placed = { position: SOFA_STAND_POS, facing: SOFA_FACING }
    const to: Placed = { position: SOFA_SEAT_POS, facing: SOFA_FACING }
    const plain = new Matrix4()
    const position = new Vector3(0, 0, 0)
    const quaternion = new Quaternion()
    carryOver(position, quaternion, plain, from, to)
    const start = CLIPS.hopOn.sample(0)['root 1']?.pos ?? [0, 0, 0]
    expect(position.x).toBeCloseTo(start[0], 9)
    expect(position.y).toBeCloseTo(start[1], 9)
    expect(position.z).toBeCloseTo(start[2], 9)
  })
})

describe('rootReach', () => {
  it('is nothing for a pose that stays over its placement, however high', () => {
    expect(rootReach({})).toBe(0)
    expect(rootReach({ 'root 1': {} })).toBe(0)
    expect(rootReach({ 'root 1': { pos: [0, 0.3, 0] } })).toBe(0)
    for (const name of ['idle', 'walk', 'run', 'sitDown', 'standUp', 'loungeIdle'] as const) expect(rootReach(CLIPS[name].sample(0.2))).toBe(0)
  })

  it('is the way to the stand spot at the floor end of a hop', () => {
    const reach = Math.hypot(SOFA_STAND_POS[0] - SOFA_SEAT_POS[0], SOFA_STAND_POS[2] - SOFA_SEAT_POS[2])
    expect(rootReach(CLIPS.hopOn.sample(0))).toBeCloseTo(reach, 9)
    expect(rootReach(CLIPS.hopOff.sample(CLIPS.hopOff.duration as number))).toBeCloseTo(reach, 9)
    expect(rootReach(CLIPS.hopOn.sample(CLIPS.hopOn.duration as number))).toBeCloseTo(0, 9)
    expect(rootReach(CLIPS.hopOff.sample(0))).toBeCloseTo(0, 9)
  })
})
