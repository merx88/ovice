// The "coming soon" notice: any part of the interface asks for it here, and
// the one `ComingSoon` on the page shows it.

type Listener = () => void

const listeners = new Set<Listener>()

/**
 * Shows the notice that a feature is not ready yet. Asking again while it is
 * showing keeps the one notice up for longer; it never shows twice.
 */
export function showComingSoon(): void {
  for (const listener of [...listeners]) listener()
}

/**
 * For the notice itself: calls `listener` each time the notice is asked for,
 * until the function returned is called.
 */
export function onComingSoon(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
