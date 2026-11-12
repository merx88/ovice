import { Component, type CSSProperties, type ReactNode } from 'react'
import { tokens } from '../theme/tokens'

export const SCENE_ERROR_MESSAGE = '3D 화면을 불러오지 못했어요'

const fallbackStyle: CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  boxSizing: 'border-box',
  textAlign: 'center',
  background: tokens.bg,
  color: tokens.black,
  fontSize: 16,
}

/** The notice shown where the 3D scene would be when it cannot be drawn. */
export function SceneFallback() {
  return (
    <div role="alert" style={fallbackStyle}>
      {SCENE_ERROR_MESSAGE}
    </div>
  )
}

interface Props {
  children: ReactNode
}

interface State {
  failed: boolean
}

/**
 * Replaces the 3D scene with a notice when anything inside it throws (a
 * failed model download, a lost renderer), so the rest of the page keeps
 * working.
 */
export class SceneErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  render() {
    return this.state.failed ? <SceneFallback /> : this.props.children
  }
}
