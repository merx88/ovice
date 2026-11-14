import { Canvas } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import { NeutralToneMapping } from 'three'
import { EMPTY_OFFICE_LABEL, sceneLabel } from '../character/sceneLabel'
import { CAMERA } from '../scene/layout'
import { OfficeScene } from '../scene/OfficeScene'
import { SceneErrorBoundary, SceneFallback } from '../scene/SceneErrorBoundary'
import { isWebGLAvailable } from '../scene/webgl'
import { useCharacterSignals, type CharacterSignals } from '../store/characterSignals'
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
 *
 * It changes with every step the character takes, and it is written onto the
 * canvas as it changes, without a render: every render of the canvas renders
 * what is inside it again.
 */
function Picture() {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const picture = canvas.current
    if (!picture) return
    picture.setAttribute('role', 'img')
    const describe = ({ present, charState, place }: CharacterSignals) => {
      const label = present ? sceneLabel(charState, place) : EMPTY_OFFICE_LABEL
      // Written only when it differs, as a render would have done.
      if (picture.getAttribute('aria-label') !== label) picture.setAttribute('aria-label', label)
    }
    describe(useCharacterSignals.getState())
    return useCharacterSignals.subscribe(describe)
  }, [])

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
