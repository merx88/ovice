import { MeshReflectorMaterial } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { memo, Suspense, useLayoutEffect, useRef } from 'react'
import { Color, type Group } from 'three'
import { Character } from '../character/Character'
import { ClipReview } from '../character/ClipReview'
import { parseClipReview } from '../character/clipReview'
import { CUP_REST, heldCup } from '../character/heldCup'
import { useCharacterDriver } from '../character/useCharacterDriver'
import { tokens } from '../theme/tokens'
import { SpeechBubble } from '../ui/SpeechBubble'
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

/**
 * The coffee cup: in its place on the desk, or wherever the character's hand
 * has taken it. It looks every frame, after the character has posed (which
 * the character does ahead of this, see `POSE_PRIORITY`), so cup and hand
 * never part.
 */
function DeskCup() {
  const cup = useRef<Group>(null)
  const place = () => {
    if (!cup.current) return
    cup.current.matrix.copy(heldCup.held ? heldCup.matrix : CUP_REST)
    cup.current.matrixWorldNeedsUpdate = true
  }
  // In its place from the start, whenever the first frame comes.
  useLayoutEffect(place, [])
  useFrame(place)
  return (
    <group ref={cup} matrixAutoUpdate={false}>
      <CoffeeCup />
    </group>
  )
}

/** The character, moved and animated by its driver. Suspends until its model has loaded. */
function Resident() {
  return <Character {...useCharacterDriver()} />
}

/**
 * A review aid, in development only: `?clip=<name>` plays chosen clips on a
 * character that nothing drives (see `character/clipReview.ts`). Not part of
 * the product.
 */
const clipReview = import.meta.env.DEV ? parseClipReview(window.location.search) : null

/**
 * The whole office: room, lights, camera, every piece of furniture and the character.
 *
 * Rendered by React once. It takes no props, and `memo` keeps a render of
 * whatever holds it (the canvas, which renders again for every new size of
 * the window) from going through it: some of its parts make new render
 * targets and draw into them again whenever they are rendered, among them the
 * floor's reflection and the contact shadows. What moves in it moves in frame
 * callbacks, and what changes in it renders on its own (the character, its
 * speech bubble).
 */
export const OfficeScene = memo(function OfficeScene() {
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
      <DeskCup />
      <Laptop position={[...LAPTOP_POS]} />
      <Suspense fallback={null}>{clipReview ? <ClipReview request={clipReview} /> : <Resident />}</Suspense>
      <SpeechBubble />
    </>
  )
})
