import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cancelActive, retry, startTask } from '../agent/orchestrator'
import { useTasks, type Task } from '../store/tasks'
import { ComingSoon } from './ComingSoon'
import { PromptBar } from './PromptBar'

vi.mock('../agent/orchestrator', () => ({ startTask: vi.fn(), cancelActive: vi.fn(), retry: vi.fn() }))

const PLACEHOLDER = '무엇을 조사해 드릴까요?'
const NOTICE = '준비 중인 기능이에요'

const field = () => screen.getByRole<HTMLTextAreaElement>('textbox')
const tasks = () => useTasks.getState()

/** Makes the orchestrator's stand-ins behave like the real thing as far as the tasks store shows. */
function orchestrate() {
  vi.mocked(startTask).mockImplementation((prompt) =>
    prompt.trim() === '' || tasks().activeId !== null ? null : tasks().create(prompt.trim()),
  )
  vi.mocked(cancelActive).mockImplementation(() => {
    const id = tasks().activeId
    if (id !== null) tasks().update(id, { status: 'cancelled', finishedAt: Date.now() })
  })
  vi.mocked(retry).mockImplementation((id) => {
    const failed = tasks().tasks.find((task) => task.id === id)
    return failed?.status === 'failed' ? startTask(failed.prompt) : null
  })
}

/** A task as the store holds it once it has ended. */
function ended(status: Task['status'], prompt = 'an earlier prompt'): Task {
  return {
    id: `stored-${status}`,
    prompt,
    status,
    step: 'writing',
    message: 'Writing up the report...',
    result: null,
    error: status === 'failed' ? 'Something went wrong.' : null,
    createdAt: 1,
    finishedAt: 2,
  }
}

/** Starts a task the way the page does and returns its id. */
function start(prompt: string): string {
  let id = ''
  act(() => {
    id = tasks().create(prompt).id
  })
  return id
}

beforeEach(() => {
  localStorage.clear()
  useTasks.setState({ tasks: [], activeId: null, viewingId: null })
  vi.mocked(startTask).mockReset()
  vi.mocked(cancelActive).mockReset()
  vi.mocked(retry).mockReset()
  orchestrate()
})

describe('PromptBar: sending', () => {
  it('asks what to look into', () => {
    render(<PromptBar />)
    expect(field()).toHaveAttribute('placeholder', PLACEHOLDER)
    expect(field()).toHaveAccessibleName()
  })

  it.each(['', '   ', '\n \n'])('does not send blank input (%j) on Enter', async (blank) => {
    render(<PromptBar />)
    fireEvent.change(field(), { target: { value: blank } })
    await userEvent.type(field(), '{Enter}')
    expect(startTask).not.toHaveBeenCalled()
  })

  it('sends the text on Enter, once, and leaves the field empty', async () => {
    // The orchestrator takes the prompt, but the store is left alone so the field stays on the page.
    vi.mocked(startTask).mockReturnValue(ended('done'))
    render(<PromptBar />)
    await userEvent.type(field(), 'compare three laptops{Enter}')
    expect(startTask).toHaveBeenCalledTimes(1)
    expect(startTask).toHaveBeenCalledWith('compare three laptops')
    expect(field()).toHaveValue('')
  })

  it('keeps the text when the orchestrator does not take it', async () => {
    vi.mocked(startTask).mockReturnValue(null)
    render(<PromptBar />)
    await userEvent.type(field(), 'compare three laptops{Enter}')
    expect(startTask).toHaveBeenCalledTimes(1)
    expect(field()).toHaveValue('compare three laptops')
  })

  it('starts a new line on Shift+Enter instead of sending', async () => {
    render(<PromptBar />)
    await userEvent.type(field(), 'first{Shift>}{Enter}{/Shift}second')
    expect(startTask).not.toHaveBeenCalled()
    expect(field()).toHaveValue('first\nsecond')
  })

  it('sends with the arrow button', async () => {
    render(<PromptBar />)
    await userEvent.type(field(), 'compare three laptops')
    await userEvent.click(screen.getByRole('button', { name: '보내기' }))
    expect(startTask).toHaveBeenCalledTimes(1)
    expect(startTask).toHaveBeenCalledWith('compare three laptops')
  })

  it('does nothing when the arrow button is pressed on blank input', async () => {
    render(<PromptBar />)
    await userEvent.click(screen.getByRole('button', { name: '보내기' }))
    expect(startTask).not.toHaveBeenCalled()
  })

  it.each([
    ['the event says a composition is in progress', { isComposing: true }],
    ['the key code is the one input methods report', { keyCode: 229 }],
  ])('does not send on Enter while Korean text is being composed: %s', (_case, composing) => {
    render(<PromptBar />)
    fireEvent.change(field(), { target: { value: '한' } })
    fireEvent.keyDown(field(), { key: 'Enter', ...composing })
    expect(startTask).not.toHaveBeenCalled()
    expect(field()).toHaveValue('한')

    // The Enter after the composition has ended sends.
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(startTask).toHaveBeenCalledTimes(1)
    expect(startTask).toHaveBeenCalledWith('한')
  })

  it('makes one task out of Enter pressed twice in a row', async () => {
    const actual = await vi.importActual<typeof import('../agent/orchestrator')>('../agent/orchestrator')
    vi.mocked(startTask).mockImplementation(actual.startTask)
    vi.useFakeTimers()
    try {
      render(<PromptBar />)
      fireEvent.change(field(), { target: { value: 'compare three laptops' } })
      const input = field()
      // Both presses arrive before the page has drawn anything in between.
      act(() => {
        fireEvent.keyDown(input, { key: 'Enter' })
        fireEvent.keyDown(input, { key: 'Enter' })
      })
      expect(tasks().tasks).toHaveLength(1)
      expect(tasks().tasks[0].prompt).toBe('compare three laptops')
      expect(screen.getByRole('progressbar')).toBeInTheDocument()
    } finally {
      act(() => actual.cancelActive())
      vi.useRealTimers()
    }
  })

  it('answers the attach button and the model chip with the coming-soon notice', async () => {
    render(
      <>
        <PromptBar />
        <ComingSoon />
      </>,
    )
    const notice = () => screen.getByRole('status')
    expect(notice()).toBeEmptyDOMElement()
    await userEvent.click(screen.getByRole('button', { name: '파일 첨부' }))
    expect(notice()).toHaveTextContent(NOTICE)
    expect(startTask).not.toHaveBeenCalled()
  })

  it('shows the model chip as the reference does and answers it with the notice', async () => {
    render(
      <>
        <PromptBar />
        <ComingSoon />
      </>,
    )
    const chip = screen.getByRole('button', { name: /Claude/ })
    expect(chip.textContent?.trim().startsWith('Claude')).toBe(true)
    await userEvent.click(chip)
    expect(screen.getByRole('status')).toHaveTextContent(NOTICE)
    expect(startTask).not.toHaveBeenCalled()
  })

  it('names every button and reaches the controls in the order they are on the screen', async () => {
    render(<PromptBar />)
    for (const button of screen.getAllByRole('button')) expect(button).toHaveAccessibleName()
    await userEvent.tab()
    expect(field()).toHaveFocus()
    for (const name of ['파일 첨부', /Claude/, '보내기']) {
      await userEvent.tab()
      expect(screen.getByRole('button', { name })).toHaveFocus()
    }
  })
})

