import { Component, type CSSProperties, type ReactNode } from 'react'
import { tokens } from '../theme/tokens'

export const SCENE_ERROR_MESSAGE = '3D 화면을 불러오지 못했어요'

/**
 * Where the results are without a character to hand them over: in the tasks
 * panel. Its button in the dock shows an icon and is announced by this name.
 */
export const SCENE_ERROR_HINT = "결과는 오른쪽 아래 '작업 목록' 버튼을 눌러 열 수 있어요."

const fallbackStyle: CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  padding: 24,
  boxSizing: 'border-box',
  textAlign: 'center',
  background: tokens.bg,
  color: tokens.black,
  fontSize: 16,
}

const lineStyle: CSSProperties = { margin: 0 }

/** The notice shown where the 3D scene would be when it cannot be drawn. */
export function SceneFallback() {
  return (
    <div role="alert" style={fallbackStyle}>
      <p style={lineStyle}>{SCENE_ERROR_MESSAGE}</p>
      <p style={lineStyle}>{SCENE_ERROR_HINT}</p>
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
 * Replaces the 3D scene with a notice when anything inside it throws while it
 * is rendered (a failed model download, say), so the rest of the page keeps
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
