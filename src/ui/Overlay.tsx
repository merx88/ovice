import { useState } from 'react'
import { useSettings } from '../store/settings'
import { ComingSoon } from './ComingSoon'
import { TopBar } from './TopBar'
import './ui.css'

/**
 * The whole 2D interface, laid over the 3D office. It needs nothing from the
 * scene, so it also works where the scene cannot be drawn.
 */
export function Overlay() {
  const reduceMotion = useSettings((state) => state.reduceMotion)
  const [, setSettingsOpen] = useState(false)

  return (
    <div className={reduceMotion ? 'ui ui--still' : 'ui'}>
      <h1 className="sr-only">ovice</h1>
      <TopBar onOpenSettings={() => setSettingsOpen(true)} />
      <ComingSoon />
    </div>
  )
}
