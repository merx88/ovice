import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { startTask } from '../agent/orchestrator'
import { useChatActivity } from '../store/chatActivity'
import { useTasks } from '../store/tasks'
import { Icon } from './Icon'
import { ProgressBar, RetryBar } from './ProgressBar'
import { showComingSoon } from './toast'
import './prompt.css'

/** The key code browsers report for a key press that an input method is still working on. */
const IME_KEY_CODE = 229

/**
 * The id of the task that this page watched run and then fail, until
 * `dismiss` is called or another task starts. A failure that was already in
 * the store when the page loaded never shows up here.
 */
function useFailedHere(): [failedId: string | null, dismiss: () => void] {
  const [failedId, setFailedId] = useState<string | null>(null)

  useEffect(
    () =>
      useTasks.subscribe((state, previous) => {
        if (state.activeId !== null) {
          setFailedId(null)
        } else if (previous.activeId !== null) {
          const ended = state.tasks.find((task) => task.id === previous.activeId)
          setFailedId(ended?.status === 'failed' ? ended.id : null)
        }
      }),
    [],
  )

  return [failedId, () => setFailedId(null)]
}

/** Marks what takes the focus when it replaces whatever had the focus in the slot before. */
const FOCUS_TARGET = '[data-takes-focus]'

/** True on a device whose pointer is a finger: focusing a text field there calls up the on-screen keyboard. */
function hasCoarsePointer(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
}

/**
 * Gives the keyboard's focus to the prompt field, for a part of the page that
 * goes away while it has the focus (the folder the character holds out):
 * without this, the focus would fall back to the top of the page. Not on a
 * device whose pointer is a finger, where it would call up the on-screen
 * keyboard.
 */
export function focusPromptField(): void {
  if (hasCoarsePointer()) return
  document.querySelector<HTMLElement>(`.prompt ${FOCUS_TARGET}`)?.focus({ preventScroll: true })
}

/**
 * Tells whoever watches the chat (the character) that it is being used. Only
 * the field counts: its focus, a press on it and every change of its text.
 */
function reportChatActivity() {
  useChatActivity.getState().report()
}

/** The dark panel the user types a prompt into. */
function PromptForm() {
  const [text, setText] = useState('')
  const field = useRef<HTMLTextAreaElement>(null)

  // The field is as tall as its text, up to the height its stylesheet allows.
  useLayoutEffect(() => {
    const element = field.current
    if (!element) return
    element.style.height = 'auto'
    if (element.scrollHeight > 0) element.style.height = `${element.scrollHeight}px`
  }, [text])

  const send = () => {
    if (text.trim() === '') return
    // The field is emptied only when the prompt was taken; otherwise the text stays to be sent again.
    if (startTask(text)) setText('')
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    send()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return
    // While Korean (or any composed) text is being put together, Enter belongs to the input method.
    if (event.nativeEvent.isComposing || event.keyCode === IME_KEY_CODE) return
    event.preventDefault()
    send()
  }

  return (
    <form className="prompt" aria-label="에이전트에게 요청하기" onSubmit={onSubmit}>
      <textarea
        ref={field}
        className="prompt__field"
        data-takes-focus=""
        rows={1}
        value={text}
        placeholder="무엇을 조사해 드릴까요?"
        aria-label="에이전트에게 맡길 일"
        enterKeyHint="send"
        onFocus={reportChatActivity}
        // A press on a field that already has the focus is no new focus, but it is somebody about to write.
        onPointerDown={reportChatActivity}
        // Every change, also while an input method is still composing a syllable.
        onChange={(event) => {
          reportChatActivity()
          setText(event.target.value)
        }}
        onKeyDown={onKeyDown}
      />
      <div className="prompt__tools">
        <button type="button" className="prompt__plus" aria-label="파일 첨부" onClick={showComingSoon}>
          <Icon name="plus" />
        </button>
        <button type="button" className="chip" onClick={showComingSoon}>
          <Icon name="spark" />
          <span className="chip__name">Claude</span>
          <span className="sr-only"> 모델 선택</span>
          <Icon name="chevronDown" size={13} />
        </button>
        <button type="submit" className="prompt__send" aria-label="보내기">
          <Icon name="arrowUp" size={26} />
        </button>
      </div>
    </form>
  )
}

/**
 * What sits at the bottom centre: the prompt panel; while a task is running,
 * its progress pill; after a task failed in front of the user, the retry pill.
 */
export function PromptBar() {
  const activeId = useTasks((state) => state.activeId)
  const [failedId, dismissFailed] = useFailedHere()
  const failed = useTasks((state) =>
    failedId === null ? undefined : state.tasks.find((task) => task.id === failedId && task.status === 'failed'),
  )
  const showing = activeId !== null ? 'progress' : failed ? 'retry' : 'form'

  const slot = useRef<HTMLDivElement>(null)
  /** Whether the focus was inside the slot when it was last heard of. Swapping the slot's content removes it silently. */
  const focusWasInside = useRef(false)

  // When the part that had the focus is replaced, the focus goes to the part that replaced it instead of
  // being lost: to the pill itself (never to a button on it, which a repeated Enter would press), and back
  // to the field afterwards — except where that would call up an on-screen keyboard nobody asked for.
  useLayoutEffect(() => {
    if (!focusWasInside.current || slot.current?.contains(document.activeElement)) return
    if (document.activeElement !== document.body && document.activeElement !== null) return
    if (showing === 'form' && hasCoarsePointer()) {
      focusWasInside.current = false
      return
    }
    slot.current?.querySelector<HTMLElement>(FOCUS_TARGET)?.focus({ preventScroll: true })
  }, [showing])

  return (
    <div
      ref={slot}
      className="slot"
      onFocus={() => {
        focusWasInside.current = true
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) focusWasInside.current = false
      }}
    >
      {activeId !== null ? (
        <ProgressBar />
      ) : failed ? (
        <RetryBar task={failed} onDismiss={dismissFailed} />
      ) : (
        <PromptForm />
      )}
    </div>
  )
}
