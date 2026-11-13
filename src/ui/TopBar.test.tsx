import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { showComingSoon } from './toast'
import { TopBar } from './TopBar'

vi.mock('./toast', () => ({ showComingSoon: vi.fn(), onComingSoon: vi.fn(() => () => {}) }))

describe('TopBar', () => {
  beforeEach(() => {
    vi.mocked(showComingSoon).mockClear()
  })

  it('shows the three tabs with Office as the page the user is on', () => {
    render(<TopBar onOpenSettings={() => {}} />)
    expect(screen.getByRole('button', { name: 'Office' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Agents' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('button', { name: 'Projects' })).not.toHaveAttribute('aria-current')
  })

  it("names the office as the reference does: Researcher's office", () => {
    render(<TopBar onOpenSettings={() => {}} />)
    expect(screen.getByRole('button', { name: /Researcher's office/ })).toBeInTheDocument()
  })

  it.each(['Agents', 'Projects', /Researcher's office/, '알림'])(
    'answers %s with the coming-soon notice',
    async (name) => {
      const onOpenSettings = vi.fn()
      render(<TopBar onOpenSettings={onOpenSettings} />)
      await userEvent.click(screen.getByRole('button', { name }))
      expect(showComingSoon).toHaveBeenCalledTimes(1)
      expect(onOpenSettings).not.toHaveBeenCalled()
    },
  )

  it('opens the settings from the gear, without a notice', async () => {
    const onOpenSettings = vi.fn()
    render(<TopBar onOpenSettings={onOpenSettings} />)
    await userEvent.click(screen.getByRole('button', { name: '설정' }))
    expect(onOpenSettings).toHaveBeenCalledTimes(1)
    expect(showComingSoon).not.toHaveBeenCalled()
  })

  it('does nothing when the tab the user is already on is pressed', async () => {
    const onOpenSettings = vi.fn()
    render(<TopBar onOpenSettings={onOpenSettings} />)
    await userEvent.click(screen.getByRole('button', { name: 'Office' }))
    expect(showComingSoon).not.toHaveBeenCalled()
    expect(onOpenSettings).not.toHaveBeenCalled()
  })

  it('marks the English labels as English on the Korean page', () => {
    render(<TopBar onOpenSettings={() => {}} />)
    for (const name of ['Office', 'Agents', 'Projects']) {
      expect(screen.getByRole('button', { name }).closest('[lang]')).toHaveAttribute('lang', 'en')
    }
    expect(screen.getByText("Researcher's office")).toHaveAttribute('lang', 'en')
    // The Korean names of the icon buttons are not marked as English.
    expect(screen.getByRole('button', { name: '알림' }).closest('[lang]')).toBeNull()
  })

  it('gives every button a name and hides every icon from screen readers', () => {
    const { container } = render(<TopBar onOpenSettings={() => {}} />)
    for (const button of screen.getAllByRole('button')) expect(button).toHaveAccessibleName()
    for (const icon of container.querySelectorAll('svg')) expect(icon).toHaveAttribute('aria-hidden', 'true')
  })

  it('reaches the controls in the order they are on the screen', async () => {
    render(<TopBar onOpenSettings={() => {}} />)
    const order = ['Office', 'Agents', 'Projects', /Researcher's office/, '알림', '설정']
    for (const name of order) {
      await userEvent.tab()
      expect(screen.getByRole('button', { name })).toHaveFocus()
    }
  })
})
