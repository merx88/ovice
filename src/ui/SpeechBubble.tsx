import { Html } from '@react-three/drei'
import { useCallback, useRef } from 'react'
import { Vector3, type Camera } from 'three'
import { useBubble, useBubbleAnchor } from '../store/characterSignals'
import { useSettings } from '../store/settings'
import './bubble.css'

/** The bubbles keep this far (px) from the right edge of the view. */
export const BUBBLE_VIEW_MARGIN = 16
/** A bubble is never left less room (px) than this; in a view too narrow for that it moves left instead. */
export const BUBBLE_MIN_ROOM = 96

interface ViewSize {
  width: number
  height: number
}

const projected = new Vector3()

/**
 * Where the bubbles go in the view, in pixels from its top left: the point the
 * first bubble's left edge starts from, at the height of its middle, and how
 * much `room` there is from there to the right edge, less the margin.
 */
export function placeBubbles(
  anchor: readonly [number, number, number],
  camera: Camera,
  size: ViewSize,
): { x: number; y: number; room: number } {
  projected.set(anchor[0], anchor[1], anchor[2]).project(camera)
  const furthestRight = size.width - BUBBLE_VIEW_MARGIN - BUBBLE_MIN_ROOM
  const x = Math.max(BUBBLE_VIEW_MARGIN, Math.min(((projected.x + 1) / 2) * size.width, furthestRight))
  const y = ((1 - projected.y) / 2) * size.height
  return { x, y, room: Math.max(BUBBLE_MIN_ROOM, size.width - BUBBLE_VIEW_MARGIN - x) }
}

/**
 * What the character says, as bubbles beside its head. This is the one piece
 * of the interface that lives inside the canvas, because it follows a point in
 * the 3D scene: the anchor the character's driver moves on every frame.
 */
export function SpeechBubble() {
  const lines = useBubble()
  const anchor = useBubbleAnchor()
  const reduceMotion = useSettings((state) => state.reduceMotion)
  const box = useRef<HTMLDivElement>(null)
  /** The room last written to the stylesheet, so that it is written only when it changes. */
  const roomSet = useRef(-1)

  // Called by <Html> in its own frame callback, after the driver (which runs
  // earlier in the frame) has moved the anchor: the bubble never trails the
  // character by a frame.
  const place = useCallback(
    (_object: unknown, camera: Camera, size: ViewSize): number[] => {
      const { x, y, room } = placeBubbles(anchor.current, camera, size)
      const rounded = Math.floor(room)
      if (box.current && rounded !== roomSet.current) {
        box.current.style.setProperty('--room', `${rounded}px`)
        roomSet.current = rounded
      }
      return [x, y]
    },
    [anchor],
  )

  return (
    <Html
      ref={box}
      className={reduceMotion ? 'bubbles ui--still' : 'bubbles'}
      calculatePosition={place}
      // Level with the canvas, like the folder's button: the interface is drawn over both.
      zIndexRange={[0, 0]}
    >
      {/* Always there, so that screen readers notice a line arriving. The lines are English on a Korean page. */}
      <div className="bubbles__said" role="status" aria-live="polite" lang="en">
        {lines.map((line, index) => (
          <p key={`${index}:${line}`} className="bubble">
            {line}
          </p>
        ))}
      </div>
    </Html>
  )
}
