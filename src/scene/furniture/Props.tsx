// Small objects that dress the furniture: desk props and shelf decorations.
import { RoundedBox } from '@react-three/drei'
import type { GroupProps } from '@react-three/fiber'
import { useMemo } from 'react'
import { ConeGeometry, Shape, TorusGeometry } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { tokens } from '../../theme/tokens'
import { extrudeRounded, roundedCylinder } from '../geometry'
import { LAPTOP_SIZE } from '../layout'
import { glossy, matte } from '../materials'

// --- Lamp -------------------------------------------------------------------

const LAMP = {
  baseRadius: 0.108,
  baseHeight: 0.04,
  stemRadius: 0.06,
  stemHeight: 0.15,
  neckRadius: 0.022,
  neckHeight: 0.05,
  ringRadius: 0.07,
  ringTube: 0.027,
  ringCenterY: 0.285,
} as const

const lampBaseGeometry = roundedCylinder(LAMP.baseRadius, LAMP.baseRadius, LAMP.baseHeight, 0.014)
const lampStemGeometry = roundedCylinder(LAMP.stemRadius, LAMP.stemRadius, LAMP.stemHeight, 0.012)
const lampNeckGeometry = roundedCylinder(LAMP.neckRadius, LAMP.neckRadius, LAMP.neckHeight, 0.004, 16)
const lampRingGeometry = new TorusGeometry(LAMP.ringRadius, LAMP.ringTube, 16, 48)

/** Yellow ring lamp. Origin: centre of its base on the desktop. */
export function Lamp(props: GroupProps) {
  const material = glossy(tokens.yellow)
  const stemY = LAMP.baseHeight - 0.01
  return (
    <group {...props}>
      <mesh geometry={lampBaseGeometry} material={material} castShadow receiveShadow />
      <mesh geometry={lampStemGeometry} material={material} position={[0, stemY, 0]} castShadow />
      <mesh geometry={lampNeckGeometry} material={material} position={[0, stemY + LAMP.stemHeight - 0.01, 0]} />
      <mesh geometry={lampRingGeometry} material={material} position={[0, LAMP.ringCenterY, 0]} castShadow />
    </group>
  )
}

// --- Coffee cup -------------------------------------------------------------

const CUP = {
  topRadius: 0.057,
  bottomRadius: 0.044,
  height: 0.115,
  lidRadius: 0.064,
  lidHeight: 0.026,
  capRadius: 0.05,
  capHeight: 0.015,
} as const

const cupGeometry = roundedCylinder(CUP.topRadius, CUP.bottomRadius, CUP.height, 0.008)
const cupLidGeometry = roundedCylinder(CUP.lidRadius, CUP.lidRadius, CUP.lidHeight, 0.008)
const cupCapGeometry = roundedCylinder(CUP.capRadius, CUP.capRadius + 0.004, CUP.capHeight, 0.005)

/** Pink take-away cup with a black lid. Origin: centre of its base on the desktop. */
export function CoffeeCup(props: GroupProps) {
  const lid = glossy(tokens.black)
  const lidY = CUP.height - 0.006
  return (
    <group {...props}>
      <mesh geometry={cupGeometry} material={glossy(tokens.pink)} castShadow />
      <mesh geometry={cupLidGeometry} material={lid} position={[0, lidY, 0]} castShadow />
      <mesh geometry={cupCapGeometry} material={lid} position={[0, lidY + CUP.lidHeight - 0.004, 0]} />
    </group>
  )
}

// --- Laptop -----------------------------------------------------------------

/**
 * Open gray laptop. Origin: centre of its base on the desktop. The keyboard
 * and screen face -z (the seat); the back of the lid faces +z. Its measures
 * are in `layout.ts` (`LAPTOP_SIZE`), because the character is fitted to them.
 */
export function Laptop(props: GroupProps) {
  const shell = matte(tokens.laptopGray)
  const dark = glossy(tokens.black)
  return (
    <group {...props}>
      <RoundedBox
        args={[LAPTOP_SIZE.width, LAPTOP_SIZE.baseHeight, LAPTOP_SIZE.depth]}
        radius={LAPTOP_SIZE.corner}
        material={shell}
        position={[0, LAPTOP_SIZE.baseHeight / 2, 0]}
        castShadow
        receiveShadow
      />
      <mesh
        material={dark}
        position={[0, LAPTOP_SIZE.baseHeight + LAPTOP_SIZE.keysLift, -LAPTOP_SIZE.depth * 0.12]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[LAPTOP_SIZE.width - LAPTOP_SIZE.bezel * 4, LAPTOP_SIZE.depth * 0.5]} />
      </mesh>
      <group
        position={[0, LAPTOP_SIZE.baseHeight, LAPTOP_SIZE.depth / 2 - LAPTOP_SIZE.lidThickness / 2]}
        rotation={[LAPTOP_SIZE.lidLean, 0, 0]}
      >
        <RoundedBox
          args={[LAPTOP_SIZE.width, LAPTOP_SIZE.lidHeight, LAPTOP_SIZE.lidThickness]}
          radius={LAPTOP_SIZE.corner}
          material={shell}
          position={[0, LAPTOP_SIZE.lidHeight / 2, 0]}
          castShadow
        />
        <mesh
          material={dark}
          position={[0, LAPTOP_SIZE.lidHeight / 2, -LAPTOP_SIZE.lidThickness / 2 - 0.0005]}
          rotation={[0, Math.PI, 0]}
        >
          <planeGeometry args={[LAPTOP_SIZE.width - LAPTOP_SIZE.bezel * 2, LAPTOP_SIZE.lidHeight - LAPTOP_SIZE.bezel * 2]} />
        </mesh>
      </group>
    </group>
  )
}

