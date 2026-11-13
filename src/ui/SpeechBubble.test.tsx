import { act, render, screen } from '@testing-library/react'
import { forwardRef, type ReactNode } from 'react'
import { Object3D, PerspectiveCamera } from 'three'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bubbleAnchorAt } from '../character/bubble'
import { SEAT_LIFT } from '../character/clips/shared'
import { CAMERA, cameraFor, fovForAspect, HANDOFF_POS, SEAT_GROUND_POS, type CameraSpec } from '../scene/layout'
import { useCharacterSignals } from '../store/characterSignals'
import { useSettings } from '../store/settings'
import { BUBBLE_MIN_ROOM, BUBBLE_VIEW_MARGIN, placeBubbles, SpeechBubble } from './SpeechBubble'

type Place = (object: Object3D, camera: PerspectiveCamera, size: { width: number; height: number }) => number[]

/** What the bubble handed to drei's <Html>, which cannot run without a canvas. */
const html = vi.hoisted(() => ({ props: {} as Record<string, unknown> }))

vi.mock('@react-three/drei', () => ({
  Html: forwardRef<HTMLDivElement, { children: ReactNode; className?: string }>(function Html(
    { children, className, ...rest },
    ref,
  ) {
    html.props = rest
    return (
      <div ref={ref} className={className} data-testid="html">
        {children}
      </div>
    )
  }),
}))

/** The camera the scene uses for a view of this size. */
function cameraOf(spec: CameraSpec, width: number, height: number): PerspectiveCamera {
  const camera = new PerspectiveCamera(fovForAspect(spec, width / height), width / height, 0.5, 80)
  camera.position.set(...spec.position)
  camera.lookAt(...spec.target)
  camera.updateMatrixWorld()
  return camera
}

function say(...bubble: string[]) {
  act(() => useCharacterSignals.getState().publish({ bubble, badge: 'working', charState: 'working' }))
}

const SEATED = bubbleAnchorAt(SEAT_GROUND_POS, SEAT_LIFT)
const HANDING_OVER = bubbleAnchorAt(HANDOFF_POS, 0)

beforeEach(() => {
  localStorage.clear()
  useSettings.setState({ reduceMotion: false })
  useCharacterSignals.getState().publish({ bubble: [], badge: 'idle', charState: 'resting' })
  useCharacterSignals.getState().bubbleAnchor.current = [...SEATED]
})

