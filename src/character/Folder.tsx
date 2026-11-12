import { Html, RoundedBox } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, type CSSProperties } from 'react'
import { Vector3, type Group } from 'three'
import { glossy, matte } from '../scene/materials'
import { tokens } from '../theme/tokens'

export interface FolderProps {
  /** Called when the folder is clicked, in 3D or through its button. */
  onClick(): void
}

/** Overall size of the folder (m); it is seen from its front, +z. */
const WIDTH = 0.43
const HEIGHT = 0.3
const DEPTH = 0.04
const COVER_THICKNESS = 0.016
const CORNER = 0.007
/** The back cover carries a tab on the left that stands this much taller. */
const TAB = { width: WIDTH * 0.4, rise: 0.028 } as const
/** The front cover stops this far below the back cover, showing the paper. */
const FRONT_DROP = 0.03
/** The sheet of paper shows this much above the front cover. */
const PAPER = { inset: 0.018, show: 0.016, thickness: 0.006 } as const

/** The folder leans back a little, towards whoever looks at it from above. */
const TILT = -0.12
/**
 * The button stays where it is until the folder has drifted this far (m) from
 * under it. The folder bobs with the hands that hold it, and a button that
 * moved on every frame could never be clicked by tools that wait for their
 * target to hold still.
 */
const BUTTON_SLACK = 0.03

/**
 * drei renders a transformed <Html> at (distanceFactor / 400) metres per CSS
 * pixel; with a factor of 1 the button below is exactly as large as the folder.
 */
const HTML_DISTANCE_FACTOR = 1
const PIXELS_PER_METRE = 400 / HTML_DISTANCE_FACTOR

const buttonStyle: CSSProperties = {
  display: 'block',
  width: WIDTH * PIXELS_PER_METRE,
  height: (HEIGHT + TAB.rise) * PIXELS_PER_METRE,
  padding: 0,
  border: 'none',
  borderRadius: CORNER * PIXELS_PER_METRE * 2,
  background: 'transparent',
  cursor: 'pointer',
}

function setCursor(cursor: string) {
  document.body.style.cursor = cursor
}

/**
 * The result file: a blue folder with a tab and a sheet of paper showing at
 * its top edge. Origin: its centre; the front faces +z, leaning back a little.
 * Move it by the position of the group its ref points at. It can be clicked
 * in 3D, and a transparent button laid over it makes it reachable from the
 * keyboard.
 */
export const Folder = forwardRef<Group, FolderProps>(function Folder({ onClick }, ref) {
  const blue = glossy(tokens.folderBlue)
  const coverZ = (DEPTH - COVER_THICKNESS) / 2
  const group = useRef<Group>(null)
  const button = useRef<Group>(null)
  /** Where the button is held, in the space the folder is moved in. */
  const buttonAt = useMemo(() => new Vector3(Infinity, Infinity, Infinity), [])

  useImperativeHandle(ref, () => group.current as Group, [])
  useEffect(() => () => setCursor('auto'), [])

  useFrame(() => {
    if (!group.current || !button.current) return
    // Also true on the first frame, when the button has not been placed yet.
    const drifted = !(buttonAt.distanceTo(group.current.position) <= BUTTON_SLACK)
    if (drifted) buttonAt.copy(group.current.position)
    button.current.position.copy(buttonAt)
  })

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    onClick()
  }

  return (
    <>
      <group
        ref={group}
        rotation={[TILT, 0, 0]}
        onClick={handleClick}
        onPointerOver={() => setCursor('pointer')}
        onPointerOut={() => setCursor('auto')}
      >
        <RoundedBox args={[WIDTH, HEIGHT, COVER_THICKNESS]} radius={CORNER} material={blue} position={[0, 0, -coverZ]} castShadow />
        <RoundedBox
          args={[TAB.width, TAB.rise * 2, COVER_THICKNESS]}
          radius={CORNER}
          material={blue}
          position={[(TAB.width - WIDTH) / 2, HEIGHT / 2, -coverZ]}
          castShadow
        />
        <RoundedBox
          args={[WIDTH - PAPER.inset * 2, HEIGHT - PAPER.inset, PAPER.thickness]}
          radius={PAPER.thickness / 3}
          material={matte(tokens.white)}
          position={[0, PAPER.show - FRONT_DROP + PAPER.inset / 2, 0]}
        />
        <RoundedBox
          args={[WIDTH, HEIGHT - FRONT_DROP, COVER_THICKNESS]}
          radius={CORNER}
          material={blue}
          position={[0, -FRONT_DROP / 2, coverZ]}
          castShadow
        />
      </group>
      <group ref={button}>
        <Html
          transform
          distanceFactor={HTML_DISTANCE_FACTOR}
          // Level with the canvas, so that any interface drawn over the scene is also over this button.
          zIndexRange={[0, 0]}
          position={[0, TAB.rise / 2, DEPTH / 2]}
          rotation={[TILT, 0, 0]}
        >
          <button
            type="button"
            data-testid="folder-hit"
            aria-label="결과 파일 열기"
            style={buttonStyle}
            onClick={(event) => {
              // The canvas listens on an ancestor of this button; without this the 3D folder would be clicked as well.
              event.stopPropagation()
              onClick()
            }}
          />
        </Html>
      </group>
    </>
  )
})
