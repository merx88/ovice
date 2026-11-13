import { useEffect, useState } from 'react'
import { onComingSoon } from './toast'
import './ui.css'

const NOTICE = '준비 중인 기능이에요'
/** How long the notice stays up after it was last asked for. */
const VISIBLE_MS = 2000

/** The notice shown by `showComingSoon()`. Put one on the page. */
export function ComingSoon() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const stopListening = onComingSoon(() => {
      setVisible(true)
      clearTimeout(timer)
      timer = setTimeout(() => setVisible(false), VISIBLE_MS)
    })
    return () => {
      stopListening()
      clearTimeout(timer)
    }
  }, [])

  return (
    // The region is always there, so that screen readers notice the text arriving in it.
    <div className="toast" role="status" aria-live="polite">
      {visible && <span className="toast__notice">{NOTICE}</span>}
    </div>
  )
}
