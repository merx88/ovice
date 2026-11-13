import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Group } from 'three'
import { matte } from '../scene/materials'
import { useSettings } from '../store/settings'
import { MAX_STEP } from './playback'
import { colorFor, LEAN, symbolFor, symbolGeometry, symbolPose, type BadgeStatus } from './statusSymbols'

export interface StatusBadgeProps {
  status: BadgeStatus
}

/**
 * The status symbol that floats above the character's head. It always faces
 * the camera, turned a little to one side so that its depth shows; it sways
 * and drifts gently and swells for a moment when the status changes. With
 * reduced motion it stands still. A status without a symbol draws nothing.
 */
export function StatusBadge({ status }: StatusBadgeProps) {
  const reduceMotion = useSettings((state) => state.reduceMotion)
  const facing = useRef<Group>(null)
  const moving = useRef<Group>(null)
  /** How long the symbol has been there, and how long ago the status it shows last changed (s). */
  const motion = useRef({ time: 0, sinceChange: Infinity, shown: status })

  useFrame(({ camera }, frameDelta) => {
    const state = motion.current
    const delta = Math.min(frameDelta, MAX_STEP)
    state.time += delta
    if (state.shown === status) state.sinceChange += delta
    else {
      state.shown = status
      state.sinceChange = 0
    }
    if (!facing.current || !moving.current) return

    const { turn, lift, scale } = symbolPose(state.time, state.sinceChange, reduceMotion)
    facing.current.quaternion.copy(camera.quaternion)
    moving.current.rotation.set(LEAN, turn, 0)
    moving.current.position.y = lift
    moving.current.scale.setScalar(scale)
  })

  const symbol = symbolFor(status)
  const color = colorFor(status)
  if (symbol === null || color === null) return null
  return (
    <group ref={facing}>
      <group ref={moving}>
        <mesh geometry={symbolGeometry(symbol)} material={matte(color)} />
      </group>
    </group>
  )
}
