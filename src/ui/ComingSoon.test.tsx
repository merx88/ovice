import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ComingSoon } from './ComingSoon'
import { showComingSoon } from './toast'

const NOTICE = '준비 중인 기능이에요'

describe('ComingSoon', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('says nothing until it is asked to', () => {
    render(<ComingSoon />)
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('shows the notice when a feature that is not ready is used', () => {
    render(<ComingSoon />)
    act(() => showComingSoon())
    expect(screen.getByRole('status')).toHaveTextContent(NOTICE)
  })

  it('hides the notice after about two seconds', () => {
    render(<ComingSoon />)
    act(() => showComingSoon())
    act(() => void vi.advanceTimersByTime(1900))
    expect(screen.getByRole('status')).toHaveTextContent(NOTICE)
    act(() => void vi.advanceTimersByTime(200))
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('starts counting again when asked again, instead of showing a second notice', () => {
    render(<ComingSoon />)
    act(() => showComingSoon())
    act(() => void vi.advanceTimersByTime(1500))
    act(() => showComingSoon())
    act(() => void vi.advanceTimersByTime(1500))
    expect(screen.getAllByText(NOTICE)).toHaveLength(1)
    act(() => void vi.advanceTimersByTime(600))
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument()
  })

  it('ignores what was asked before it was on the page', () => {
    showComingSoon()
    render(<ComingSoon />)
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('leaves no timer behind when it goes away', () => {
    const { unmount } = render(<ComingSoon />)
    act(() => showComingSoon())
    unmount()
    expect(vi.getTimerCount()).toBe(0)
    // Nobody is listening any more: asking again does nothing and throws nothing.
    expect(() => showComingSoon()).not.toThrow()
    expect(vi.getTimerCount()).toBe(0)
  })
})
