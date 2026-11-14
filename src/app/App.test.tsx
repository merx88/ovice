import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Children, forwardRef, isValidElement, memo, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cancelActive } from '../agent/orchestrator'
import { EMPTY_OFFICE_LABEL, sceneLabel } from '../character/sceneLabel'
import type { OfficeScene as RealOfficeScene } from '../scene/OfficeScene'
import { useCharacterSignals, type CharacterSignals } from '../store/characterSignals'
import { useTasks } from '../store/tasks'
import { App } from './App'

/** Whether the stand-in scene fails, and how often the stand-ins for the canvas and the scene have been rendered. */
const scene = vi.hoisted(() => ({ fails: false, renders: 0, canvasRenders: 0 }))
/** What the app asks of the character's module: to start downloading its model. */
const character = vi.hoisted(() => ({ preload: vi.fn() }))

// The renderer and the 3D scene need WebGL; stand-ins are enough to see what the app puts where.
vi.mock('@react-three/fiber', () => ({
  // Renders the components inside the canvas, leaving out three.js elements such as <color>, beside a
  // <canvas> of its own. As with the real one, a ref to it is that <canvas>, whatever the scene puts
  // into the page (the folder's button, the speech bubble) is beside the <canvas>, not inside it, and
  // every render of the canvas renders what is inside it again.
  Canvas: forwardRef<HTMLCanvasElement, { children: ReactNode }>(function Canvas({ children }, ref) {
    scene.canvasRenders += 1
    return (
      <div data-testid="canvas">
        <canvas ref={ref} />
        {Children.toArray(children).filter((child) => isValidElement(child) && typeof child.type !== 'string')}
      </div>
    )
  }),
}))
vi.mock('../character/Character', () => ({ preloadCharacter: character.preload }))
vi.mock('../scene/OfficeScene', () => ({
  // Through `memo`, as the real one is exported (its type says so).
  OfficeScene: memo(function OfficeScene() {
    scene.renders += 1
    if (scene.fails) throw new Error('the model failed to load')
    return <span>office</span>
  }) satisfies typeof RealOfficeScene,
}))

/** Makes every canvas hand out a WebGL context, or none at all. */
function stubWebGL(available: boolean) {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() =>
    available ? {} : null) as unknown as HTMLCanvasElement['getContext'])
}

/** What the signals hold while no character is in the picture. */
const NOBODY: CharacterSignals = { bubble: [], badge: 'idle', charState: 'resting', place: 'desk', present: false }

/** The character lets the interface know about itself, as its driver does. */
function characterIs(signals: Partial<CharacterSignals>) {
  act(() => useCharacterSignals.getState().publish({ ...NOBODY, present: true, ...signals }))
}

