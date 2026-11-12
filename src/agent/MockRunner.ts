import type { AgentStep } from '../store/tasks'
import { MESSAGES, STEP_MESSAGES } from './messages'
import { buildMockReport } from './mockReport'
import type { AgentEvent, AgentRunner } from './types'

export const STEP_ORDER: readonly AgentStep[] = ['reading', 'searching', 'comparing', 'writing']

export const STEP_DURATIONS_MS: Record<AgentStep, number> = {
  reading: 2500,
  searching: 4500,
  comparing: 3000,
  writing: 3500,
}

export interface MockRunnerOptions {
  /** Multiplies every step duration. Defaults to 1. */
  timeScale?: number
  /** For tests: the run fails when this step ends instead of moving on. */
  failAt?: AgentStep
}

/** Resolves after `ms`, or as soon as `signal` aborts. Leaves no timer or listener behind. */
function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve()
      return
    }
    const finish = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', finish)
      resolve()
    }
    const timer = setTimeout(finish, ms)
    signal.addEventListener('abort', finish)
  })
}

/**
 * Plays a scripted run: a `step` event as each step starts, then `done` with
 * a sample report. Aborting stops it without any further event.
 */
export class MockRunner implements AgentRunner {
  private readonly timeScale: number
  private readonly failAt: AgentStep | undefined

  constructor(opts: MockRunnerOptions = {}) {
    this.timeScale = opts.timeScale ?? 1
    this.failAt = opts.failAt
  }

  async run(prompt: string, onEvent: (e: AgentEvent) => void, signal: AbortSignal): Promise<void> {
    if (signal.aborted) return

    for (const step of STEP_ORDER) {
      onEvent({ type: 'step', step, message: STEP_MESSAGES[step] })
      await wait(STEP_DURATIONS_MS[step] * this.timeScale, signal)
      if (signal.aborted) return

      if (step === this.failAt) {
        onEvent({ type: 'error', message: MESSAGES.error })
        return
      }
    }

    onEvent({ type: 'done', result: buildMockReport(prompt, new Date()) })
  }
}
