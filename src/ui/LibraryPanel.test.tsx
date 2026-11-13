import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LibraryPanel } from './LibraryPanel'
import { showComingSoon } from './toast'

vi.mock('./toast', () => ({ showComingSoon: vi.fn(), onComingSoon: vi.fn(() => () => {}) }))

beforeEach(() => {
  vi.mocked(showComingSoon).mockClear()
})

describe('LibraryPanel', () => {
  it('is a named part of the page', () => {
    render(<LibraryPanel />)
    expect(screen.getByRole('region', { name: '라이브러리' })).toBeInTheDocument()
  })

  it('shows nine example tiles and the search pill', () => {
    render(<LibraryPanel />)
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(10)
    expect(buttons[9]).toHaveTextContent('Search library')
  })

  it('names every tile, each differently, and hides the drawings from screen readers', () => {
    const { container } = render(<LibraryPanel />)
    const names = screen.getAllByRole('button').map((button) => {
      expect(button).toHaveAccessibleName()
      return button.getAttribute('aria-label') ?? button.textContent
    })
    expect(new Set(names).size).toBe(10)
    for (const drawing of container.querySelectorAll('svg')) expect(drawing).toHaveAttribute('aria-hidden', 'true')
  })

  it('draws the tiles itself: no image is loaded from anywhere', () => {
    const { container } = render(<LibraryPanel />)
    expect(container.querySelector('img, image, [href], [src]')).toBeNull()
  })

  it('answers every tile with the coming-soon notice', async () => {
    render(<LibraryPanel />)
    for (const tile of screen.getAllByRole('button').slice(0, 9)) await userEvent.click(tile)
    expect(showComingSoon).toHaveBeenCalledTimes(9)
  })

  it('answers the search pill with the notice too, instead of pretending to search', async () => {
    render(<LibraryPanel />)
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Search library/ }))
    expect(showComingSoon).toHaveBeenCalledTimes(1)
  })
})
