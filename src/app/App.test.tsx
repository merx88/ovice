import { render, screen } from '@testing-library/react'
import { Children, isValidElement, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
