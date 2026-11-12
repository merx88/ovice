import type { GroupProps } from '@react-three/fiber'
import { Shape } from 'three'
import { tokens } from '../../theme/tokens'
import { extrudeRounded } from '../geometry'
import { glossy } from '../materials'

const WIDTH = 0.46
const HEIGHT = 0.47
const DEPTH = 0.3
/** Thickness of the band the table is bent from. */
const BAND = 0.062
/** Outer radius of the two bends. */
const BEND_RADIUS = 0.09
const EDGE_RADIUS = 0.02

/** Front profile: a band bent into a C that opens to the left (-x), with rounded ends. */
function tableProfile(): Shape {
  const x = WIDTH / 2
  const inner = BEND_RADIUS - BAND
  const end = BAND / 2
  const shape = new Shape()
  shape.moveTo(-x + end, 0)
  shape.lineTo(x - BEND_RADIUS, 0)
  shape.absarc(x - BEND_RADIUS, BEND_RADIUS, BEND_RADIUS, -Math.PI / 2, 0, false)
  shape.lineTo(x, HEIGHT - BEND_RADIUS)
  shape.absarc(x - BEND_RADIUS, HEIGHT - BEND_RADIUS, BEND_RADIUS, 0, Math.PI / 2, false)
  shape.lineTo(-x + end, HEIGHT)
  shape.absarc(-x + end, HEIGHT - end, end, Math.PI / 2, Math.PI * 1.5, false)
  shape.lineTo(x - BAND - inner, HEIGHT - BAND)
  shape.absarc(x - BAND - inner, HEIGHT - BAND - inner, inner, Math.PI / 2, 0, true)
  shape.lineTo(x - BAND, BAND + inner)
  shape.absarc(x - BAND - inner, BAND + inner, inner, 0, -Math.PI / 2, true)
  shape.lineTo(-x + end, BAND)
  shape.absarc(-x + end, end, end, Math.PI / 2, Math.PI * 1.5, false)
  return shape
}

const tableGeometry = extrudeRounded(tableProfile(), DEPTH, EDGE_RADIUS)

/** Glossy black C-shaped side table. Origin: centre of its footprint on the floor. */
export function SideTable(props: GroupProps) {
  return (
    <group {...props}>
      <mesh geometry={tableGeometry} material={glossy(tokens.black)} castShadow receiveShadow />
    </group>
  )
}
