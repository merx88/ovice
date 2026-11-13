import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cancelActive } from '../agent/orchestrator'
import { useSettings } from '../store/settings'
import { useTasks } from '../store/tasks'
import { Overlay } from './Overlay'

// The whole interface with the real stores and the real (mock) agent, and no 3D scene anywhere:
// everything here has to work where the scene cannot be drawn.

const PROMPT = 'compare three laptops'
/** The mock agent's four steps take 13.5 s. */
const RUN_MS = 13_500

const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) })
/** Lets this much of the agent's time pass at once. */
const pass = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))

beforeEach(() => {
  // The clock is the test's to move, and it also keeps ticking by itself, which the testing library waits on.
  vi.useFakeTimers({ shouldAdvanceTime: true })
  localStorage.clear()
  useTasks.setState({ tasks: [], activeId: null, viewingId: null })
  useSettings.setState({ mode: 'prototype', parallax: true, reduceMotion: false })
})

afterEach(() => {
  act(() => cancelActive())
  vi.useRealTimers()
})

describe('Overlay', () => {
  it('takes a prompt through to a result that can be read again from the tasks panel', async () => {
    render(<Overlay />)
    await user.type(screen.getByRole('textbox'), `${PROMPT}{Enter}`)

    // Running: the progress pill stands in for the prompt panel and counts the steps.
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getByText(PROMPT)).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1')
    await pass(2_600)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2')

    // While it runs, the tasks panel shows it as in progress, with nothing to open.
    await user.click(screen.getByRole('button', { name: '작업 목록' }))
    const panel = screen.getByRole('region', { name: '작업 목록' })
    expect(within(panel).getByText('진행 중')).toBeInTheDocument()
    expect(within(panel).queryByRole('button')).not.toBeInTheDocument()

    // Done: the prompt panel is back, empty, and the task can be opened.
    await pass(RUN_MS)
    expect(screen.getByRole('textbox')).toHaveValue('')
    expect(within(panel).getByText('완료')).toBeInTheDocument()
    const row = within(panel).getByRole('button', { name: new RegExp(PROMPT) })
    await user.click(row)

    const viewer = screen.getByRole('dialog', { name: PROMPT })
    expect(within(viewer).getAllByText('예시 결과물').length).toBeGreaterThan(0)
    expect(within(viewer).getByRole('heading', { name: '요약' })).toBeInTheDocument()

    // Closing the document leaves the panel as it was, with the focus back on the row.
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(useTasks.getState().viewingId).toBeNull()
    expect(screen.getByRole('region', { name: '작업 목록' })).toBeInTheDocument()
    expect(row).toHaveFocus()

    // One more Escape closes the panel.
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('region', { name: '작업 목록' })).not.toBeInTheDocument()
  })

  it('stops a task with the ✕ and is ready for the next prompt at once', async () => {
    render(<Overlay />)
    await user.type(screen.getByRole('textbox'), `${PROMPT}{Enter}`)
    await pass(3_000)
    await user.click(screen.getByRole('button', { name: '작업 취소' }))

    expect(screen.getByRole('textbox')).toHaveValue('')
    expect(useTasks.getState().tasks[0].status).toBe('cancelled')
    await pass(RUN_MS)
    expect(useTasks.getState().tasks[0].status).toBe('cancelled')

    await user.click(screen.getByRole('button', { name: '작업 목록' }))
    expect(screen.getByText('취소됨')).toBeInTheDocument()
  })

  it('makes one task of a prompt sent twice in a row', async () => {
    render(<Overlay />)
    await user.type(screen.getByRole('textbox'), `${PROMPT}{Enter}{Enter}`)
    expect(useTasks.getState().tasks).toHaveLength(1)
  })

  it('opens the settings from the gear and gives the focus back to it afterwards', async () => {
    render(<Overlay />)
    const gear = screen.getByRole('button', { name: '설정' })
    await user.click(gear)
    const dialog = screen.getByRole('dialog', { name: '설정' })
    expect(dialog).toContainElement(document.activeElement as HTMLElement)

    await user.click(within(dialog).getByRole('button', { name: '닫기' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(gear).toHaveFocus()
  })

  it('stops its own animations when motion is reduced', async () => {
    const { container } = render(<Overlay />)
    expect(container.firstElementChild).not.toHaveClass('ui--still')
    await user.click(screen.getByRole('button', { name: '설정' }))
    await user.click(screen.getByRole('switch', { name: '애니메이션 줄이기' }))
    expect(container.firstElementChild).toHaveClass('ui--still')
  })

  it('answers what is not built yet with one notice', async () => {
    render(<Overlay />)
    for (const name of ['Agents', '알림', '채팅', '파일 첨부']) {
      await user.click(screen.getByRole('button', { name }))
    }
    expect(screen.getAllByText('준비 중인 기능이에요')).toHaveLength(1)
    await pass(2_100)
    expect(screen.queryByText('준비 중인 기능이에요')).not.toBeInTheDocument()
  })

  it('is reached with Tab in the order it is on the screen: top bar, prompt, dock', async () => {
    render(<Overlay />)
    const order: (string | RegExp)[] = [
      'Office',
      'Agents',
      'Projects',
      /Researcher's office/,
      '알림',
      '설정',
      '에이전트에게 맡길 일',
      '파일 첨부',
      /Claude/,
      '보내기',
      '채팅',
      '작업 목록',
      '라이브러리',
    ]
    for (const name of order) {
      await user.tab()
      expect(document.activeElement).toHaveAccessibleName(name)
    }
  })

  it('has one main heading and names its landmarks', () => {
    render(<Overlay />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ovice')
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: '주요 메뉴' })).toBeInTheDocument()
  })
})
