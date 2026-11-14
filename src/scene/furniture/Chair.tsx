import type { GroupProps } from '@react-three/fiber'
import { CylinderGeometry } from 'three'
import { tokens } from '../../theme/tokens'
import { extrudeRounded, flatRing, roundedLoopPoints, roundedRectShape, tubeThrough } from '../geometry'
import { CHAIR_BACK, SEAT_HEIGHT } from '../layout'
import { glossy } from '../materials'

const SEAT = { width: 0.84, depth: 0.7, thickness: 0.1, corner: 0.18, edge: 0.045 } as const
const SEAT_BOTTOM_Y = SEAT_HEIGHT - SEAT.thickness

/** Each leg is one fat tube looped front to back under a side of the seat. */
const LEG = {
  tube: 0.056,
  length: 0.5,
  height: SEAT_BOTTOM_Y + 0.03,
  corner: 0.11,
  x: 0.31,
  /** The loops sit towards the front of the seat. */
  z: 0.06,
  /** Yaw that turns the front of each loop outwards. */
  toe: 0.12,
} as const

/** The bullseye backrest: two flat rings, the outer one on a pair of posts. */
const BACK = {
  z: CHAIR_BACK.z,
  centerY: CHAIR_BACK.centerY,
  outerRing: { inner: 0.215, outer: CHAIR_BACK.radius },
  innerRing: { inner: 0.052, outer: 0.16 },
  thickness: 0.07,
  edge: 0.02,
  postX: 0.235,
  postRadius: 0.042,
  postTopY: 0.72,
} as const

const seatGeometry = extrudeRounded(roundedRectShape(SEAT.width, SEAT.depth, SEAT.corner), SEAT.thickness, SEAT.edge)
seatGeometry.rotateX(Math.PI / 2)

const legGeometry = tubeThrough(
  roundedLoopPoints(LEG.length - LEG.tube * 2, LEG.height - LEG.tube * 2, LEG.corner),
  LEG.tube,
  { closed: true, tubularSegments: 72, radialSegments: 14 },
)
legGeometry.rotateY(Math.PI / 2)

const outerRingGeometry = flatRing(BACK.outerRing.inner, BACK.outerRing.outer, BACK.thickness, BACK.edge)
const innerRingGeometry = flatRing(BACK.innerRing.inner, BACK.innerRing.outer, BACK.thickness, BACK.edge)
const postHeight = BACK.postTopY - SEAT_BOTTOM_Y
const postGeometry = new CylinderGeometry(BACK.postRadius, BACK.postRadius, postHeight, 20)

/** Orange bullseye chair. Origin: centre of the seat's footprint on the floor; faces +z. */
export function Chair(props: GroupProps) {
  const material = glossy(tokens.orange)
  return (
    <group {...props}>
      <mesh geometry={seatGeometry} material={material} position={[0, SEAT_HEIGHT - SEAT.thickness / 2, 0]} castShadow receiveShadow />
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          geometry={legGeometry}
          material={material}
          position={[side * LEG.x, LEG.height / 2, LEG.z]}
          rotation={[0, side * LEG.toe, 0]}
          castShadow
        />
      ))}
      <group position={[0, 0, BACK.z]}>
        {[-1, 1].map((side) => (
          <mesh
            key={side}
            geometry={postGeometry}
            material={material}
            position={[side * BACK.postX, SEAT_BOTTOM_Y + postHeight / 2, 0]}
            castShadow
          />
        ))}
        <mesh geometry={outerRingGeometry} material={material} position={[0, BACK.centerY, 0]} castShadow />
        <mesh geometry={innerRingGeometry} material={material} position={[0, BACK.centerY, 0]} castShadow />
      </group>
    </group>
  )
}
