// The character model's skeleton: finding its bones and posing them with
// offsets from the rest pose (see `clips/shared.ts` for how a pose is written).
// Nothing here needs a renderer or the model file, so it can be unit tested.
import {
  Box3,
  Color,
  Euler,
  Matrix4,
  Quaternion,
  Vector3,
  type AnimationClip,
  type Material,
  type Object3D,
  type SkinnedMesh,
} from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { CHARACTER_HEIGHT } from '../scene/layout'
import { tokens } from '../theme/tokens'
import { BONE_NAMES, type BoneName, type Pose } from './clips/shared'

export const MODEL_URL = '/models/ovice_guy.glb'

/** The loader strips dots and spaces from node names, so each bone is looked up by its stripped name. */
const NODE_NAMES: Record<BoneName, string> = {
  'master control': 'master_control',
  'root 1': 'root_1',
  body: 'body',
  head: 'head',
  hip: 'hip',
  'arm_L.001': 'arm_L001',
  'arm_L.002': 'arm_L002',
  'arm_L.003': 'arm_L003',
  'arm_R.001': 'arm_R001',
  'arm_R.002': 'arm_R002',
  'arm_R.003': 'arm_R003',
  'Leg_L.001': 'Leg_L001',
  'Leg_L.002': 'Leg_L002',
  'Leg_L.003': 'Leg_L003',
  'Leg_R.001': 'Leg_R001',
  'Leg_R.002': 'Leg_R002',
  'Leg_R.003': 'Leg_R003',
  foot_IK_L: 'foot_IK_L',
  foot_IK_R: 'foot_IK_R',
}
const EYES_NODE = 'eyes'

/**
 * In the model each foot hangs off an IK target that is a child of
 * `master control`, not of its leg, and the export carries no IK. Poses
 * therefore treat each target as if it were a child of its shin, so that the
 * boots follow the legs.
 */
const POSE_PARENTS: Partial<Record<BoneName, BoneName>> = {
  foot_IK_L: 'Leg_L.002',
  foot_IK_R: 'Leg_R.002',
}

export interface RigJoint {
  name: BoneName
  bone: Object3D
  /** The joint this bone is a child of in the model, or null for the root bone. */
  parent: RigJoint | null
  /** The joint whose motion this one follows in a pose (see `POSE_PARENTS`). */
  poseParent: RigJoint | null
  /** Rest transform relative to the parent bone. */
  restLocalPosition: Vector3
  restLocalQuaternion: Quaternion
  /** Rest transform in armature space (the space the root bone lives in). */
  restPosition: Vector3
  restQuaternion: Quaternion
  /** The transform of the pose being applied, in armature space. */
  position: Vector3
  quaternion: Quaternion
  /** How far the pose being applied has turned the joint away from rest, in armature space. */
  turned: Quaternion
}

export interface Rig {
  /** A private copy of the model; mount it inside a group scaled by `scale`. */
  model: Object3D
  /** Every bone, ordered so that a joint comes after the one it follows. */
  joints: RigJoint[]
  byName: Record<BoneName, RigJoint>
  /** Metres per model unit: brings the model to `CHARACTER_HEIGHT`. */
  scale: number
  /** Animation clips that came with the model. */
  clips: AnimationClip[]
  eyes: SkinnedMesh
  /** The eyes' bind matrix with the eyes open, and the centre they close towards. */
  eyesBind: Matrix4
  eyesCenter: Vector3
}

/**
 * The model's texture paints the suit blue; the office's character wears
 * silver (the design's `chrome`). This finish repaints every bluish texel in
 * `tokens.chrome`, keeping the texture's painted light and shade, and makes
 * those texels metallic. Skin, drawstrings and soles keep the texture's own
 * colors.
 */
