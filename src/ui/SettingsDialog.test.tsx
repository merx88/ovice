import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSettings } from '../store/settings'
import { SettingsDialog } from './SettingsDialog'

const NOT_READY = '실제 모드는 준비 중이에요. 프로토타입 모드로 계속할게요.'

const prototype = () => screen.getByRole('radio', { name: '프로토타입' })
const real = () => screen.getByRole('radio', { name: '실제 (준비 중)' })
const parallax = () => screen.getByRole('switch', { name: '카메라 시차 효과' })
const reduceMotion = () => screen.getByRole('switch', { name: '애니메이션 줄이기' })

beforeEach(() => {
  localStorage.clear()
  useSettings.setState({ mode: 'prototype', parallax: true, reduceMotion: false })
})

describe('SettingsDialog: the agent mode', () => {
  it('offers the two modes as one group, with the prototype chosen', () => {
    render(<SettingsDialog onClose={() => {}} />)
    const group = screen.getByRole('radiogroup', { name: '에이전트 모드' })
    expect(within(group).getAllByRole('radio')).toEqual([prototype(), real()])
    expect(prototype()).toBeChecked()
    expect(real()).not.toBeChecked()
    expect(screen.queryByText(NOT_READY)).not.toBeInTheDocument()
  })

  it('says that the real mode is not ready and stays on the prototype', async () => {
    const setMode = vi.spyOn(useSettings.getState(), 'setMode')
    render(<SettingsDialog onClose={() => {}} />)
    await userEvent.click(real())

    expect(setMode).toHaveBeenCalledWith('real')
    expect(screen.getByRole('status')).toHaveTextContent(NOT_READY)
    expect(prototype()).toBeChecked()
    expect(real()).not.toBeChecked()
    expect(useSettings.getState().mode).toBe('prototype')
    setMode.mockRestore()
  })

  it('says so as well when the real mode is chosen with the keyboard', async () => {
    render(<SettingsDialog onClose={() => {}} />)
    prototype().focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('status')).toHaveTextContent(NOT_READY)
    expect(prototype()).toBeChecked()
    expect(useSettings.getState().mode).toBe('prototype')
  })

  it('takes the notice away again when the prototype is chosen', async () => {
    render(<SettingsDialog onClose={() => {}} />)
    await userEvent.click(real())
    await userEvent.click(prototype())
    expect(screen.queryByText(NOT_READY)).not.toBeInTheDocument()
    expect(prototype()).toBeChecked()
  })
})

describe('SettingsDialog: the switches', () => {
  it('shows what the store holds', () => {
    useSettings.setState({ parallax: false, reduceMotion: true })
    render(<SettingsDialog onClose={() => {}} />)
    expect(parallax()).not.toBeChecked()
    expect(reduceMotion()).toBeChecked()
  })

  it('turns the camera parallax off and on in the store', async () => {
    render(<SettingsDialog onClose={() => {}} />)
    expect(parallax()).toBeChecked()
    await userEvent.click(parallax())
    expect(useSettings.getState().parallax).toBe(false)
    expect(parallax()).not.toBeChecked()
    await userEvent.click(parallax())
    expect(useSettings.getState().parallax).toBe(true)
    expect(parallax()).toBeChecked()
  })

  it('turns reduced motion on and off in the store', async () => {
    render(<SettingsDialog onClose={() => {}} />)
    expect(reduceMotion()).not.toBeChecked()
    await userEvent.click(reduceMotion())
    expect(useSettings.getState().reduceMotion).toBe(true)
    expect(reduceMotion()).toBeChecked()
    await userEvent.click(reduceMotion())
    expect(useSettings.getState().reduceMotion).toBe(false)
  })

  it('works from the keyboard', async () => {
    render(<SettingsDialog onClose={() => {}} />)
    parallax().focus()
    await userEvent.keyboard(' ')
    expect(useSettings.getState().parallax).toBe(false)
  })

  it('follows the store when a setting changes elsewhere', () => {
    render(<SettingsDialog onClose={() => {}} />)
    act(() => useSettings.getState().setReduceMotion(true))
    expect(reduceMotion()).toBeChecked()
  })

  it('keeps the settings for the next visit', async () => {
    render(<SettingsDialog onClose={() => {}} />)
    await userEvent.click(parallax())
    await userEvent.click(reduceMotion())
    expect(JSON.parse(localStorage.getItem('ovice.settings.v1') ?? '{}')).toMatchObject({
      mode: 'prototype',
      parallax: false,
      reduceMotion: true,
    })
  })
})

describe('SettingsDialog: as a dialog', () => {
  it('lies over the page as a dialog named 설정', () => {
    render(<SettingsDialog onClose={() => {}} />)
    const dialog = screen.getByRole('dialog', { name: '설정' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(within(dialog).getByRole('heading', { name: '설정' })).toBeInTheDocument()
  })

  it('closes with the close button, on Escape and when the dimmed page is pressed', async () => {
    const onClose = vi.fn()
    render(<SettingsDialog onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: '닫기' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(2)
    await userEvent.click(screen.getByRole('dialog').parentElement!)
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('does not close when something inside it is pressed', async () => {
    const onClose = vi.fn()
    render(<SettingsDialog onClose={onClose} />)
    await userEvent.click(screen.getByRole('heading', { name: '설정' }))
    await userEvent.click(parallax())
    expect(onClose).not.toHaveBeenCalled()
  })

  it('takes the focus, keeps it inside, and gives it back when it goes away', async () => {
    function Page({ open }: { open: boolean }) {
      return (
        <>
          <button type="button">the gear</button>
          {open && <SettingsDialog onClose={() => {}} />}
          <button type="button">something after</button>
        </>
      )
    }
    const { rerender } = render(<Page open={false} />)
    const gear = screen.getByRole('button', { name: 'the gear' })
    gear.focus()

    rerender(<Page open />)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toContainElement(document.activeElement as HTMLElement)

    const seen = new Set<Element | null>()
    for (let press = 0; press < 10; press += 1) {
      await userEvent.tab()
      expect(dialog).toContainElement(document.activeElement as HTMLElement)
      seen.add(document.activeElement)
    }
    // The close button, the chosen mode (one stop for the group) and the two switches.
    expect(seen.size).toBe(4)
    for (let press = 0; press < 6; press += 1) {
      await userEvent.tab({ shift: true })
      expect(dialog).toContainElement(document.activeElement as HTMLElement)
    }

    rerender(<Page open={false} />)
    expect(gear).toHaveFocus()
  })

  it('names every control', () => {
    render(<SettingsDialog onClose={() => {}} />)
    const dialog = screen.getByRole('dialog')
    for (const control of [
      ...within(dialog).getAllByRole('button'),
      ...within(dialog).getAllByRole('radio'),
      ...within(dialog).getAllByRole('switch'),
    ]) {
      expect(control).toHaveAccessibleName()
    }
    for (const icon of dialog.querySelectorAll('svg')) expect(icon).toHaveAttribute('aria-hidden', 'true')
  })
})
