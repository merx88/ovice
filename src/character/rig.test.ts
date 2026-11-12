import { Bone, BoxGeometry, Object3D, Quaternion, SkinnedMesh, Vector3 } from 'three'
import { beforeEach, describe, expect, it } from 'vitest'
import { applyPose, applyRest, buildRig, setEyeOpenness, turnBone, type Rig } from './rig'

const MODEL_HEIGHT = 2
const HEIGHT = 1

/**
 * A stand-in for the model with the same bone tree, 2 units tall. As in the
 * real model, some bones are turned at rest (so a bone's own axes are not the
 * character's) and the foot targets hang off `master control`, not the legs.
 */
function makeModel(): Object3D {
  const bone = (name: string, parent: Object3D, position: [number, number, number], turn?: [number, number, number]) => {
    const made = new Bone()
    made.name = name
    made.position.set(...position)
    if (turn) made.rotation.set(...turn)
    parent.add(made)
    return made
  }
  const model = new Object3D()
  const armature = new Object3D()
  model.add(armature)
  const master = bone('master_control', armature, [0, 0, 0])
  // Turned a quarter about x, and `body` turned back, like the model's `root 1`.
  const root = bone('root_1', master, [0, 1, 0], [-Math.PI / 2, 0, 0])
  const body = bone('body', root, [0, 0, 0], [Math.PI / 2, 0, 0])
  bone('head', body, [0, 0.5, 0])
  const hip = bone('hip', root, [0, 0, 0], [Math.PI / 2, 0, 0])
  for (const [side, sign] of [['L', 1], ['R', -1]] as const) {
    // The arm bones point along their own y axis, out to the side.
    const upper = bone(`arm_${side}001`, body, [0.3 * sign, 0.4, 0], [0, 0, (-Math.PI / 2) * sign])
    const fore = bone(`arm_${side}002`, upper, [0, 0.2, 0])
    bone(`arm_${side}003`, fore, [0, 0.2, 0])
    const thigh = bone(`Leg_${side}001`, hip, [0.1 * sign, -0.2, 0])
    bone(`Leg_${side}002`, thigh, [0, -0.4, 0])
    const target = bone(`foot_IK_${side}`, master, [0.1 * sign, 0.1, 0])
    bone(`Leg_${side}003`, target, [0, 0, 0])
  }
  for (const name of ['suit', 'eyes']) {
    const geometry = new BoxGeometry(1, MODEL_HEIGHT, 1)
    geometry.translate(0, MODEL_HEIGHT / 2, 0)
    const mesh = new SkinnedMesh(geometry)
    mesh.name = name
    model.add(mesh)
  }
  return model
}

/** Where a bone is, in model units, relative to the model. */
function place(rig: Rig, name: Parameters<typeof turnBone>[1]): Vector3 {
  rig.model.updateWorldMatrix(true, true)
  return rig.byName[name].bone.getWorldPosition(new Vector3())
}

function expectAt(actual: Vector3, expected: [number, number, number]) {
  expect(actual.x).toBeCloseTo(expected[0])
  expect(actual.y).toBeCloseTo(expected[1])
  expect(actual.z).toBeCloseTo(expected[2])
}

