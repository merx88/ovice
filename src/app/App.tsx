import { Canvas } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import { NeutralToneMapping } from 'three'
import { EMPTY_OFFICE_LABEL, sceneLabel } from '../character/sceneLabel'
import { CAMERA } from '../scene/layout'
import { OfficeScene } from '../scene/OfficeScene'
import { SceneErrorBoundary, SceneFallback } from '../scene/SceneErrorBoundary'
import { isWebGLAvailable } from '../scene/webgl'
import { useCharacterPlace, useCharacterPresent, useCharState } from '../store/characterSignals'
import { tokens } from '../theme/tokens'
import { Overlay } from '../ui/Overlay'

/**
 * The 3D office as a picture with a description for those who cannot see it:
 * what the character is doing and where, or that it has not appeared yet.
 *
 * The description is on the canvas itself, which is the picture. The element
 * round the canvas is no place for it: the scene puts the folder's button and
 * the character's speech bubble in there, and what is inside an image is
 * hidden from assistive technology. It is not a live region either: what the
 * character says is announced by its speech bubble.
 */
function Picture() {
  const present = useCharacterPresent()
  const charState = useCharState()
  const place = useCharacterPlace()
  const label = present ? sceneLabel(charState, place) : EMPTY_OFFICE_LABEL

  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    canvas.current?.setAttribute('role', 'img')
    canvas.current?.setAttribute('aria-label', label)
  }, [label])

  return (
    <Canvas
      ref={canvas}
      shadows="variance"
      dpr={[1, 2]}
      camera={{ position: [...CAMERA.position], fov: CAMERA.fov, near: 0.5, far: 80 }}
      gl={{ toneMapping: NeutralToneMapping }}
      style={{ background: tokens.bg }}
    >
      <color attach="background" args={[tokens.bg]} />
      <OfficeScene />
    </Canvas>
  )
}

/**
 * The picture of the office, or a notice in its place where WebGL is missing
 * or the scene fails. The notice speaks for itself: there is no picture then,
 * and nothing that describes one.
 */
function Scene() {
  const [webgl] = useState(isWebGLAvailable)
  if (!webgl) return <SceneFallback />
  return (
    <SceneErrorBoundary>
      <Picture />
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
