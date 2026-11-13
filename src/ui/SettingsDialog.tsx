import { useId, useState } from 'react'
import { useSettings, type AgentMode } from '../store/settings'
import { Icon } from './Icon'
import { useBackdropClose, useDialog } from './useDialog'
import './dialog.css'

const NOT_READY = '실제 모드는 준비 중이에요. 프로토타입 모드로 계속할게요.'

const MODES: { value: AgentMode; label: string }[] = [
  { value: 'prototype', label: '프로토타입' },
  { value: 'real', label: '실제 (준비 중)' },
]

export interface SettingsDialogProps {
  /** Called when the dialog asks to be closed: its close button, Escape, a press on the page around it. */
  onClose(): void
}

interface SwitchRowProps {
  label: string
  hint: string
  checked: boolean
  onChange(checked: boolean): void
}

function SwitchRow({ label, hint, checked, onChange }: SwitchRowProps) {
  const hintId = useId()
  return (
    <label className="switch">
      <span className="switch__text">
        <span className="switch__label">{label}</span>
        <span id={hintId} className="switch__hint">
          {hint}
        </span>
      </span>
      <input
        type="checkbox"
        role="switch"
        className="switch__input"
        aria-label={label}
        aria-describedby={hintId}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="switch__track" aria-hidden="true" />
    </label>
  )
}

/** The settings: which agent answers, and how much the page moves. Render it only while it is open. */
export function SettingsDialog({ onClose }: SettingsDialogProps) {
  const mode = useSettings((state) => state.mode)
  const parallax = useSettings((state) => state.parallax)
  const reduceMotion = useSettings((state) => state.reduceMotion)
  /** True after a mode was asked for that the store did not take. */
  const [notReady, setNotReady] = useState(false)

  const dialog = useDialog<HTMLDivElement>(onClose)
  const backdrop = useBackdropClose(onClose)
  const titleId = useId()
  const modeId = useId()

  const chooseMode = (next: AgentMode) => setNotReady(!useSettings.getState().setMode(next).ok)

  return (
    <div className="modal" data-modal="" {...backdrop}>
      <div ref={dialog} className="dialog dialog--settings" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header className="dialog__head">
          <h2 id={titleId} className="dialog__title">
            설정
          </h2>
          <button type="button" className="dialog__close" aria-label="닫기" onClick={onClose}>
            <Icon name="close" size={20} />
          </button>
        </header>

        <div className="settings">
          <section className="settings__group">
            <h3 id={modeId} className="settings__label">
              에이전트 모드
            </h3>
            <div className="segments" role="radiogroup" aria-labelledby={modeId}>
              {MODES.map(({ value, label }) => (
                <label key={value} className="segment">
                  <input
                    type="radio"
                    className="segment__input"
                    name="agent-mode"
                    value={value}
                    checked={mode === value}
                    onChange={() => chooseMode(value)}
                    // Pressing the mode that is already chosen changes nothing, but it does answer the notice.
                    onClick={() => mode === value && setNotReady(false)}
                  />
                  <span className="segment__face">{label}</span>
                </label>
              ))}
            </div>
            {/* Always there, so that screen readers notice the text arriving in it. */}
            <p className="settings__notice" role="status">
              {notReady ? NOT_READY : ''}
            </p>
          </section>

          <section className="settings__group">
            <SwitchRow
              label="카메라 시차 효과"
              hint="마우스를 따라 화면이 살짝 움직여요."
              checked={parallax}
              onChange={(checked) => useSettings.getState().setParallax(checked)}
            />
            <SwitchRow
              label="애니메이션 줄이기"
              hint="걷는 동작과 화면 전환 효과를 건너뛰어요."
              checked={reduceMotion}
              onChange={(checked) => useSettings.getState().setReduceMotion(checked)}
            />
          </section>
        </div>
      </div>
    </div>
  )
}
