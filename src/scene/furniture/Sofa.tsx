import { RoundedBox } from '@react-three/drei'
import type { GroupProps } from '@react-three/fiber'
import { TorusGeometry } from 'three'
import { archPoints, tubeThrough } from '../geometry'
import { SOFA_SIZE } from '../layout'
import { silver } from '../materials'

const { arm: ARM, back: BACK, cushion: CUSHION } = SOFA_SIZE

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
