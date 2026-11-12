import type { GroupProps } from '@react-three/fiber'
import { Shape } from 'three'
import { tokens } from '../../theme/tokens'
import { extrudeRounded } from '../geometry'
import { DESK_SIZE } from '../layout'
import { glossy } from '../materials'

const { width: WIDTH, depth: DEPTH, height: HEIGHT, thickness: THICKNESS } = DESK_SIZE
/** The legs are a little thicker than the top. */
const LEG_THICKNESS = 0.12
/** Outer radius of the bend where the top turns down into a leg. */
const BEND_RADIUS = 0.17
/** Radius of the same bend on the underside. */
const INNER_BEND_RADIUS = 0.07
/** Rounding of the feet where the legs meet the floor. */
const FOOT_RADIUS = 0.03
/** Rounding of the slab's front and back edges. */
const EDGE_RADIUS = 0.04

/** Front profile of the desk: one slab bent down at both ends. */
function deskProfile(): Shape {
  const x = WIDTH / 2
  const inner = INNER_BEND_RADIUS
  const leg = LEG_THICKNESS
  const foot = FOOT_RADIUS
  const shape = new Shape()
  shape.moveTo(-x, foot)
  shape.lineTo(-x, HEIGHT - BEND_RADIUS)
  shape.absarc(-x + BEND_RADIUS, HEIGHT - BEND_RADIUS, BEND_RADIUS, Math.PI, Math.PI / 2, true)
  shape.lineTo(x - BEND_RADIUS, HEIGHT)
  shape.absarc(x - BEND_RADIUS, HEIGHT - BEND_RADIUS, BEND_RADIUS, Math.PI / 2, 0, true)
  shape.lineTo(x, foot)
  shape.absarc(x - foot, foot, foot, 0, -Math.PI / 2, true)
  shape.lineTo(x - leg + foot, 0)
  shape.absarc(x - leg + foot, foot, foot, -Math.PI / 2, -Math.PI, true)
  shape.lineTo(x - leg, HEIGHT - THICKNESS - inner)
  shape.absarc(x - leg - inner, HEIGHT - THICKNESS - inner, inner, 0, Math.PI / 2, false)
  shape.lineTo(-x + leg + inner, HEIGHT - THICKNESS)
  shape.absarc(-x + leg + inner, HEIGHT - THICKNESS - inner, inner, Math.PI / 2, Math.PI, false)
  shape.lineTo(-x + leg, foot)
  shape.absarc(-x + leg - foot, foot, foot, 0, -Math.PI / 2, true)
  shape.lineTo(-x + foot, 0)
  shape.absarc(-x + foot, foot, foot, -Math.PI / 2, -Math.PI, true)
  return shape
}

const deskGeometry = extrudeRounded(deskProfile(), DEPTH, EDGE_RADIUS)

/** Cream waterfall desk. Origin: centre of its footprint on the floor. */
export function Desk(props: GroupProps) {
  return (
    <group {...props}>
      <mesh geometry={deskGeometry} material={glossy(tokens.cream)} castShadow receiveShadow />
    </group>
  )
}
