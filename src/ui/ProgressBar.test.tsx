import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { STEP_ORDER } from '../agent/MockRunner'
import { cancelActive } from '../agent/orchestrator'
import { useTasks, type AgentStep } from '../store/tasks'
import { ProgressBar } from './ProgressBar'

vi.mock('../agent/orchestrator', () => ({ startTask: vi.fn(), cancelActive: vi.fn(), retry: vi.fn() }))

const tasks = () => useTasks.getState()

/** Puts a running task into the store, at the step given. */
function running(prompt: string, step: AgentStep | null = null): string {
  let id = ''
  act(() => {
    id = tasks().create(prompt).id
    if (step !== null) tasks().update(id, { step, message: 'whatever the agent says' })
  })
  return id
}

beforeEach(() => {
  localStorage.clear()
  useTasks.setState({ tasks: [], activeId: null, viewingId: null })
  vi.mocked(cancelActive).mockReset()
})

describe('ProgressBar', () => {
  it('shows nothing when no task is running', () => {
    const { container } = render(<ProgressBar />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the prompt on one line, with the whole prompt as its tooltip', () => {
    const long = 'Research the five most competitive services of 2026 and say which one a small team should pick. '.repeat(3)
    render(<ProgressBar />)
    running(long.trim())
    const text = screen.getByText(long.trim())
    expect(text).toHaveAttribute('title', long.trim())
  })

  it('never shows the progress line of the agent, only the prompt', () => {
    render(<ProgressBar />)
    running('compare three laptops', 'searching')
    expect(screen.queryByText('whatever the agent says')).not.toBeInTheDocument()
  })

  it('reports no step before the first one has started', () => {
    render(<ProgressBar />)
    running('compare three laptops')
    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuemin', '0')
    expect(bar).toHaveAttribute('aria-valuemax', String(STEP_ORDER.length))
    expect(bar).toHaveAttribute('aria-valuenow', '0')
    expect(bar).toHaveAccessibleName()
  })

  it.each(STEP_ORDER.map((step, index) => [step, index + 1] as const))(
    'reports step %s as number %i of the steps, in their order',
    (step, number) => {
      render(<ProgressBar />)
      running('compare three laptops', step)
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(number))
    },
  )

  it('follows the task from step to step', () => {
    render(<ProgressBar />)
    const id = running('compare three laptops', 'reading')
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1')
    act(() => tasks().update(id, { step: 'comparing' }))
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '3')
  })

  it('marks the steps done, the one in progress and the ones to come', () => {
    const { container } = render(<ProgressBar />)
    running('compare three laptops', 'comparing')
    const marks = [...container.querySelectorAll('[data-step]')].map((mark) => mark.getAttribute('data-step'))
    expect(marks).toEqual(['done', 'done', 'now', 'next'])
  })

  it('cancels the running task with the ✕', async () => {
    render(<ProgressBar />)
    running('compare three laptops')
    await userEvent.click(screen.getByRole('button', { name: '작업 취소' }))
    expect(cancelActive).toHaveBeenCalledTimes(1)
  })

  it('keeps the ✕ reachable as a button of its own, outside the progress indicator', () => {
    render(<ProgressBar />)
    running('compare three laptops')
    expect(screen.getByRole('progressbar')).not.toContainElement(screen.getByRole('button', { name: '작업 취소' }))
  })
})
