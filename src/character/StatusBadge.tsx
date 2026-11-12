import { useFrame } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { SphereGeometry, type Group } from 'three'
import { flatRing } from '../scene/geometry'
import { glossy } from '../scene/materials'
import { tokens } from '../theme/tokens'
import { damp } from './lookAt'

export type BadgeStatus = 'idle' | 'working' | 'done' | 'error'

export interface StatusBadgeProps {
  status: BadgeStatus
}

const COLORS: Record<BadgeStatus, string> = {
  idle: tokens.orange,
  working: tokens.badgeYellow,
  done: tokens.mint,
  error: tokens.danger,
}

/** A bullseye like the logo's: two rings around a dot, 24 cm across. */
const RING = { thickness: 0.036, edge: 0.014 } as const
const outerRingGeometry = flatRing(0.082, 0.118, RING.thickness, RING.edge)
const innerRingGeometry = flatRing(0.047, 0.064, RING.thickness * 0.8, RING.edge * 0.6)
const dotGeometry = new SphereGeometry(0.03, 24, 16)

const TAU = Math.PI * 2
/** Idle: the badge drifts up and down by this much (m), once per period (s). */
const FLOAT = { height: 0.012, period: 3 } as const
/** Working: seconds per turn about the vertical axis, and the size and period of the pulse. */
const SPIN = { period: 1.6, pulse: 0.06, pulsePeriod: 0.8 } as const
/** Done: the badge swells by this much and settles, over this long (s). */
const POP = { swell: 0.35, duration: 0.5 } as const
/** How quickly the badge comes to rest when its motion stops (1/s). */
const SETTLE_RATE = 10

/**
 * The status icon that floats above the character's head and always faces
 * the camera. It spins and pulses while working, drifts while idle, pops once
 * when done and rests on an error.
 */
export function StatusBadge({ status }: StatusBadgeProps) {
  const facing = useRef<Group>(null)
  const moving = useRef<Group>(null)
  const motion = useRef({ spin: 0, lift: 0, scale: 1, sinceChange: 0 })

  useEffect(() => {
    motion.current.sinceChange = 0
  }, [status])

  useFrame(({ camera, clock }, delta) => {
    if (!facing.current || !moving.current) return
    const state = motion.current
    const time = clock.elapsedTime
    state.sinceChange += delta

    let lift = 0
    let scale = 1
    if (status === 'working') {
      state.spin += (delta * TAU) / SPIN.period
      scale = 1 + SPIN.pulse * Math.sin((time * TAU) / SPIN.pulsePeriod)
    } else {
      // The bullseye looks the same from both sides, so the nearest half turn is home.
      const home = Math.round(state.spin / Math.PI) * Math.PI
      state.spin = damp(state.spin, home, SETTLE_RATE, delta)
    }
    if (status === 'idle') lift = FLOAT.height * Math.sin((time * TAU) / FLOAT.period)
    if (status === 'done') {
      const progress = Math.min(state.sinceChange / POP.duration, 1)
      scale = 1 + POP.swell * Math.sin(progress * Math.PI) * (1 - progress)
    }
    state.lift = damp(state.lift, lift, SETTLE_RATE, delta)
    state.scale = status === 'done' ? scale : damp(state.scale, scale, SETTLE_RATE, delta)

    facing.current.quaternion.copy(camera.quaternion)
    moving.current.rotation.y = state.spin
    moving.current.position.y = state.lift
    moving.current.scale.setScalar(state.scale)
  })

  const material = glossy(COLORS[status])
  return (
    <group ref={facing}>
      <group ref={moving}>
        <mesh geometry={outerRingGeometry} material={material} castShadow />
        <mesh geometry={innerRingGeometry} material={material} castShadow />
        <mesh geometry={dotGeometry} material={material} castShadow />
      </group>
    </group>
  )
}
