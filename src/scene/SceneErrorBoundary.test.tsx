import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SCENE_ERROR_MESSAGE, SceneErrorBoundary, SceneFallback } from './SceneErrorBoundary'

function Broken(): never {
  throw new Error('the model failed to load')
}

describe('SceneErrorBoundary', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders its children while they work', () => {
    render(
      <SceneErrorBoundary>
        <p>scene</p>
      </SceneErrorBoundary>,
    )
    expect(screen.getByText('scene')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the notice in place of a child that throws', () => {
    // React reports the caught error on the console; keep the test output clean.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <SceneErrorBoundary>
        <Broken />
      </SceneErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('3D 화면을 불러오지 못했어요')
    expect(consoleError).toHaveBeenCalled()
  })

  it('leaves what is rendered outside it alone', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <>
        <SceneErrorBoundary>
          <Broken />
        </SceneErrorBoundary>
        <button>메뉴</button>
      </>,
    )
    expect(screen.getByRole('button', { name: '메뉴' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})

describe('SceneFallback', () => {
  it('shows the same notice on its own', () => {
    render(<SceneFallback />)
    expect(SCENE_ERROR_MESSAGE).toBe('3D 화면을 불러오지 못했어요')
    expect(screen.getByRole('alert')).toHaveTextContent(SCENE_ERROR_MESSAGE)
  })
})
