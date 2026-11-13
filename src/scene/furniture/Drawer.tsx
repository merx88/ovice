import { RoundedBox } from '@react-three/drei'
import type { GroupProps } from '@react-three/fiber'
import { SphereGeometry } from 'three'
import { tokens } from '../../theme/tokens'
import { roundedCylinder } from '../geometry'
import { DRAWER_SIZE } from '../layout'
import { glossy } from '../materials'

const { width: WIDTH, depth: DEPTH } = DRAWER_SIZE
const CORNER = 0.02

const WHEEL = { radius: 0.055, width: 0.045, insetX: 0.015, insetZ: 0.03 } as const
/** Lower shelf the castors are fixed to. */
const BASE = { bottomY: 0.1, height: 0.055 } as const
/** Corner posts between the lower shelf and the drawer box. */
const POST = { size: 0.04, height: 0.115 } as const
/** The box holding the two drawers. */
const BODY = { height: 0.2 } as const
const FRONT = { width: 0.4, height: 0.084, gap: 0.012, depth: 0.016 } as const
const KNOB_RADIUS = 0.016

const BASE_TOP_Y = BASE.bottomY + BASE.height
const BODY_BOTTOM_Y = BASE_TOP_Y + POST.height
const BODY_CENTER_Y = BODY_BOTTOM_Y + BODY.height / 2

const wheelGeometry = roundedCylinder(WHEEL.radius, WHEEL.radius, WHEEL.width, 0.014, 24)
wheelGeometry.translate(0, -WHEEL.width / 2, 0)
wheelGeometry.rotateZ(Math.PI / 2)
const knobGeometry = new SphereGeometry(KNOB_RADIUS, 16, 12)

const CORNERS = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
] as const
/** A little swivel per castor so they do not look stamped. */
const WHEEL_YAW = [0.5, -0.3, 0.25, -0.6] as const

/** Sky-blue two-drawer trolley on castors. Origin: centre of its footprint on the floor; faces +z. */
export function Drawer(props: GroupProps) {
  const blue = glossy(tokens.skyblue)
  const black = glossy(tokens.black)
  return (
    <group {...props}>
      <RoundedBox
        args={[WIDTH, BODY.height, DEPTH]}
        radius={CORNER}
        material={blue}
        position={[0, BODY_CENTER_Y, 0]}
        castShadow
        receiveShadow
      />
      {[1, -1].map((row) => (
        <RoundedBox
          key={row}
          args={[FRONT.width, FRONT.height, FRONT.depth]}
          radius={FRONT.depth / 2.5}
          material={blue}
          position={[0, BODY_CENTER_Y + (row * (FRONT.height + FRONT.gap)) / 2, DEPTH / 2]}
        />
      ))}
      <mesh
        geometry={knobGeometry}
        material={black}
        position={[0, BODY_CENTER_Y + (FRONT.height + FRONT.gap) / 2, DEPTH / 2 + FRONT.depth / 2 + KNOB_RADIUS * 0.4]}
      />
      <RoundedBox
        args={[WIDTH, BASE.height, DEPTH]}
        radius={CORNER}
        material={blue}
        position={[0, BASE.bottomY + BASE.height / 2, 0]}
        castShadow
        receiveShadow
      />
      {CORNERS.map(([sx, sz], index) => (
        <group key={index}>
          <RoundedBox
            args={[POST.size, POST.height + CORNER * 2, POST.size]}
            radius={0.008}
            material={blue}
            position={[sx * (WIDTH / 2 - POST.size / 2), BASE_TOP_Y + POST.height / 2, sz * (DEPTH / 2 - POST.size / 2)]}
            castShadow
          />
          <mesh
            geometry={wheelGeometry}
            material={black}
            position={[sx * (WIDTH / 2 - WHEEL.insetX), WHEEL.radius, sz * (DEPTH / 2 - WHEEL.insetZ)]}
            rotation={[0, WHEEL_YAW[index], 0]}
            castShadow
          />
        </group>
      ))}
    </group>
  )
}
