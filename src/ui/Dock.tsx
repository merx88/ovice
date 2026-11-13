import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import { LIBRARY_PANEL_ID, LibraryPanel } from './LibraryPanel'
import { TASKS_PANEL_ID, TasksPanel } from './TasksPanel'
import { showComingSoon } from './toast'
import './dock.css'

type PanelName = 'tasks' | 'library'

const PANEL_IDS: Record<PanelName, string> = { tasks: TASKS_PANEL_ID, library: LIBRARY_PANEL_ID }

/**
 * The three round buttons at the bottom right and the panel that two of them
 * open above the dock. One panel at a time; Escape or a press anywhere else
 * closes it.
 */
export function Dock() {
  const [open, setOpen] = useState<PanelName | null>(null)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open === null) return
    // The keyboard continues inside the panel that has just opened.
    document.getElementById(PANEL_IDS[open])?.focus({ preventScroll: true })

    const onKeyDown = (event: KeyboardEvent) => {
      // An Escape that something on top of the panel has taken (a dialog) is not ours.
      if (event.key !== 'Escape' || event.defaultPrevented) return
      root.current?.querySelector<HTMLElement>('[aria-expanded="true"]')?.focus()
      setOpen(null)
    }
    const onPointerDown = (event: Event) => {
      const target = event.target
      if (!(target instanceof Element) || root.current?.contains(target)) return
      // A dialog lies over the page, not beside the panel: the panel waits underneath it.
      if (target.closest('[data-modal]')) return
      setOpen(null)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  const toggle = (panel: PanelName) => setOpen((current) => (current === panel ? null : panel))
  const expands = (panel: PanelName) => ({
    'aria-expanded': open === panel,
    'aria-controls': open === panel ? PANEL_IDS[panel] : undefined,
    onClick: () => toggle(panel),
  })

  return (
    <div className="corner" ref={root}>
      {/* Before the dock, as on the screen: the panel stands above it. */}
      {open === 'tasks' && <TasksPanel />}
      {open === 'library' && <LibraryPanel />}
      <div className="dock" role="group" aria-label="바로가기">
        <button type="button" className="dock__button" aria-label="채팅" onClick={showComingSoon}>
          <Icon name="chat" />
        </button>
        <button type="button" className="dock__button" aria-label="작업 목록" {...expands('tasks')}>
          <Icon name="tasks" size={25} />
        </button>
        <button type="button" className="dock__button" aria-label="라이브러리" {...expands('library')}>
          <Icon name="library" />
        </button>
      </div>
    </div>
  )
}