describe('App', () => {
  beforeEach(() => {
    localStorage.clear()
    useTasks.setState({ tasks: [], activeId: null, viewingId: null })
    useCharacterSignals.getState().publish(NOBODY)
    scene.renders = 0
    scene.canvasRenders = 0
    character.preload.mockClear()
  })

  afterEach(() => {
    scene.fails = false
    vi.restoreAllMocks()
  })

  it('draws the office when WebGL is available', () => {
    stubWebGL(true)
    render(<App />)
    expect(screen.getByTestId('canvas')).toHaveTextContent('office')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('puts the interface next to the office, not inside the canvas', () => {
    stubWebGL(true)
    render(<App />)
    const tab = screen.getByRole('button', { name: 'Office' })
    expect(screen.getByTestId('canvas')).not.toContainElement(tab)
  })

  it('keeps the interface when WebGL is unavailable', () => {
    stubWebGL(false)
    render(<App />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Office' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '설정' })).toBeInTheDocument()
  })

  it('still takes a prompt, shows the tasks and opens the settings when WebGL is unavailable', async () => {
    stubWebGL(false)
    render(<App />)
    try {
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'compare three laptops' } })
      fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
      expect(screen.getByRole('progressbar')).toBeInTheDocument()
      expect(screen.getByText('compare three laptops')).toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: '작업 목록' }))
      expect(within(screen.getByRole('region', { name: '작업 목록' })).getByText('진행 중')).toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: '설정' }))
      expect(screen.getByRole('dialog', { name: '설정' })).toBeInTheDocument()
      // The notice about the scene is still there, under the interface.
      expect(screen.getByText('3D 화면을 불러오지 못했어요')).toBeInTheDocument()
    } finally {
      act(() => cancelActive())
    }
  })

  it('keeps the interface when the scene fails', () => {
    stubWebGL(true)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    scene.fails = true
    render(<App />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Office' })).toBeInTheDocument()
  })

  it('shows the notice instead of the canvas when WebGL is unavailable', () => {
    stubWebGL(false)
    render(<App />)
    expect(screen.getByRole('alert')).toHaveTextContent('3D 화면을 불러오지 못했어요')
    expect(screen.queryByTestId('canvas')).not.toBeInTheDocument()
  })

  it('says where the results are without the character, naming the button by what it is announced as', () => {
    stubWebGL(false)
    render(<App />)
    const button = screen.getByRole('button', { name: '작업 목록' })
    expect(button).toHaveAccessibleName('작업 목록')
    expect(screen.getByRole('alert')).toHaveTextContent("결과는 오른쪽 아래 '작업 목록' 버튼을 눌러 열 수 있어요.")
  })

  it('shows the notice when the scene fails', () => {
    stubWebGL(true)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    scene.fails = true
    render(<App />)
    expect(screen.getByRole('alert')).toHaveTextContent('3D 화면을 불러오지 못했어요')
    expect(screen.queryByTestId('canvas')).not.toBeInTheDocument()
  })

  describe("the character's model", () => {
    it('starts downloading as the app starts where WebGL is available', () => {
      stubWebGL(true)
      render(<App />)
      expect(character.preload).toHaveBeenCalledTimes(1)
    })

    it('is not downloaded where WebGL is unavailable: nothing could show it', () => {
      stubWebGL(false)
      render(<App />)
      expect(character.preload).not.toHaveBeenCalled()
    })
  })

  describe('the picture of the office', () => {
    const picture = () => screen.getByRole('img')

    it('is the canvas itself, described as an office its character has not appeared in yet', () => {
      stubWebGL(true)
      render(<App />)
      expect(picture().tagName).toBe('CANVAS')
      expect(picture()).toHaveAccessibleName(EMPTY_OFFICE_LABEL)
    })

    it('says what the character is doing and where, once it is there, and keeps up with it', () => {
      stubWebGL(true)
      render(<App />)
      characterIs({ charState: 'resting', place: 'desk' })
      expect(picture()).toHaveAccessibleName(sceneLabel('resting', 'desk'))
      characterIs({ charState: 'goingToSofa', place: 'desk' })
      expect(picture()).toHaveAccessibleName(sceneLabel('goingToSofa', 'desk'))
      characterIs({ charState: 'resting', place: 'sofa' })
      expect(picture()).toHaveAccessibleName('3D 사무실의 캐릭터가 소파에 앉아 쉬고 있어요.')
      characterIs({ charState: 'rushingToDesk', place: 'desk', badge: 'thinking' })
      expect(picture()).toHaveAccessibleName(sceneLabel('rushingToDesk', 'desk'))
      characterIs({ charState: 'working', place: 'desk', badge: 'working', bubble: ['Writing up the report...'] })
      expect(picture()).toHaveAccessibleName('3D 사무실의 캐릭터가 책상에서 일하고 있어요.')
      expect(screen.getAllByRole('img')).toHaveLength(1)
    })

    it('says nothing of a character that is gone again', () => {
      stubWebGL(true)
      render(<App />)
      characterIs({ charState: 'handingFile' })
      expect(picture()).toHaveAccessibleName(sceneLabel('handingFile', 'desk'))
      act(() => useCharacterSignals.getState().publish(NOBODY))
      expect(picture()).toHaveAccessibleName(EMPTY_OFFICE_LABEL)
    })

    it('is rendered by React once: neither what the character does nor a render of the app renders the scene again', () => {
      stubWebGL(true)
      const { rerender } = render(<App />)
      expect(scene.renders).toBe(1)

      // The character appears, changes what it does and where it is, and goes again: the description follows...
      characterIs({ charState: 'resting', place: 'desk' })
      expect(picture()).toHaveAccessibleName(sceneLabel('resting', 'desk'))
      characterIs({ charState: 'goingToSofa', place: 'desk' })
      expect(picture()).toHaveAccessibleName(sceneLabel('goingToSofa', 'desk'))
      characterIs({ charState: 'resting', place: 'sofa' })
      expect(picture()).toHaveAccessibleName(sceneLabel('resting', 'sofa'))
      act(() => useCharacterSignals.getState().publish(NOBODY))
      expect(picture()).toHaveAccessibleName(EMPTY_OFFICE_LABEL)
      // ...without a render of the canvas, let alone of the scene.
      expect(scene.canvasRenders).toBe(1)
      expect(scene.renders).toBe(1)

      // The app rendered again renders the canvas again, but not the scene, and the description stays.
      rerender(<App />)
      expect(scene.renders).toBe(1)
      expect(picture()).toHaveAccessibleName(EMPTY_OFFICE_LABEL)
      characterIs({ charState: 'working', place: 'desk' })
      expect(picture()).toHaveAccessibleName(sceneLabel('working', 'desk'))
      expect(scene.renders).toBe(1)
    })

    it('is no live region: what the character says is announced by its speech bubble', () => {
      stubWebGL(true)
      render(<App />)
      characterIs({ charState: 'working' })
      expect(picture()).not.toHaveAttribute('aria-live')
      expect(picture().closest('[aria-live], [role="status"], [role="alert"]')).toBeNull()
    })

    it('holds nothing: what the scene puts into the page stays beside the picture, where assistive technology finds it', () => {
      stubWebGL(true)
      render(<App />)
      expect(picture()).toBeEmptyDOMElement()
      // The stand-in for the scene's own content is in the canvas's element, and not inside the image.
      expect(screen.getByTestId('canvas')).toHaveTextContent('office')
      expect(screen.getByTestId('canvas')).not.toHaveAttribute('role')
      expect(picture()).not.toHaveTextContent('office')
    })

    it.each([
      ['WebGL is unavailable', false],
      ['the scene fails', true],
    ])('is not there where %s: there is no picture, and the notice says so itself', (_, fails) => {
      stubWebGL(fails)
      if (fails) vi.spyOn(console, 'error').mockImplementation(() => {})
      scene.fails = fails
      render(<App />)
      // Even if the signals said a character was at work.
      characterIs({ charState: 'working' })
      expect(screen.queryByRole('img')).not.toBeInTheDocument()
      expect(screen.getByRole('alert')).toHaveTextContent('3D 화면을 불러오지 못했어요')
    })
  })
})
