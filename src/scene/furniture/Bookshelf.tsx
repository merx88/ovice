import type { GroupProps } from '@react-three/fiber'
import type { ReactNode } from 'react'
import { tokens } from '../../theme/tokens'
import { extrudeRounded, roundedFrameShape, roundedRectShape } from '../geometry'
import { BOOKSHELF_SIZE } from '../layout'
import { chrome, glossy, matte } from '../materials'
import { Arch, Book, FlatBook, Plant } from './Props'

const { width: WIDTH, height: HEIGHT, depth: DEPTH } = BOOKSHELF_SIZE
/** The fat chrome band wrapped around the stack of cells; the cells bulge a little over its inner edge. */
const FRAME = { band: 0.09, corner: 0.19, edge: 0.04 } as const
/** One open-fronted tray; four are stacked inside the frame. */
const CELL = {
  width: 0.87,
  height: 0.408,
  depth: 0.4,
  corner: 0.13,
  wall: 0.05,
  edge: 0.02,
  gap: 0.005,
  backThickness: 0.03,
  /** How far the cells stand out in front of the frame. */
  proud: 0.025,
  /** Thickness of the matte lining that keeps the inside from mirroring the room. */
  lining: 0.006,
} as const
/** Cell colors from the bottom cell up. */
const CELL_COLORS = [tokens.black, tokens.orange, tokens.black, tokens.orange] as const
/** How far in front of the cell's centre its contents stand. */
const CONTENT_Z = 0.04

const frameGeometry = extrudeRounded(roundedFrameShape(WIDTH, HEIGHT, FRAME.corner, FRAME.band), DEPTH, FRAME.edge)
const cellWallGeometry = extrudeRounded(
  roundedFrameShape(CELL.width, CELL.height, CELL.corner, CELL.wall),
  CELL.depth,
  CELL.edge,
)
const cellBackGeometry = extrudeRounded(
  roundedRectShape(CELL.width - CELL.wall, CELL.height - CELL.wall, CELL.corner - CELL.wall / 2),
  CELL.backThickness,
  0.006,
)

const cellLiningGeometry = extrudeRounded(
  roundedFrameShape(CELL.width - CELL.wall * 2, CELL.height - CELL.wall * 2, CELL.corner - CELL.wall, CELL.lining),
  CELL.depth - CELL.edge * 3,
  CELL.lining / 3,
)

function cellCenterY(index: number): number {
  return HEIGHT / 2 + (index - (CELL_COLORS.length - 1) / 2) * (CELL.height + CELL.gap)
}

/** One tray; children are placed relative to the middle of its inner floor. */
function Cell({ index, children }: { index: number; children: ReactNode }) {
  const color = CELL_COLORS[index]
  return (
    <group position={[0, cellCenterY(index), CELL.proud]}>
      <mesh geometry={cellWallGeometry} material={glossy(color)} castShadow receiveShadow />
      <mesh geometry={cellLiningGeometry} material={matte(color)} />
      <mesh
        geometry={cellBackGeometry}
        material={matte(color)}
        position={[0, 0, -CELL.depth / 2 + CELL.backThickness / 2]}
      />
      <group position={[0, -CELL.height / 2 + CELL.wall + CELL.lining, CONTENT_Z]}>{children}</group>
    </group>
  )
}

type Upright = readonly [color: string, height: number, thickness: number]

/** Upright books side by side, starting with the first one's left edge at `x`. */
function BookRow({ x, books }: { x: number; books: readonly Upright[] }) {
  let edge = x
  return (
    <>
      {books.map(([color, height, thickness], index) => {
        const left = edge
        edge += thickness
        return <Book key={index} color={color} x={left} height={height} thickness={thickness} />
      })}
    </>
  )
}

/** Chrome-framed bookshelf with four colored cells. Origin: centre of its footprint on the floor. */
export function Bookshelf(props: GroupProps) {
  return (
    <group {...props}>
      <mesh geometry={frameGeometry} material={chrome} position={[0, HEIGHT / 2, 0]} castShadow receiveShadow />

      <Cell index={3}>
        <FlatBook color={tokens.cream} x={-0.175} length={0.26} thickness={0.04} />
        <FlatBook color={tokens.skyblue} x={-0.185} y={0.04} length={0.27} thickness={0.032} />
        <Plant
          position={[-0.18, 0.072, 0]}
          potColor={tokens.white}
          potRadius={0.05}
          potHeight={0.065}
          leafCount={7}
          leafLength={0.085}
          leafWidth={0.013}
        />
        <Book color={tokens.bookOlive} x={0.075} height={0.225} thickness={0.045} lean={-0.33} />
        <BookRow
          x={0.15}
          books={[
            [tokens.yellow, 0.23, 0.055],
            [tokens.bookBlue, 0.215, 0.05],
            [tokens.white, 0.23, 0.052],
            [tokens.bookRed, 0.24, 0.05],
          ]}
        />
      </Cell>

      <Cell index={2}>
        <BookRow
          x={-0.36}
          books={[
            [tokens.white, 0.26, 0.055],
            [tokens.bookRed, 0.25, 0.052],
            [tokens.bookBlue, 0.225, 0.055],
            [tokens.yellow, 0.25, 0.055],
          ]}
        />
        <Book color={tokens.bookRed} x={-0.055} height={0.24} thickness={0.05} lean={0.36} />
        <Plant
          position={[0.19, 0, 0]}
          potColor={tokens.orange}
          potRadius={0.07}
          potHeight={0.115}
          rim
          leafCount={8}
          leafLength={0.19}
          leafWidth={0.028}
        />
      </Cell>

      <Cell index={1}>
        <FlatBook color={tokens.black} x={-0.17} length={0.32} thickness={0.045} />
        <FlatBook color={tokens.yellow} x={-0.16} y={0.045} length={0.3} thickness={0.045} />
        <Arch
          position={[-0.17, 0.09, 0]}
          color={tokens.navy}
          outerRadius={0.057}
          innerRadius={0.032}
          legLength={0.055}
          depth={0.04}
        />
        <BookRow
          x={0.09}
          books={[
            [tokens.white, 0.255, 0.08],
            [tokens.yellow, 0.25, 0.052],
            [tokens.bookOlive, 0.215, 0.046],
            [tokens.bookBlue, 0.225, 0.046],
            [tokens.white, 0.255, 0.056],
          ]}
        />
      </Cell>

      <Cell index={0}>
        <Arch position={[-0.135, 0, 0]} color={tokens.cream} outerRadius={0.165} innerRadius={0.072} depth={0.1} />
        <Book color={tokens.orange} x={0.157} height={0.25} thickness={0.065} lean={-0.24} />
        <BookRow
          x={0.215}
          books={[
            [tokens.white, 0.27, 0.07],
            [tokens.bookBlue, 0.27, 0.06],
          ]}
        />
      </Cell>
    </group>
  )
}