const SUIT = {
  metalness: 0.9,
  roughness: 0.3,
  /** Brightness of the silver where the texture is darkest, and how much the texture's own brightness adds. */
  shade: 0.5,
  light: 1.5,
  /** The brightest the silver gets, as a multiple of `tokens.chrome`. */
  brightest: 1.25,
  /** How much bluer than red (linear) a texel has to be to count as suit. */
  blueness: 0.08,
} as const
const suitColor = new Color(tokens.chrome)
/** One silver material per material of the model, shared by every rig built from it. */
const silverVersions = new WeakMap<Material, Material>()
const glsl = (value: number) => value.toFixed(3)

function inSilverSuit(material: Material): Material {
  const existing = silverVersions.get(material)
  if (existing) return existing
  const silver = material.clone()
  silver.onBeforeCompile = (shader) => {
    shader.uniforms.uSuitColor = { value: suitColor }
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform vec3 uSuitColor;\nvoid main() {\n\tfloat suit = 0.0;')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        suit = smoothstep(0.0, ${glsl(SUIT.blueness)}, diffuseColor.b - diffuseColor.r);
        float suitTone = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        float suitLight = min(${glsl(SUIT.shade)} + suitTone * ${glsl(SUIT.light)}, ${glsl(SUIT.brightest)});
        diffuseColor.rgb = mix(diffuseColor.rgb, uSuitColor * suitLight, suit);`,
      )
      .replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
        metalnessFactor = mix(metalnessFactor, ${glsl(SUIT.metalness)}, suit);
        roughnessFactor = mix(roughnessFactor, ${glsl(SUIT.roughness)}, suit);`,
      )
  }
  silverVersions.set(material, silver)
  return silver
}

function isSkinnedMesh(object: Object3D): object is SkinnedMesh {
  return (object as SkinnedMesh).isSkinnedMesh === true
}

/** Orders joints so that every joint comes after the joint it follows in a pose. */
function inPoseOrder(joints: RigJoint[]): RigJoint[] {
  const ordered: RigJoint[] = []
  const visit = (joint: RigJoint) => {
    if (ordered.includes(joint)) return
    if (joint.poseParent) visit(joint.poseParent)
    ordered.push(joint)
  }
  joints.forEach(visit)
  return ordered
}

/**
 * Reads the skeleton out of `model`, which must be in its rest pose, and
 * scales the character to `height` metres. Bones are assumed unscaled, as
 * they are in the model.
 */
export function buildRig(model: Object3D, clips: AnimationClip[], height: number): Rig {
  model.updateWorldMatrix(true, true)

  const byName = {} as Record<BoneName, RigJoint>
  for (const name of BONE_NAMES) {
    const bone = model.getObjectByName(NODE_NAMES[name])
    if (!bone) throw new Error(`The character model has no bone "${name}"`)
    byName[name] = {
      name,
      bone,
      parent: null,
      poseParent: null,
      restLocalPosition: bone.position.clone(),
      restLocalQuaternion: bone.quaternion.clone(),
      restPosition: new Vector3(),
      restQuaternion: new Quaternion(),
      position: new Vector3(),
      quaternion: new Quaternion(),
      turned: new Quaternion(),
    }
  }
  const joints = Object.values(byName)
  for (const joint of joints) {
    joint.parent = joints.find((other) => other.bone === joint.bone.parent) ?? null
    const followed = POSE_PARENTS[joint.name]
    joint.poseParent = followed ? byName[followed] : joint.parent
  }

  const root = joints.find((joint) => joint.parent === null)
  if (!root?.bone.parent) throw new Error('The character model has no armature')
  const toArmature = root.bone.parent.matrixWorld.clone().invert()
  const matrix = new Matrix4()
  const unitScale = new Vector3()
  for (const joint of joints) {
    matrix.multiplyMatrices(toArmature, joint.bone.matrixWorld)
    matrix.decompose(joint.restPosition, joint.restQuaternion, unitScale)
  }

  const meshes: SkinnedMesh[] = []
  model.traverse((object) => {
    if (isSkinnedMesh(object)) meshes.push(object)
  })
  const eyes = meshes.find((mesh) => mesh.name === EYES_NODE)
  if (!eyes) throw new Error('The character model has no eyes')
  const bounds = new Box3()
  for (const mesh of meshes) {
    mesh.geometry.computeBoundingBox()
    bounds.union(mesh.geometry.boundingBox as Box3)
    // The bounds of a skinned mesh are those of its rest pose, which the posed body leaves.
    mesh.frustumCulled = false
    if (mesh === eyes) continue
    mesh.castShadow = true
    mesh.material = inSilverSuit(mesh.material as Material)
  }

  return {
    model,
    joints: inPoseOrder(joints),
    byName,
    scale: height / (bounds.max.y - bounds.min.y),
    clips,
    eyes,
    eyesBind: eyes.bindMatrix.clone(),
    eyesCenter: (eyes.geometry.boundingBox as Box3).getCenter(new Vector3()),
  }
}