// --- Books ------------------------------------------------------------------

const BOOK = { thickness: 0.05, height: 0.24, depth: 0.17, corner: 0.007 } as const
const bookGeometry = new RoundedBoxGeometry(BOOK.thickness, BOOK.height, BOOK.depth, 2, BOOK.corner)

export interface BookProps {
  color: string
  /**
   * Where the book touches the shelf: its left edge when upright or leaning
   * left, its right edge when leaning right.
   */
  x: number
  z?: number
  height?: number
  thickness?: number
  /** Tilt in radians; positive leans the top to the left, negative to the right. */
  lean?: number
}

/** A book standing on y = 0, spine towards +z. */
export function Book({ color, x, z = 0, height = BOOK.height, thickness = BOOK.thickness, lean = 0 }: BookProps) {
  const side = lean < 0 ? -1 : 1
  return (
    <group position={[x, 0, z]} rotation={[0, 0, lean]}>
      <mesh
        geometry={bookGeometry}
        material={matte(color)}
        position={[(side * thickness) / 2, height / 2, 0]}
        scale={[thickness / BOOK.thickness, height / BOOK.height, 1]}
        castShadow
      />
    </group>
  )
}

export interface FlatBookProps {
  color: string
  /** Centre of the book along the shelf. */
  x: number
  /** Height of the book's underside. */
  y?: number
  z?: number
  length?: number
  thickness?: number
}

/** A book lying flat with its underside at `y`, spine towards +z. */
export function FlatBook({ color, x, y = 0, z = 0, length = BOOK.height, thickness = BOOK.thickness }: FlatBookProps) {
  return (
    <mesh
      geometry={bookGeometry}
      material={matte(color)}
      position={[x, y + thickness / 2, z]}
      rotation={[0, 0, Math.PI / 2]}
      scale={[thickness / BOOK.thickness, length / BOOK.height, 1]}
      castShadow
    />
  )
}

// --- Plants -----------------------------------------------------------------

const LEAF_SEGMENTS = 8
const leafGeometry = new ConeGeometry(1, 1, LEAF_SEGMENTS)
leafGeometry.translate(0, 0.5, 0)
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

export interface PlantProps extends GroupProps {
  potColor: string
  potRadius: number
  potHeight: number
  /** Adds the thick rim of a terracotta pot. */
  rim?: boolean
  leafCount: number
  leafLength: number
  leafWidth: number
}

/** A potted plant with spiky leaves. Origin: centre of the pot's base. */
export function Plant({ potColor, potRadius, potHeight, rim = false, leafCount, leafLength, leafWidth, ...props }: PlantProps) {
  const potGeometry = useMemo(
    () => roundedCylinder(potRadius, potRadius * 0.72, potHeight, potRadius * 0.15, 24),
    [potRadius, potHeight],
  )
  const rimGeometry = useMemo(
    () => roundedCylinder(potRadius * 1.12, potRadius * 1.12, potHeight * 0.28, potRadius * 0.08, 24),
    [potRadius, potHeight],
  )
  const pot = glossy(potColor)
  const leaf = matte(tokens.plantGreen)
  return (
    <group {...props}>
      <mesh geometry={potGeometry} material={pot} castShadow />
      {rim && <mesh geometry={rimGeometry} material={pot} position={[0, potHeight * 0.76, 0]} castShadow />}
      {Array.from({ length: leafCount }, (_, index) => {
        // Inner leaves stand upright and long; outer ones splay and shorten.
        const spread = leafCount > 1 ? index / (leafCount - 1) : 0
        const length = leafLength * (1 - spread * 0.35)
        return (
          <group key={index} position={[0, potHeight * 0.9, 0]} rotation={[0, index * GOLDEN_ANGLE, 0]}>
            <mesh
              geometry={leafGeometry}
              material={leaf}
              rotation={[0, 0, -(0.08 + spread * 0.75)]}
              scale={[leafWidth, length, leafWidth * 0.5]}
              castShadow
            />
          </group>
        )
      })}
    </group>
  )
}

// --- Arches -----------------------------------------------------------------

export interface ArchProps extends GroupProps {
  color: string
  outerRadius: number
  innerRadius: number
  depth: number
  /** Length of the straight legs below the half circle. */
  legLength?: number
}

/** A rainbow-block arch standing on y = 0, facing +z. */
export function Arch({ color, outerRadius, innerRadius, depth, legLength = 0, ...props }: ArchProps) {
  const geometry = useMemo(() => {
    const shape = new Shape()
    shape.moveTo(-outerRadius, 0)
    shape.lineTo(-outerRadius, legLength)
    shape.absarc(0, legLength, outerRadius, Math.PI, 0, true)
    shape.lineTo(outerRadius, 0)
    shape.lineTo(innerRadius, 0)
    shape.lineTo(innerRadius, legLength)
    shape.absarc(0, legLength, innerRadius, 0, Math.PI, false)
    shape.lineTo(-innerRadius, 0)
    shape.closePath()
    return extrudeRounded(shape, depth, Math.min(0.012, (outerRadius - innerRadius) / 4))
  }, [outerRadius, innerRadius, depth, legLength])
  return (
    <group {...props}>
      <mesh geometry={geometry} material={glossy(color)} castShadow />
    </group>
  )
}
