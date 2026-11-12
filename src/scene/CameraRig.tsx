import { useFrame } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { PerspectiveCamera } from 'three'
import { useSettings } from '../store/settings'
import { cameraFor, fovForAspect, type CameraSpec } from './layout'

/** How far (m) the camera drifts towards the pointer on each axis. */
const PARALLAX_RANGE = 0.15
/** How quickly the camera catches up with the pointer (1/s). */
const PARALLAX_EASE = 3

/**
 * Temporary review aid: `?cam=bookshelf|desk|sofa` moves the camera in for a
 * close-up screenshot of one area. Not part of the product.
 */
const CLOSEUPS: Record<string, CameraSpec> = {
  bookshelf: { position: [-1.55, 1.25, 3.2], target: [-2.03, 0.9, -1.2], fov: 28, aspect: 1 },
  desk: { position: [0.3, 1.5, 4.6], target: [0, 0.55, -0.2], fov: 30, aspect: 1.5 },
  sofa: { position: [1.5, 1.2, 3.4], target: [2.1, 0.45, -0.4], fov: 28, aspect: 1.2 },
}
const closeup = CLOSEUPS[new URLSearchParams(window.location.search).get('cam') ?? '']

/**
 * Holds the fixed front view, picks the mobile framing on narrow viewports and
 * lets the camera drift slightly with the pointer when parallax is on.
 */
export function CameraRig() {
  const parallax = useSettings((s) => s.parallax)
  const reduceMotion = useSettings((s) => s.reduceMotion)
  /** Pointer position in the window, each axis from -1 to 1 (+y up). */
  const pointer = useRef({ x: 0, y: 0 })
  const offset = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      pointer.current.x = (event.clientX / window.innerWidth) * 2 - 1
      pointer.current.y = 1 - (event.clientY / window.innerHeight) * 2
    }
    window.addEventListener('pointermove', onPointerMove)
    return () => window.removeEventListener('pointermove', onPointerMove)
  }, [])

  useFrame(({ camera, size }, delta) => {
    const spec = closeup ?? cameraFor(size.width)
    const follow = parallax && !reduceMotion
    const goalX = follow ? pointer.current.x * PARALLAX_RANGE : 0
    const goalY = follow ? pointer.current.y * PARALLAX_RANGE : 0
    const ease = 1 - Math.exp(-PARALLAX_EASE * delta)
    offset.current.x += (goalX - offset.current.x) * ease
    offset.current.y += (goalY - offset.current.y) * ease

    camera.position.set(spec.position[0] + offset.current.x, spec.position[1] + offset.current.y, spec.position[2])
    camera.lookAt(spec.target[0], spec.target[1], spec.target[2])

    if (camera instanceof PerspectiveCamera) {
      const fov = fovForAspect(spec, size.width / size.height)
      if (camera.fov !== fov) {
        camera.fov = fov
        camera.updateProjectionMatrix()
      }
    }
  })

  return null
}