describe('rig', () => {
  let rig: Rig

  beforeEach(() => {
    rig = buildRig(makeModel(), [], HEIGHT)
  })

  it('scales the model to the requested height', () => {
    expect(rig.scale).toBeCloseTo(HEIGHT / MODEL_HEIGHT)
  })

  it('reports a bone the model lacks', () => {
    const model = makeModel()
    model.getObjectByName('head')?.removeFromParent()
    expect(() => buildRig(model, [], HEIGHT)).toThrow('head')
  })

  it('leaves the rest pose alone for an empty pose', () => {
    applyPose(rig, {})
    expectAt(place(rig, 'head'), [0, 1.5, 0])
    expectAt(place(rig, 'arm_L.003'), [0.7, 1.4, 0])
    expectAt(place(rig, 'arm_R.003'), [-0.7, 1.4, 0])
    expectAt(place(rig, 'Leg_L.002'), [0.1, 0.4, 0])
    expectAt(place(rig, 'foot_IK_L'), [0.1, 0.1, 0])
    for (const { bone, restLocalQuaternion } of rig.joints) {
      expect(bone.quaternion.angleTo(restLocalQuaternion)).toBeCloseTo(0)
    }
  })

  it('rotates about the character axes whatever way the bone itself is turned', () => {
    // Left arm: z < 0 lowers it, y < 0 swings it forward.
    applyPose(rig, { 'arm_L.001': { rot: [0, 0, -Math.PI / 2] } })
    expectAt(place(rig, 'arm_L.003'), [0.3, 1.0, 0])
    applyPose(rig, { 'arm_L.001': { rot: [0, -Math.PI / 2, 0] } })
    expectAt(place(rig, 'arm_L.003'), [0.3, 1.4, 0.4])
    // A leg: x < 0 swings it forward.
    applyPose(rig, { 'Leg_L.001': { rot: [-Math.PI / 2, 0, 0] } })
    expectAt(place(rig, 'Leg_L.002'), [0.1, 0.8, 0.4])
  })

  it('applies z, then y, then x', () => {
    // Lowered by a quarter turn and then swung forward, the arm still hangs straight down...
    applyPose(rig, { 'arm_L.001': { rot: [0, -Math.PI / 2, -Math.PI / 2] } })
    expectAt(place(rig, 'arm_L.003'), [0.3, 1.0, 0])
    // ...and the turn about x, applied last, brings it up to point forward.
    applyPose(rig, { 'arm_L.001': { rot: [-Math.PI / 2, 0, -Math.PI / 2] } })
    expectAt(place(rig, 'arm_L.003'), [0.3, 1.4, 0.4])
  })

  it('carries the axes of a child along with its parent', () => {
    // With the upper arm hanging down, bending the elbow "forward" still bends it forward.
    applyPose(rig, { 'arm_L.001': { rot: [0, 0, -Math.PI / 2] }, 'arm_L.002': { rot: [0, -Math.PI / 2, 0] } })
    expectAt(place(rig, 'arm_L.002'), [0.3, 1.2, 0])
    expectAt(place(rig, 'arm_L.003'), [0.3, 1.2, 0.2])
  })

  it('moves bones by offsets given in metres', () => {
    applyPose(rig, { 'root 1': { pos: [0, 0.25, 0] } })
    // 0.25 m is 0.5 model units at this scale.
    expectAt(place(rig, 'head'), [0, 2.0, 0])
    expectAt(place(rig, 'Leg_R.002'), [-0.1, 0.9, 0])
  })

  it('makes the foot targets follow their legs although they are not their children', () => {
    applyPose(rig, { 'root 1': { pos: [0, 0.25, 0] } })
    expectAt(place(rig, 'foot_IK_L'), [0.1, 0.6, 0])
    expectAt(place(rig, 'Leg_L.003'), [0.1, 0.6, 0])
    // Swinging the thigh forward swings the foot around the hip joint (0.1, 0.8, 0).
    applyPose(rig, { 'Leg_L.001': { rot: [-Math.PI / 2, 0, 0] } })
    expectAt(place(rig, 'foot_IK_L'), [0.1, 0.8, 0.7])
    expectAt(place(rig, 'foot_IK_R'), [-0.1, 0.1, 0])
  })

  it('goes back to rest', () => {
    applyPose(rig, { body: { rot: [0.4, 0.2, 0.1] }, 'Leg_L.001': { rot: [-1, 0, 0] }, 'root 1': { pos: [0, 0.3, 0.1] } })
    applyRest(rig)
    expectAt(place(rig, 'head'), [0, 1.5, 0])
    expectAt(place(rig, 'foot_IK_L'), [0.1, 0.1, 0])
  })

  it('turns a bone on top of the pose it is in', () => {
    const quarterLeft = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2)
    applyPose(rig, {})
    turnBone(rig, 'body', quarterLeft)
    // Turning the body to the character's left brings its left arm round to the back.
    expectAt(place(rig, 'arm_L.003'), [0, 1.4, -0.7])
    expectAt(place(rig, 'head'), [0, 1.5, 0])
    // The legs hang off the hip, which did not turn.
    expectAt(place(rig, 'Leg_L.002'), [0.1, 0.4, 0])

    applyPose(rig, { body: { rot: [0, Math.PI / 2, 0] } })
    turnBone(rig, 'body', quarterLeft)
    expectAt(place(rig, 'arm_L.003'), [-0.7, 1.4, 0])
  })

  it('closes the eyes by squashing them about their centre', () => {
    const top = new Vector3(0, MODEL_HEIGHT, 0)
    const centre = new Vector3(0, MODEL_HEIGHT / 2, 0)
    setEyeOpenness(rig, 0.1)
    expect(top.clone().applyMatrix4(rig.eyes.bindMatrix).y).toBeCloseTo(MODEL_HEIGHT / 2 + (MODEL_HEIGHT / 2) * 0.1)
    expect(centre.clone().applyMatrix4(rig.eyes.bindMatrix).y).toBeCloseTo(MODEL_HEIGHT / 2)
    setEyeOpenness(rig, 1)
    expect(top.clone().applyMatrix4(rig.eyes.bindMatrix).y).toBeCloseTo(MODEL_HEIGHT)
  })
})