const euler = new Euler()
const offset = new Vector3()
const inverse = new Quaternion()
const squash = new Matrix4()
const shift = new Matrix4()

/** Puts every bone into `pose`. Bones the pose does not mention go to their rest transform. */
export function applyPose(rig: Rig, pose: Pose): void {
  // Work out where every joint ends up in armature space...
  for (const joint of rig.joints) {
    const { rot, pos } = pose[joint.name] ?? {}
    const followed = joint.poseParent
    if (rot) joint.turned.setFromEuler(euler.set(rot[0], rot[1], rot[2]))
    else joint.turned.identity()
    joint.position.copy(joint.restPosition)
    if (pos) joint.position.addScaledVector(offset.set(pos[0], pos[1], pos[2]), 1 / rig.scale)
    if (followed) {
      joint.turned.premultiply(followed.turned)
      joint.position.sub(followed.restPosition).applyQuaternion(followed.turned).add(followed.position)
    }
    joint.quaternion.multiplyQuaternions(joint.turned, joint.restQuaternion)
  }
  // ...then express that relative to the bone each one is actually a child of.
  for (const { bone, parent, position, quaternion } of rig.joints) {
    if (parent) {
      inverse.copy(parent.quaternion).invert()
      bone.quaternion.multiplyQuaternions(inverse, quaternion)
      bone.position.copy(position).sub(parent.position).applyQuaternion(inverse)
    } else {
      bone.quaternion.copy(quaternion)
      bone.position.copy(position)
    }
  }
}

/** Puts every bone back into its rest transform. */
export function applyRest(rig: Rig): void {
  for (const { bone, restLocalPosition, restLocalQuaternion } of rig.joints) {
    bone.position.copy(restLocalPosition)
    bone.quaternion.copy(restLocalQuaternion)
  }
}

/**
 * Turns one bone by `rotation`, given in the character's axes as carried by
 * the bone's parent, on top of the pose the bone is already in.
 */
export function turnBone(rig: Rig, name: BoneName, rotation: Quaternion): void {
  const { bone, parent } = rig.byName[name]
  if (!parent) {
    bone.quaternion.premultiply(rotation)
    return
  }
  inverse.copy(parent.restQuaternion).invert()
  bone.quaternion.premultiply(parent.restQuaternion).premultiply(rotation).premultiply(inverse)
}

/** Opens (1) or closes (towards 0) the eyes by squashing them vertically about their centre. */
export function setEyeOpenness(rig: Rig, openness: number): void {
  const { x, y, z } = rig.eyesCenter
  squash.makeTranslation(x, y, z).scale(offset.set(1, openness, 1))
  rig.eyes.bindMatrix.copy(rig.eyesBind).multiply(squash).multiply(shift.makeTranslation(-x, -y, -z))
}

/**
 * A rig for the loaded model, scaled to `CHARACTER_HEIGHT`. It works on its
 * own copy of `scene`: posing changes the bones, and a rig has to be built
 * from bones that are still in their rest pose, which a shared, cached scene
 * would no longer be after a remount.
 */
export function createRig(scene: Object3D, clips: AnimationClip[]): Rig {
  return buildRig(cloneSkinned(scene), clips, CHARACTER_HEIGHT)
}
