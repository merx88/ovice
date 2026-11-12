import { MeshReflectorMaterial } from '@react-three/drei'
import { Color } from 'three'
import { tokens } from '../theme/tokens'
import { CameraRig } from './CameraRig'
import { gradientStrip } from './geometry'
import { Bookshelf } from './furniture/Bookshelf'
import { Chair } from './furniture/Chair'
import { Desk } from './furniture/Desk'
import { Drawer } from './furniture/Drawer'
import { CoffeeCup, Lamp, Laptop } from './furniture/Props'
import { SideTable } from './furniture/SideTable'
import { Sofa } from './furniture/Sofa'
import {
  BOOKSHELF_POS,
  BOOKSHELF_YAW,
  CHAIR_POS,
  CUP_POS,
  DESK_POS,
  DRAWER_POS,
  LAMP_POS,
  LAPTOP_POS,
  SEAT_FACING,
  SIDE_TABLE_POS,
  SOFA_POS,
  SOFA_YAW,
  WALL_Z,
} from './layout'
import { Lighting } from './Lighting'

/** The floor and wall are far wider than any viewport shows. */
const ROOM = { width: 80, wallHeight: 30, floorDepth: 40 } as const
/** The wall shades towards the floor up to this height, as if lit from above. */
const WALL_SHADE_HEIGHT = 1.6
/** Depth of floor over which the floor blends into the wall, softening the seam. */
const SEAM_BLEND_DEPTH = 0.45
/** Gap that keeps overlays (seam blend, wall shadow) from z-fighting the surface under them. */
const OVERLAY_GAP = 0.002
/** How dark the furniture's shadows fall on the wall. */
const WALL_SHADOW_OPACITY = 0.1
/** A satin floor with a faint, fully blurred mirror image of the furniture. */
const FLOOR_FINISH = { roughness: 0.6, mirror: 0.1, mixStrength: 0.1, mixBlur: 2, blur: [500, 220], resolution: 512 } as const

const wallColor = new Color(tokens.bg)
const wallFootColor = new Color(tokens.bg).lerp(new Color(tokens.floor), 0.6)
const wallGeometry = gradientStrip(ROOM.width, [
  { y: 0, color: wallFootColor },
  { y: WALL_SHADE_HEIGHT, color: wallColor },
  { y: ROOM.wallHeight, color: wallColor },
])
const seamGeometry = gradientStrip(ROOM.width, [
  { y: 0, color: wallFootColor, opacity: 1 },
  { y: SEAM_BLEND_DEPTH, color: wallFootColor, opacity: 0 },
])

/** Pale, faintly reflective floor meeting a wall in the page's background color. */
function Room() {
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, WALL_Z + ROOM.floorDepth / 2]} receiveShadow>
        <planeGeometry args={[ROOM.width, ROOM.floorDepth]} />
        <MeshReflectorMaterial
          color={tokens.floor}
          roughness={FLOOR_FINISH.roughness}
          metalness={0}
          mirror={FLOOR_FINISH.mirror}
          mixStrength={FLOOR_FINISH.mixStrength}
          mixBlur={FLOOR_FINISH.mixBlur}
          blur={[...FLOOR_FINISH.blur]}
          resolution={FLOOR_FINISH.resolution}
        />
      </mesh>
      <mesh geometry={seamGeometry} rotation={[Math.PI / 2, 0, 0]} position={[0, OVERLAY_GAP, WALL_Z]}>
        <meshBasicMaterial vertexColors transparent depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh geometry={wallGeometry} position={[0, 0, WALL_Z]}>
        <meshBasicMaterial vertexColors toneMapped={false} />
      </mesh>
      <mesh position={[0, ROOM.wallHeight / 2, WALL_Z + OVERLAY_GAP]} receiveShadow>
        <planeGeometry args={[ROOM.width, ROOM.wallHeight]} />
        <shadowMaterial transparent opacity={WALL_SHADOW_OPACITY} />
      </mesh>
    </>
  )
}

/** The whole office: room, lights, camera and every piece of furniture. */
export function OfficeScene() {
  return (
    <>
      <CameraRig />
      <Lighting />
      <Room />
      <Bookshelf position={[...BOOKSHELF_POS]} rotation={[0, BOOKSHELF_YAW, 0]} />
      <Desk position={[...DESK_POS]} />
      <Drawer position={[...DRAWER_POS]} />
      <Chair position={[...CHAIR_POS]} rotation={[0, SEAT_FACING, 0]} />
      <Sofa position={[...SOFA_POS]} rotation={[0, SOFA_YAW, 0]} />
      <SideTable position={[...SIDE_TABLE_POS]} />
      <Lamp position={[...LAMP_POS]} />
      <CoffeeCup position={[...CUP_POS]} />
      <Laptop position={[...LAPTOP_POS]} />
    </>
  )
}
