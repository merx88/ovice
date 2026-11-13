import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTasks } from '../store/tasks'
import { Dock } from './Dock'
import { showComingSoon } from './toast'

vi.mock('./toast', () => ({ showComingSoon: vi.fn(), onComingSoon: vi.fn(() => () => {}) }))

const chat = () => screen.getByRole('button', { name: '채팅' })
const tasksButton = () => screen.getByRole('button', { name: '작업 목록' })
const libraryButton = () => screen.getByRole('button', { name: '라이브러리' })
const tasksPanel = () => screen.queryByRole('region', { name: '작업 목록' })
const libraryPanel = () => screen.queryByRole('region', { name: '라이브러리' })

beforeEach(() => {
  localStorage.clear()
  useTasks.setState({ tasks: [], activeId: null, viewingId: null })
  vi.mocked(showComingSoon).mockClear()
})

describe('Dock', () => {
  it('shows three named buttons and no panel', () => {
    render(<Dock />)
    expect(chat()).toBeInTheDocument()
    expect(tasksButton()).toHaveAttribute('aria-expanded', 'false')
    expect(libraryButton()).toHaveAttribute('aria-expanded', 'false')
    expect(tasksPanel()).not.toBeInTheDocument()
    expect(libraryPanel()).not.toBeInTheDocument()
  })

  it('answers the chat button with the coming-soon notice', async () => {
    render(<Dock />)
    await userEvent.click(chat())
    expect(showComingSoon).toHaveBeenCalledTimes(1)
    expect(tasksPanel()).not.toBeInTheDocument()
    expect(libraryPanel()).not.toBeInTheDocument()
  })

  it('opens the tasks panel and marks its button as the open one', async () => {
    render(<Dock />)
    await userEvent.click(tasksButton())
    expect(tasksPanel()).toBeInTheDocument()
    expect(tasksButton()).toHaveAttribute('aria-expanded', 'true')
    expect(tasksButton()).toHaveAttribute('aria-controls', tasksPanel()!.id)
    expect(libraryButton()).toHaveAttribute('aria-expanded', 'false')
    expect(showComingSoon).not.toHaveBeenCalled()
  })

  it('opens the library panel and marks its button as the open one', async () => {
    render(<Dock />)
    await userEvent.click(libraryButton())
    expect(libraryPanel()).toBeInTheDocument()
    expect(libraryButton()).toHaveAttribute('aria-expanded', 'true')
    expect(libraryButton()).toHaveAttribute('aria-controls', libraryPanel()!.id)
    expect(tasksButton()).toHaveAttribute('aria-expanded', 'false')
  })

  it('shows one panel at a time', async () => {
    render(<Dock />)
    await userEvent.click(tasksButton())
    await userEvent.click(libraryButton())
    expect(tasksPanel()).not.toBeInTheDocument()
    expect(libraryPanel()).toBeInTheDocument()
    expect(tasksButton()).toHaveAttribute('aria-expanded', 'false')
    expect(libraryButton()).toHaveAttribute('aria-expanded', 'true')
  })

  it('closes a panel when its button is pressed again', async () => {
    render(<Dock />)
    await userEvent.click(libraryButton())
    await userEvent.click(libraryButton())
    expect(libraryPanel()).not.toBeInTheDocument()
    expect(libraryButton()).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes the panel on Escape and gives the focus back to its button', async () => {
    render(<Dock />)
    await userEvent.click(tasksButton())
    await userEvent.keyboard('{Escape}')
    expect(tasksPanel()).not.toBeInTheDocument()
    expect(tasksButton()).toHaveFocus()
  })

  it('closes the panel when something outside it is pressed', async () => {
    render(
      <>
        <button type="button">somewhere else</button>
        <Dock />
      </>,
    )
    await userEvent.click(libraryButton())
    await userEvent.click(screen.getByRole('button', { name: 'somewhere else' }))
    expect(libraryPanel()).not.toBeInTheDocument()
  })

  it('stays open when something inside the panel is pressed', async () => {
    render(<Dock />)
    await userEvent.click(libraryButton())
    await userEvent.click(screen.getByRole('button', { name: /Search library/ }))
    expect(libraryPanel()).toBeInTheDocument()
  })

  it('moves the focus into the panel when it opens, so the keyboard continues there', async () => {
    render(<Dock />)
    tasksButton().focus()
    await userEvent.keyboard('{Enter}')
    expect(tasksPanel()).toHaveFocus()
  })

  it('leaves the panel open while a dialog is on top of it', async () => {
    render(
      <>
        <Dock />
        <div data-modal="">
          <div role="dialog" aria-modal="true" aria-label="a dialog">
            <button type="button">inside the dialog</button>
          </div>
        </div>
      </>,
    )
    await userEvent.click(tasksButton())
    await userEvent.click(screen.getByRole('button', { name: 'inside the dialog' }))
    expect(tasksPanel()).toBeInTheDocument()

    // An Escape that the dialog has already taken is not the panel's.
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    escape.preventDefault()
    act(() => void document.body.dispatchEvent(escape))
    expect(tasksPanel()).toBeInTheDocument()
  })

  it('ignores other keys', async () => {
    render(<Dock />)
    await userEvent.click(tasksButton())
    fireEvent.keyDown(document.body, { key: 'a' })
    expect(tasksPanel()).toBeInTheDocument()
  })

  it('stops listening to the page once the panel is closed and when it goes away', async () => {
    const add = vi.spyOn(document, 'addEventListener')
    const remove = vi.spyOn(document, 'removeEventListener')
    const { unmount } = render(<Dock />)
    await userEvent.click(tasksButton())
    await userEvent.click(tasksButton())
    await userEvent.click(libraryButton())
    unmount()
    const added = add.mock.calls.filter(([type]) => type === 'keydown' || type === 'pointerdown').length
    const removed = remove.mock.calls.filter(([type]) => type === 'keydown' || type === 'pointerdown').length
    expect(added).toBeGreaterThan(0)
    expect(removed).toBe(added)
    add.mockRestore()
    remove.mockRestore()
  })

  it('reaches the panel before the dock, in the order they are on the screen', async () => {
    render(<Dock />)
    await userEvent.click(libraryButton())
    const all = screen.getAllByRole('button')
    expect(all.indexOf(screen.getByRole('button', { name: /Search library/ }))).toBeLessThan(all.indexOf(chat()))
    expect(all.slice(-3)).toEqual([chat(), tasksButton(), libraryButton()])
  })
})