describe('SpeechBubble: what it says', () => {
  it('says nothing while the character says nothing', () => {
    render(<SpeechBubble />)
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('shows what the character says, announced politely and marked as English', () => {
    render(<SpeechBubble />)
    say("I'm searching for information on the web...")
    const said = screen.getByRole('status')
    expect(said).toHaveTextContent("I'm searching for information on the web...")
    expect(said).toHaveAttribute('aria-live', 'polite')
    expect(said).toHaveAttribute('lang', 'en')
  })

  it('shows one bubble per line, in the order they are said', () => {
    render(<SpeechBubble />)
    say('The research is ready.', 'Let me hand you the file.')
    const bubbles = [...screen.getByRole('status').children]
    expect(bubbles.map((bubble) => bubble.textContent)).toEqual(['The research is ready.', 'Let me hand you the file.'])
  })

  it('keeps the first bubble where it is when a second line follows', () => {
    render(<SpeechBubble />)
    say('The research is ready.')
    const first = screen.getByText('The research is ready.')
    say('The research is ready.', 'Let me hand you the file.')
    expect(screen.getByText('The research is ready.')).toBe(first)
  })

  it('takes the bubbles away when the character stops talking', () => {
    render(<SpeechBubble />)
    say('Okay, stopping.')
    say()
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('shows a line as the text it is', () => {
    render(<SpeechBubble />)
    say('<img src=x onerror=alert(1)> **bold**')
    expect(screen.getByText('<img src=x onerror=alert(1)> **bold**')).toBeInTheDocument()
    expect(screen.getByRole('status').querySelector('img, strong')).toBeNull()
  })

  it('stays under the interface and stands still when motion is reduced', () => {
    const { rerender } = render(<SpeechBubble />)
    expect(html.props.zIndexRange).toEqual([0, 0])
    expect(screen.getByTestId('html')).not.toHaveClass('ui--still')
    act(() => useSettings.getState().setReduceMotion(true))
    rerender(<SpeechBubble />)
    expect(screen.getByTestId('html')).toHaveClass('ui--still')
  })
})

describe('placeBubbles', () => {
  const desktop = { width: 1728, height: 1117 }

  it('puts the bubble where the reference has it beside the seated character', () => {
    const { x, y } = placeBubbles(SEATED, cameraOf(CAMERA, desktop.width, desktop.height), desktop)
    // Reference 1: the bubble's left edge is at x = 928, its middle at y = 315.
    expect(Math.abs(x - 928)).toBeLessThan(6)
    expect(Math.abs(y - 315)).toBeLessThan(6)
  })

  it('puts it where the reference has it at the hand-over', () => {
    const { x, y } = placeBubbles(HANDING_OVER, cameraOf(CAMERA, desktop.width, desktop.height), desktop)
    // Reference 3: the first bubble's left edge is at x = 928, its middle at y = 405.
    expect(Math.abs(x - 928)).toBeLessThan(14)
    expect(Math.abs(y - 405)).toBeLessThan(6)
  })

  it('leaves the bubbles the room between the anchor and the right edge, less a margin', () => {
    const { x, room } = placeBubbles(SEATED, cameraOf(CAMERA, desktop.width, desktop.height), desktop)
    expect(room).toBeCloseTo(desktop.width - BUBBLE_VIEW_MARGIN - x, 5)
  })

  it.each([
    [390, 844],
    [360, 640],
    [320, 568],
  ])('keeps a bubble of the smallest width inside a %i × %i view', (width, height) => {
    const size = { width, height }
    for (const anchor of [SEATED, HANDING_OVER]) {
      const { x, room } = placeBubbles(anchor, cameraOf(cameraFor(width), width, height), size)
      expect(room).toBeGreaterThanOrEqual(BUBBLE_MIN_ROOM)
      expect(x).toBeGreaterThanOrEqual(BUBBLE_VIEW_MARGIN)
      expect(x + room).toBeLessThanOrEqual(width - BUBBLE_VIEW_MARGIN + 1e-6)
    }
  })

  it('moves the bubble left rather than letting it leave a view that is too narrow', () => {
    const size = { width: 200, height: 568 }
    const { x, room } = placeBubbles(SEATED, cameraOf(cameraFor(200), 200, 568), size)
    expect(room).toBe(BUBBLE_MIN_ROOM)
    expect(x).toBe(size.width - BUBBLE_VIEW_MARGIN - BUBBLE_MIN_ROOM)
  })
})

describe('SpeechBubble: following the character', () => {
  it('reads the anchor each time it is asked where it goes, and tells the bubbles their room', () => {
    render(<SpeechBubble />)
    const place = html.props.calculatePosition as Place
    const size = { width: 1728, height: 1117 }
    const camera = cameraOf(CAMERA, size.width, size.height)

    const seated = place(new Object3D(), camera, size)
    expect(seated).toEqual(Object.values(placeBubbles(SEATED, camera, size)).slice(0, 2))
    const room = () => Number.parseFloat(screen.getByTestId('html').style.getPropertyValue('--room'))
    // Whole pixels, so that the stylesheet is not written to on every frame of a walk.
    expect(room()).toBe(Math.floor(size.width - BUBBLE_VIEW_MARGIN - seated[0]))

    // The driver moves the anchor in place, without telling anyone.
    const anchor = useCharacterSignals.getState().bubbleAnchor.current
    anchor[0] = HANDING_OVER[0]
    anchor[1] = HANDING_OVER[1]
    anchor[2] = HANDING_OVER[2]
    const handingOver = place(new Object3D(), camera, size)
    expect(handingOver[1]).toBeGreaterThan(seated[1] + 50)
    expect(room()).toBe(Math.floor(size.width - BUBBLE_VIEW_MARGIN - handingOver[0]))
  })
})
