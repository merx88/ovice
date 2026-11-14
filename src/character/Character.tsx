import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  AnimationMixer,
  Color,
  Euler,
  LoopOnce,
  LoopRepeat,
  Matrix4,
  Quaternion,
  Vector3,
  type AnimationAction,
  type Group,
  type Mesh,
} from 'three'
import type { Vec3 } from '../scene/layout'
import { useSettings } from '../store/settings'
import { tokens } from '../theme/tokens'
import { carryOver, rootReach } from './carryOver'
import { CLIPS, resolveClip, type ClipName } from './clips'
import { LOUNGE_CLIPS } from './clips/lounge'
import { SIP_GRIP } from './clips/sip'
import { Folder } from './Folder'
import { carryCup } from './heldCup'
import { computeLookPitch, computeLookYaw, damp, lookAngles } from './lookAt'
import { advancePlayback, createPlayback, MAX_STEP } from './playback'
import { applyPose, applyRest, createRig, MODEL_URL, setEyeOpenness, turnBone, type Rig } from './rig'
import { StatusBadge } from './StatusBadge'
import { BADGE_ABOVE_HEAD, raiseFor, type BadgeStatus } from './statusSymbols'

/** Where the character is and which way it faces. */
export interface CharacterPlacement {
  /**
   * The point on the ground under the character: between its feet when it
   * stands, under its hips when it sits. A y above 0 lifts the character off
   * the floor; its shadow stays on the floor.
   */
  position: [number, number, number]
  /** Yaw in radians about +y; 0 faces +z. */
  facing: number
}

export interface CharacterProps {
  /** The animation to play. Changing it cross-fades from whatever pose the body is in. */
  clip: ClipName
  /** How fast the clip plays, 1 (the default) being the pace it was written at. */
  clipSpeed?: number
  /**
   * Read every frame: whoever moves the character keeps one object and
   * changes its numbers in place, without rendering.
   */
  placement: CharacterPlacement
  /** A point in world space to look at, or null to look straight ahead. Read every frame, like `placement`. */
  lookTarget: Vec3 | null
  /** The status icon above the head. */
  badge: BadgeStatus
  /** Shows the result folder between the hands. */
  holdingFile: boolean
  /** Called once each time a clip of finite length has played to its end, with the name of that clip. */
  onClipFinished(clip: ClipName): void
  onFolderClick(): void
}

/**
 * The character poses after whoever drives it (frame priority -1) and before
 * everything that goes by where its body is in the same frame, such as the
 * cup in its hand (priority 0). Not above 0: that would take over rendering.
 */
export const POSE_PRIORITY = -0.5
/** How quickly head and body turn towards the look target (1/s). */
const LOOK_RATE = 8
/** How quickly the badge glides to the height its status floats at (1/s); with reduced motion it is there at once. */
const BADGE_RAISE_RATE = 5
/** The eyes close for this long (s), at random intervals within this range (s). */
const BLINK = { duration: 0.16, minGap: 2, maxGap: 6, closed: 0.08 } as const
/** The palm, as a distance (model units) from the hand bone along the hand. */
const PALM_ALONG_HAND = 0.07
/** Where the folder sits relative to the point midway between the palms (m, character space). */
const FOLDER_OFFSET = new Vector3(0, 0.03, 0.06)
/**
 * The folder shows once a change of clip has blended in this far (0..1). Until
 * then the hands are still on their way to where they hold it, and the folder
 * between them would be inside the body.
 */
const FOLDER_SHOWS_FROM = 0.7
/** The soft shadow on the floor (y = 0) under the character; `lift` keeps it from flickering against the floor. */
const GROUND_SHADOW = { diameter: 1.05, opacity: 0.34, lift: 0.006 } as const

const shadowUniforms = { uColor: { value: new Color(tokens.black) }, uOpacity: { value: GROUND_SHADOW.opacity } }
const shadowVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const shadowFragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    float fade = smoothstep(1.0, 0.0, distance(vUv, vec2(0.5)) * 2.0);
    gl_FragColor = vec4(uColor, fade * fade * uOpacity);
  }
