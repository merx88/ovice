import { Canvas } from '@react-three/fiber'
import { useState } from 'react'
import { NeutralToneMapping } from 'three'
import { CAMERA } from '../scene/layout'
import { OfficeScene } from '../scene/OfficeScene'
import { SceneErrorBoundary, SceneFallback } from '../scene/SceneErrorBoundary'
import { isWebGLAvailable } from '../scene/webgl'
import { tokens } from '../theme/tokens'
import { Overlay } from '../ui/Overlay'

/** The 3D office, or a notice in its place where WebGL is missing or the scene fails. */
function Scene() {
  const [webgl] = useState(isWebGLAvailable)
  if (!webgl) return <SceneFallback />
  return (
    <SceneErrorBoundary>
      <Canvas
        shadows="variance"
        dpr={[1, 2]}
        camera={{ position: [...CAMERA.position], fov: CAMERA.fov, near: 0.5, far: 80 }}
        gl={{ toneMapping: NeutralToneMapping }}
        style={{ background: tokens.bg }}
      >
        <color attach="background" args={[tokens.bg]} />
        <OfficeScene />
      </Canvas>
    </SceneErrorBoundary>
  )
}

export function App() {
  return (
    <>
      <Scene />
      {/* Beside the scene, not inside it: the interface keeps working whatever happens to the 3D part. */}
      <Overlay />
    </>
  )
}
