import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Children, isValidElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cancelActive } from '../agent/orchestrator'
import { useTasks } from '../store/tasks'
import { App } from './App'

const scene = vi.hoisted(() => ({ fails: false }))

// The renderer and the 3D scene need WebGL; stand-ins are enough to see what the app puts where.
vi.mock('@react-three/fiber', () => ({
  // Renders the components inside the canvas, leaving out three.js elements such as <color>.
  Canvas: ({ children }: { children: ReactNode }) => (
    <div data-testid="canvas">
      {Children.toArray(children).filter((child) => isValidElement(child) && typeof child.type !== 'string')}
    </div>
  ),
}))
vi.mock('../scene/OfficeScene', () => ({
  OfficeScene: () => {
    if (scene.fails) throw new Error('the model failed to load')
    return <span>office</span>
  },
}))

/** Makes every canvas hand out a WebGL context, or none at all. */
function stubWebGL(available: boolean) {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() =>
    available ? {} : null) as unknown as HTMLCanvasElement['getContext'])
}

describe('App', () => {
  beforeEach(() => {
    localStorage.clear()
    useTasks.setState({ tasks: [], activeId: null, viewingId: null })
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

  it('shows the notice when the scene fails', () => {
    stubWebGL(true)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    scene.fails = true
    render(<App />)
    expect(screen.getByRole('alert')).toHaveTextContent('3D 화면을 불러오지 못했어요')
    expect(screen.queryByTestId('canvas')).not.toBeInTheDocument()
  })
})
