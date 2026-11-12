import { RoundedBox } from '@react-three/drei'
import type { GroupProps } from '@react-three/fiber'
import { TorusGeometry } from 'three'
import { archPoints, tubeThrough } from '../geometry'
import { silver } from '../materials'

/** Each arm is a fat ring standing on the floor, seen edge-on from the front. */
const ARM = { tube: 0.125, height: 0.665, x: 0.46 } as const
/** The backrest is one tube arched between the arms. */
const BACK = { tube: 0.12, radius: 0.27, baseY: 0.28, legLength: 0.25, z: -0.2 } as const
const CUSHION = { width: 0.72, height: 0.27, depth: 0.68, radius: 0.125, y: 0.36, z: 0.03 } as const

const armGeometry = new TorusGeometry(ARM.height / 2 - ARM.tube, ARM.tube, 20, 56)
armGeometry.rotateY(Math.PI / 2)

const backGeometry = tubeThrough(archPoints(BACK.radius, BACK.legLength), BACK.tube, {
  tubularSegments: 56,
  radialSegments: 20,
})

/** Silver inflated-tube armchair. Origin: centre of its footprint on the floor; faces +z. */
export function Sofa(props: GroupProps) {
  return (
    <group {...props}>
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          geometry={armGeometry}
          material={silver}
          position={[side * ARM.x, ARM.height / 2, 0]}
          castShadow
          receiveShadow
        />
      ))}
      <mesh geometry={backGeometry} material={silver} position={[0, BACK.baseY, BACK.z]} castShadow receiveShadow />
      <RoundedBox
        args={[CUSHION.width, CUSHION.height, CUSHION.depth]}
        radius={CUSHION.radius}
        smoothness={6}
        material={silver}
        position={[0, CUSHION.y, CUSHION.z]}
        castShadow
        receiveShadow
      />
    </group>
  )
}
