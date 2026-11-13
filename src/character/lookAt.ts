// Pure maths of the look-at layer: where the look target is relative to the
// character, and how the turn towards it is shared between head and body.
import type { Vec3 } from '../scene/layout'
import { BODY_MAX_YAW, HEAD_MAX_PITCH, HEAD_MAX_YAW } from './constants'

function clamp(value: number, limit: number): number {
  return Math.min(limit, Math.max(-limit, value))
}

/**
 * Splits a turn of `targetYaw` (radians, relative to the way the character
 * faces) between head and body: the head turns up to its limit and the body
 * takes up the rest, up to its own limit.
 */
export function computeLookYaw(targetYaw: number): { head: number; body: number } {
  const head = clamp(targetYaw, HEAD_MAX_YAW)
  const body = clamp(targetYaw - head, BODY_MAX_YAW)
  return { head, body }
}

/** How far the head tilts for a target `targetPitch` radians above (+) or below (-) eye level. */
export function computeLookPitch(targetPitch: number): number {
  return clamp(targetPitch, HEAD_MAX_PITCH)
}

/**
 * Direction from `eye` to `target` (both world space) for a character whose
 * yaw is `facing`: `yaw` is measured from the facing direction, positive
 * towards the character's left (+x when facing +z), within -π..π; `pitch` is
 * positive upwards.
 */
export function lookAngles(eye: Vec3, facing: number, target: Vec3): { yaw: number; pitch: number } {
  const dx = target[0] - eye[0]
  const dy = target[1] - eye[1]
  const dz = target[2] - eye[2]
  const turn = Math.atan2(dx, dz) - facing
  const yaw = Math.atan2(Math.sin(turn), Math.cos(turn))
  const pitch = Math.atan2(dy, Math.hypot(dx, dz))
  return { yaw, pitch }
}

/**
 * How far in front of the character (m) to stand the upright plane that the
 * pointer is projected onto, so that a pointer at the left or right edge of
 * the view is `edgeYaw` to the character's side. `cameraDistance` is how far
 * in front of the character the camera is, and `viewHalfWidth` half the width
 * of the view one metre from the camera.
 */
export function lookPlaneDistance(cameraDistance: number, viewHalfWidth: number, edgeYaw: number): number {
  // Half the view's width at the plane, (cameraDistance - d) * viewHalfWidth, has to be d * tan(edgeYaw) for the plane's distance d.
  return (cameraDistance * viewHalfWidth) / (Math.tan(edgeYaw) + viewHalfWidth)
}

/** Moves `current` towards `goal`, covering a fraction of the gap that depends on `rate` (1/s) and the time step. */
export function damp(current: number, goal: number, rate: number, deltaSeconds: number): number {
  return current + (goal - current) * (1 - Math.exp(-rate * deltaSeconds))
}
