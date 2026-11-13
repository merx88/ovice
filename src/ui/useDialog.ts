import { useEffect, useRef, type MouseEvent, type RefObject } from 'react'

/** What Tab stops at. */
const TAB_STOPS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * The keyboard's side of a dialog that lies over the page: the focus moves
 * into the dialog when it opens, stays inside for as long as it is open, and
 * returns to where it was when it closes; Escape closes it.
 *
 * Put the ref on the dialog's element (which needs `tabIndex={-1}`) and render
 * the component only while the dialog is open.
 */
export function useDialog<T extends HTMLElement>(onClose: () => void): RefObject<T> {
  const dialog = useRef<T>(null)
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  })

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    const cameFrom = document.activeElement
    element.focus({ preventScroll: true })

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Taken here, on its way down the page, so that nothing under the dialog closes as well.
        event.preventDefault()
        event.stopPropagation()
        close.current()
        return
      }
      if (event.key !== 'Tab') return

      const stops = [...element.querySelectorAll<HTMLElement>(TAB_STOPS)]
      if (stops.length === 0) {
        event.preventDefault()
        return
      }
      const first = stops[0]
      const last = stops[stops.length - 1]
      const at = document.activeElement
      const outside = !element.contains(at)
      // Leaving over either end comes back in at the other one.
      if (event.shiftKey ? at === first || at === element || outside : at === last || outside) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      if (cameFrom instanceof HTMLElement && cameFrom.isConnected) cameFrom.focus({ preventScroll: true })
    }
  }, [])

  return dialog
}

/**
 * For the dimmed page around a dialog: props that close the dialog when that
 * page is pressed. A press counts only if it both starts and ends there, so
 * that selecting text and letting go outside the dialog does not close it.
 */
export function useBackdropClose(onClose: () => void) {
  const pressedOnBackdrop = useRef(false)
  return {
    onPointerDown: (event: MouseEvent) => {
      pressedOnBackdrop.current = event.target === event.currentTarget
    },
    onClick: (event: MouseEvent) => {
      if (event.target === event.currentTarget && pressedOnBackdrop.current) onClose()
    },
  }
}