describe('PromptBar: while a task is running', () => {
  it('shows the progress bar with the prompt in place of the field', async () => {
    render(<PromptBar />)
    await userEvent.type(field(), 'compare three laptops{Enter}')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
    expect(screen.getByText('compare three laptops')).toBeInTheDocument()
  })

  it('picks up a task that is already running when the page shows', () => {
    start('a task from before')
    render(<PromptBar />)
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getByText('a task from before')).toBeInTheDocument()
  })

  it('cancels the task with the ✕ and is back at once with an empty field', async () => {
    render(<PromptBar />)
    await userEvent.type(field(), 'compare three laptops{Enter}')
    await userEvent.click(screen.getByRole('button', { name: '작업 취소' }))
    expect(cancelActive).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(field()).toHaveValue('')
    expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument()
  })

  it('is back with an empty field when the task is done', async () => {
    render(<PromptBar />)
    await userEvent.type(field(), 'compare three laptops{Enter}')
    act(() => tasks().update(tasks().activeId!, { status: 'done', result: { title: 't', markdown: 'm' } }))
    expect(field()).toHaveValue('')
  })
})

describe('PromptBar: when a task fails', () => {
  it('shows the retry button, which starts the same prompt again', async () => {
    render(<PromptBar />)
    const id = start('compare three laptops')
    act(() => tasks().update(id, { status: 'failed', error: 'Something went wrong.' }))

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getByText('compare three laptops')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }))

    expect(retry).toHaveBeenCalledTimes(1)
    expect(retry).toHaveBeenCalledWith(id)
    // The new attempt is running: its progress is what shows now.
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument()
  })

  it('goes back to the empty field when the failure is dismissed', async () => {
    render(<PromptBar />)
    const id = start('compare three laptops')
    act(() => tasks().update(id, { status: 'failed' }))
    await userEvent.click(screen.getByRole('button', { name: '닫기' }))
    expect(retry).not.toHaveBeenCalled()
    expect(field()).toHaveValue('')
    expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument()
  })

  it('does not bring the retry button back for a failure from an earlier visit', () => {
    useTasks.setState({ tasks: [ended('failed')] })
    render(<PromptBar />)
    expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument()
    expect(field()).toBeInTheDocument()
  })

  it('shows it for a task that fails the moment it starts', () => {
    render(<PromptBar />)
    // Started and failed before the page has drawn it running.
    act(() => {
      const { id } = tasks().create('compare three laptops')
      tasks().update(id, { status: 'failed' })
    })
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument()
  })

  it('keeps the retry button of the failed task when the retry is not taken', async () => {
    vi.mocked(retry).mockReturnValue(null)
    render(<PromptBar />)
    const id = start('compare three laptops')
    act(() => tasks().update(id, { status: 'failed' }))
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument()
  })

  it('forgets the failure once a later task has run', async () => {
    render(<PromptBar />)
    const id = start('compare three laptops')
    act(() => tasks().update(id, { status: 'failed' }))
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    act(() => tasks().update(tasks().activeId!, { status: 'done', result: { title: 't', markdown: 'm' } }))
    expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument()
    expect(field()).toBeInTheDocument()
  })
})

describe('PromptBar: the prompt is shown as the text it is', () => {
  const HOSTILE = '<img src=x onerror=alert(1)> **bold** # heading'

  it('in the progress bar', () => {
    const { container } = render(<PromptBar />)
    start(HOSTILE)
    expect(screen.getByText(HOSTILE)).toBeInTheDocument()
    expect(container.querySelector('img, strong, h1')).toBeNull()
  })

  it('in the retry bar', () => {
    const { container } = render(<PromptBar />)
    const id = start(HOSTILE)
    act(() => tasks().update(id, { status: 'failed' }))
    expect(screen.getByText(HOSTILE)).toBeInTheDocument()
    expect(container.querySelector('img, h1')).toBeNull()
  })
})

afterEach(() => {
  vi.useRealTimers()
})