`

interface BoneTransform {
  position: Vector3
  quaternion: Quaternion
}

function boneTransforms(rig: Rig): BoneTransform[] {
  return rig.joints.map(({ bone }) => ({ position: bone.position.clone(), quaternion: bone.quaternion.clone() }))
}

function readBones(rig: Rig, into: BoneTransform[]) {
  rig.joints.forEach(({ bone }, index) => {
    into[index].position.copy(bone.position)
    into[index].quaternion.copy(bone.quaternion)
  })
}

function copyTransforms(from: BoneTransform[], into: BoneTransform[]) {
  from.forEach((transform, index) => {
    into[index].position.copy(transform.position)
    into[index].quaternion.copy(transform.quaternion)
  })
}

function writeBones(rig: Rig, from: BoneTransform[]) {
  rig.joints.forEach(({ bone }, index) => {
    bone.position.copy(from[index].position)
    bone.quaternion.copy(from[index].quaternion)
  })
}

const scratchQuaternion = new Quaternion()
const scratchEuler = new Euler()
const scratchVector = new Vector3()
const scratchMatrix = new Matrix4()
const palm = new Vector3()

/**
 * The office's resident: the rigged model, posed every frame by the current
 * clip, with a layer on top that turns head and body towards `lookTarget`,
 * blinking eyes, a status badge above the head, the result folder in its
 * hands and a soft shadow at its feet. Mount it at the scene's root: it
 * places itself in world space.
 */
export function Character(props: CharacterProps) {
  const { badge, holdingFile, onFolderClick } = props
  const gltf = useGLTF(MODEL_URL)
  const rig = useMemo(() => createRig(gltf.scene, gltf.animations), [gltf])
  const mixer = useMemo(() => new AnimationMixer(rig.model), [rig])

  const latest = useRef(props)
  latest.current = props

  const body = useRef<Group>(null)
  const badgeAnchor = useRef<Group>(null)
  const folder = useRef<Group>(null)
  const shadow = useRef<Mesh>(null)

  const animation = useMemo(
    () => ({
      playback: createPlayback(),
      /** The action playing a clip that came with the model. */
      action: null as AnimationAction | null,
      /** The pose the cross-fade started from. */
      fadeFrom: boneTransforms(rig),
      /** The pose shown last frame, before the look layer. */
      shown: boneTransforms(rig),
      /** What the mixer last wrote, so that it finds the bones as it left them. */
      mixed: boneTransforms(rig),
      look: { head: 0, body: 0, pitch: 0 },
      /** Where the character was placed in the last frame, and how far the pose shown then held the root away from there. */
      placed: null as { position: [number, number, number]; facing: number } | null,
      reach: 0,
      head: new Vector3(),
      /** How far above its usual place the badge floats, on its way to where its status has it (see `raiseFor`). */
      badgeRaise: 0,
      blink: { untilNext: BLINK.minGap as number, elapsed: BLINK.duration as number },
    }),
    [rig],
  )

  // Whatever happens to the character, the cup does not stay in a hand that is gone.
  useEffect(() => () => carryCup(false, rig.byName['arm_L.003'].bone.matrixWorld), [rig])

  useEffect(() => {
    // A clip that came with the model reports its own end.
    const onFinished = (event: { action: AnimationAction }) => {
      const { playback } = animation
      if (event.action !== animation.action || playback.finished || playback.name === null) return
      playback.finished = true
      latest.current.onClipFinished(playback.name)
    }
    mixer.addEventListener('finished', onFinished)
    return () => {
      mixer.removeEventListener('finished', onFinished)
      mixer.stopAllAction()
      mixer.uncacheRoot(rig.model)
    }
  }, [mixer, rig, animation])

  useFrame((_, delta) => {
    if (!body.current) return
    const { clip, clipSpeed = 1, placement, lookTarget, onClipFinished } = latest.current
    const { position, facing } = placement
    const step = Math.min(delta, MAX_STEP)
    const state = animation

    body.current.position.set(position[0], position[1], position[2])
    body.current.rotation.y = facing

    // --- The clip's own pose ----------------------------------------------
    const resolved = resolveClip(clip, rig.clips)
    const duration = resolved.kind === 'procedural' ? resolved.clip.duration : null
    const { started, justFinished, fadeWeight } = advancePlayback(state.playback, clip, step, duration, clipSpeed)
    if (started) {
      copyTransforms(state.shown, state.fadeFrom)
      // A hop is played from the sofa's seat spot with the root held out to where the body is, so the
      // placement jumps where a hop joins a walk or a run. The body must not: what the fade starts
      // from is carried over into the new placement. (Any other jump of the placement stays a jump.)
      //
      // This acts only when the clip starts and the placement jumps in one and the same frame, and
      // whoever places the character has to see to that. The clip reaches the character as a prop, a
      // render after it was asked for; the placement is one object rewritten in place, read here every
      // frame. So the placement may change in the first frame in which the new clip is the one that
      // has been rendered, and in no other: a frame early, the old pose is drawn in the new place and
      // nothing is carried over when the clip then starts (see `carryOver.ts`, and `useCharacterDriver`,
      // which places the character by the clip it has been shown).
      // A hop that comes with the model file is not carried over (its reach is taken as 0): such a
      // clip would have to be made for the stand spot.
      const was = state.placed
      const jumped = was !== null && (was.facing !== facing || was.position.some((value, axis) => value !== position[axis]))
      const reach = Math.max(state.reach, resolved.kind === 'procedural' ? rootReach(resolved.clip.sample(0)) : 0)
      if (was && jumped && reach > 0 && fadeWeight < 1) {
        const root = rig.byName['root 1'].bone
        const from = state.fadeFrom[rig.joints.findIndex((joint) => joint.bone === root)]
        if (root.parent) {
          root.parent.updateWorldMatrix(true, false)
          scratchMatrix.copy(body.current.matrixWorld).invert().multiply(root.parent.matrixWorld)
          carryOver(from.position, from.quaternion, scratchMatrix, was, placement)
        }
      }
      state.action?.stop()
      state.action = null
      if (resolved.kind === 'glb') {
        // Clips that play once procedurally play once from the model too.
        const once = CLIPS[clip].duration !== null
        applyRest(rig)
        readBones(rig, state.mixed)
        state.action = mixer.clipAction(resolved.clip)
        state.action.reset().setLoop(once ? LoopOnce : LoopRepeat, Infinity)
        state.action.clampWhenFinished = once
        state.action.play()
      }
    }
    if (resolved.kind === 'procedural') {
      const { time } = state.playback
      const pose = resolved.clip.sample(duration === null ? time : Math.min(time, duration))
      state.reach = rootReach(pose)
      applyPose(rig, pose)
    } else {
      state.reach = 0
      // The mixer only writes a bone when its value changes, so hand the bones back as it left them.
      writeBones(rig, state.mixed)
      mixer.update(started ? 0 : step * clipSpeed)
      readBones(rig, state.mixed)
    }

    // --- Cross-fade from the previous pose --------------------------------
    if (fadeWeight < 1) {
      rig.joints.forEach(({ bone }, index) => {
        const from = state.fadeFrom[index]
        scratchQuaternion.copy(bone.quaternion)
        bone.quaternion.copy(from.quaternion).slerp(scratchQuaternion, fadeWeight)
        scratchVector.copy(bone.position)
        bone.position.copy(from.position).lerp(scratchVector, fadeWeight)
      })
    }
    readBones(rig, state.shown)

    // --- Looking at the target --------------------------------------------
    let headYaw = 0
    let bodyYaw = 0
    let pitch = 0
    if (lookTarget) {
      rig.byName.head.bone.getWorldPosition(state.head)
      const angles = lookAngles([state.head.x, state.head.y, state.head.z], facing, lookTarget)
      // On the sofa the hands rest on the legs: the head alone turns.
      ;({ head: headYaw, body: bodyYaw } = computeLookYaw(angles.yaw, !LOUNGE_CLIPS.includes(clip)))
      pitch = computeLookPitch(angles.pitch)
    }
    state.look.head = damp(state.look.head, headYaw, LOOK_RATE, step)
    state.look.body = damp(state.look.body, bodyYaw, LOOK_RATE, step)
    state.look.pitch = damp(state.look.pitch, pitch, LOOK_RATE, step)
    turnBone(rig, 'body', scratchQuaternion.setFromEuler(scratchEuler.set(0, state.look.body, 0, 'XYZ')))
    // Tilt first, then turn; a positive pitch looks up, which is a negative rotation about x.
    turnBone(rig, 'head', scratchQuaternion.setFromEuler(scratchEuler.set(-state.look.pitch, state.look.head, 0, 'YXZ')))

    // --- Blinking -----------------------------------------------------------
    const { blink } = state
    blink.untilNext -= step
    if (blink.untilNext <= 0) {
      blink.elapsed = 0
      blink.untilNext = BLINK.minGap + Math.random() * (BLINK.maxGap - BLINK.minGap)
    }
    const closing = blink.elapsed < BLINK.duration ? Math.sin((blink.elapsed / BLINK.duration) * Math.PI) : 0
    blink.elapsed += step
    setEyeOpenness(rig, 1 - (1 - BLINK.closed) * closing)

    // --- The cup in the hand ------------------------------------------------
    // Only the clip written here says when the hand has the cup; a sip that came with the model leaves it standing.
    const { time } = state.playback
    const holdsCup = clip === 'sip' && resolved.kind === 'procedural' && time >= SIP_GRIP.from && time < SIP_GRIP.to
    const cupHand = rig.byName['arm_L.003'].bone
    if (holdsCup) cupHand.updateWorldMatrix(true, false)
    carryCup(holdsCup, cupHand.matrixWorld)

    // --- The things that follow the body ------------------------------------
    rig.byName.head.bone.getWorldPosition(state.head)
    const raise = raiseFor(latest.current.badge)
    state.badgeRaise = useSettings.getState().reduceMotion ? raise : damp(state.badgeRaise, raise, BADGE_RAISE_RATE, step)
    badgeAnchor.current?.position.copy(state.head).setY(state.head.y + BADGE_ABOVE_HEAD + state.badgeRaise)
    shadow.current?.position.set(position[0], GROUND_SHADOW.lift, position[2])
    if (folder.current) {
      folder.current.visible = fadeWeight >= FOLDER_SHOWS_FROM
      scratchVector.set(0, 0, 0)
      for (const hand of [rig.byName['arm_L.003'].bone, rig.byName['arm_R.003'].bone]) {
        hand.updateWorldMatrix(true, false)
        scratchVector.addScaledVector(hand.localToWorld(palm.set(0, PALM_ALONG_HAND, 0)), 0.5)
      }
      folder.current.position.copy(body.current.worldToLocal(scratchVector)).add(FOLDER_OFFSET)
    }

    if (state.placed) {
      state.placed.position[0] = position[0]
      state.placed.position[1] = position[1]
      state.placed.position[2] = position[2]
      state.placed.facing = facing
    } else state.placed = { position: [position[0], position[1], position[2]], facing }

    if (justFinished) onClipFinished(clip)
  }, POSE_PRIORITY)

  return (
    <>
      <group ref={body}>
        <group scale={rig.scale}>
          <primitive object={rig.model} />
        </group>
        {holdingFile && <Folder ref={folder} onClick={onFolderClick} />}
      </group>
      <group ref={badgeAnchor}>
        <StatusBadge status={badge} />
      </group>
      <mesh ref={shadow} rotation={[-Math.PI / 2, 0, 0]} scale={GROUND_SHADOW.diameter}>
        <planeGeometry />
        <shaderMaterial
          uniforms={shadowUniforms}
          vertexShader={shadowVertexShader}
          fragmentShader={shadowFragmentShader}
          transparent
          depthWrite={false}
        />
      </mesh>
    </>
  )
}

useGLTF.preload(MODEL_URL)
