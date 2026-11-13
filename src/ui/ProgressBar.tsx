import { STEP_ORDER } from '../agent/MockRunner'
import { cancelActive, retry } from '../agent/orchestrator'
import { useTasks, type Task } from '../store/tasks'
import { Icon } from './Icon'
import './prompt.css'

/** The ring of step marks is drawn on a square this wide; the disc it lies on is as wide on the screen. */
const RING = { box: 56, radius: 25.5, gapDegrees: 16 } as const

/** A point on the ring, `degrees` clockwise from its top. */
function onRing(degrees: number): string {
  const angle = ((degrees - 90) * Math.PI) / 180
  const x = RING.box / 2 + RING.radius * Math.cos(angle)
  const y = RING.box / 2 + RING.radius * Math.sin(angle)
  return `${x.toFixed(2)} ${y.toFixed(2)}`
}

/**
 * One arc per step around the pill's disc: the steps that are done, the one in
 * progress and the ones to come. `current` is the number of the step in
 * progress, counted from 1; 0 before the first step.
 */
function StepRing({ current, steps }: { current: number; steps: number }) {
  const sweep = 360 / steps
  return (
    <svg className="ring" viewBox={`0 0 ${RING.box} ${RING.box}`} aria-hidden="true" focusable="false">
      {Array.from({ length: steps }, (_, index) => {
        const number = index + 1
        const from = index * sweep + RING.gapDegrees / 2
        const to = number * sweep - RING.gapDegrees / 2
        return (
          <path
            key={number}
            className="ring__step"
            data-step={number < current ? 'done' : number === current ? 'now' : 'next'}
            d={`M${onRing(from)}A${RING.radius} ${RING.radius} 0 0 1 ${onRing(to)}`}
          />
        )
      })}
    </svg>
  )
}

/**
 * The orange pill that stands in for the prompt bar while a task is running:
 * the prompt, how far the task is, and a button to stop it. How far is the
 * place of the task's step among the steps, so it says the same for any agent.
 */
export function ProgressBar() {
  const task = useTasks((state) => state.tasks.find((candidate) => candidate.id === state.activeId))
  if (!task) return null

  const steps = STEP_ORDER.length
  const current = task.step === null ? 0 : STEP_ORDER.indexOf(task.step) + 1

  return (
    <div className="pill pill--progress" role="group" aria-label="진행 중인 작업" tabIndex={-1} data-takes-focus="">
      <span
        className="pill__disc"
        role="progressbar"
        aria-label="진행 단계"
        aria-valuemin={0}
        aria-valuemax={steps}
        aria-valuenow={current}
        aria-valuetext={current === 0 ? '시작하는 중' : `${steps}단계 중 ${current}단계`}
      >
        <StepRing current={current} steps={steps} />
        <Icon name="tasks" size={30} />
      </span>
      <p className="pill__text" title={task.prompt}>
        {task.prompt}
      </p>
      <button type="button" className="pill__close" aria-label="작업 취소" onClick={() => cancelActive()}>
        <Icon name="close" />
      </button>
    </div>
  )
}

export interface RetryBarProps {
  /** The task that failed. */
  task: Task
  /** Called when the bar is closed without trying again. */
  onDismiss(): void
}

/** The red pill a failed task leaves in place of the prompt bar: try the same prompt again, or close it. */
export function RetryBar({ task, onDismiss }: RetryBarProps) {
  return (
    <div className="pill pill--failed" role="group" aria-label="실패한 작업" tabIndex={-1} data-takes-focus="">
      <span className="pill__disc">
        <Icon name="alert" size={30} />
      </span>
      <p className="pill__text" role="alert" title={task.prompt}>
        <span className="pill__lead">작업을 끝내지 못했어요</span>
        <span>{task.prompt}</span>
      </p>
      <button type="button" className="pill__retry" onClick={() => retry(task.id)}>
        다시 시도
      </button>
      <button type="button" className="pill__close" aria-label="닫기" onClick={onDismiss}>
        <Icon name="close" />
      </button>
    </div>
  )
}
