import { MeshReflectorMaterial } from '@react-three/drei'
import { Suspense } from 'react'
import { Color } from 'three'
import { Character, type CharacterProps } from '../character/Character'
import { CLIP_NAMES } from '../character/clips'
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
  HANDOFF_POS,
  LAMP_POS,
  LAPTOP_POS,
  SEAT_FACING,
  SEAT_GROUND_POS,
  SIDE_TABLE_POS,
  SOFA_POS,
  SOFA_YAW,
  WALL_Z,
} from './layout'
import { Lighting } from './Lighting'

/** The floor and wall are far wider than any viewport shows. */
const ROOM = { width: 80, wallHeight: 30, floorDepth: 40 } as const
/**
 * The wall shades from the page background down to the floor's own color over
 * this height, as if lit from above. Meeting the floor in its color is what
 * keeps the wall/floor seam soft: there is no line to see where no shadow falls.
 */
const WALL_SHADE_HEIGHT = 1.6
/** Gap that keeps the wall's shadow layer from z-fighting the wall. */
const OVERLAY_GAP = 0.002
/** How dark the furniture's shadows fall on the wall; close to how dark they fall on the floor, so they meet at the seam. */
const WALL_SHADOW_OPACITY = 0.15
/**
 * A matte floor with a faint, fully blurred mirror image of the furniture.
 * `mirror` takes a little more of the floor's own color away than
 * `mixStrength` gives back from the bright room, which trims an open patch of
 * floor down to `tokens.floor` under this lighting.
 */
const FLOOR_FINISH = {
  roughness: 1,
  mirror: 0.13,
  mixStrength: 0.1,
  mixBlur: 1,
  blur: [500, 220],
  resolution: 512,
} as const

const wallColor = new Color(tokens.bg)
const wallFootColor = new Color(tokens.floor)
const wallGeometry = gradientStrip(ROOM.width, [
  { y: 0, color: wallFootColor },
  { y: WALL_SHADE_HEIGHT, color: wallColor },
  { y: ROOM.wallHeight, color: wallColor },
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

// --- TEMPORARY: stand-in for the character driver ---------------------------
// Shows the character seated and idle until the driver takes over. In
// development only, the URL can pose it for review: `?clip=<name>`,
// `?badge=idle|working|done|error`, `?pose=handoff` (standing in front of the
// desk with the folder) and `?look=x,y,z` (a point to look at).
const BADGES: readonly CharacterProps['badge'][] = ['idle', 'working', 'done', 'error']
const noop = () => {}

function previewCharacter(): CharacterProps {
  const seated: CharacterProps = {
    clip: 'idle',
    position: SEAT_GROUND_POS,
    facing: SEAT_FACING,
    lookTarget: null,
    badge: 'idle',
    holdingFile: false,
    onClipFinished: noop,
    onFolderClick: noop,
  }
  if (!import.meta.env.DEV) return seated
  const query = new URLSearchParams(window.location.search)
  const handoff: Partial<CharacterProps> =
    query.get('pose') === 'handoff' ? { clip: 'holdFile', position: HANDOFF_POS, facing: 0, badge: 'done', holdingFile: true } : {}
  const clip = CLIP_NAMES.find((name) => name === query.get('clip'))
  const badge = BADGES.find((status) => status === query.get('badge'))
  const look = (query.get('look') ?? '').split(',').map(Number)
  const lookTarget = look.length === 3 && look.every(Number.isFinite) ? ([look[0], look[1], look[2]] as const) : null
  return { ...seated, ...handoff, ...(clip && { clip }), ...(badge && { badge }), lookTarget }
}

const preview = previewCharacter()
// --- end of temporary block --------------------------------------------------

/** The whole office: room, lights, camera, every piece of furniture and the character. */
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
      <Suspense fallback={null}>
        <Character {...preview} />
      </Suspense>
    </>
  )
}
