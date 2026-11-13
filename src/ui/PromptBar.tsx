import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { startTask } from '../agent/orchestrator'
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
        rows={1}
        value={text}
        placeholder="무엇을 조사해 드릴까요?"
        aria-label="에이전트에게 맡길 일"
        enterKeyHint="send"
        onChange={(event) => setText(event.target.value)}
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

  return (
    <div className="slot">
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
