import { fastMode } from '../app/env'
import { useSettings } from '../store/settings'
import type { AgentMode, SettingsState } from '../store/settings'
import { useTasks } from '../store/tasks'
import type { Task, TasksState } from '../store/tasks'
import { MESSAGES } from './messages'
import { MockRunner } from './MockRunner'
import { RealRunner } from './RealRunner'
import type { AgentEvent, AgentRunner } from './types'

export interface OrchestratorDeps {
  tasks: { getState: () => TasksState }
  settings: { getState: () => SettingsState }
  makeRunner: (mode: AgentMode) => AgentRunner
}

export interface Orchestrator {
  /**
   * Starts a task for the trimmed prompt and returns it as created; its
   * progress is in the tasks store. Null when the prompt is blank or a task
   * is already running.
   */
  startTask: (prompt: string) => Task | null
  /** Stops the running task, if there is one. */
  cancelActive: () => void
  /**
   * Starts a new task with the prompt of a failed one, which stays as it is.
   * Null when that task did not fail or a task is already running.
   */
  retry: (taskId: string) => Task | null
}

/**
 * Connects prompts to runners: the one place that starts a run and writes
 * what the run reports into the tasks store.
 */
export function createOrchestrator(deps: OrchestratorDeps): Orchestrator {
  /** One controller per task, kept only while the task is running. */
  const controllers = new Map<string, AbortController>()

  const findTask = (id: string) => deps.tasks.getState().tasks.find((task) => task.id === id)
  const isRunning = (id: string) => findTask(id)?.status === 'running'

  function finish(id: string, patch: Partial<Task>): void {
    controllers.delete(id)
    deps.tasks.getState().update(id, { ...patch, finishedAt: Date.now() })
  }

  /** Applies a run's event to its task; a task that is no longer running ignores it. */
  function applyEvent(id: string, event: AgentEvent): void {
    if (!isRunning(id)) return
    switch (event.type) {
      case 'step':
        deps.tasks.getState().update(id, { step: event.step, message: event.message })
        break
      case 'done':
        finish(id, { status: 'done', result: event.result, message: null })
        break
      case 'error':
        finish(id, { status: 'failed', error: event.message })
        break
    }
  }

  /** Runs the task to its end. A run that stops without reporting one has failed. */
  async function run(task: Task, signal: AbortSignal): Promise<void> {
    try {
      const runner = deps.makeRunner(deps.settings.getState().mode)
      await runner.run(task.prompt, (event) => applyEvent(task.id, event), signal)
    } catch {
      // Handled below, together with a run that ended without a result.
    }
    if (isRunning(task.id)) finish(task.id, { status: 'failed', error: MESSAGES.error })
  }

  function startTask(prompt: string): Task | null {
    const text = prompt.trim()
    if (text === '' || deps.tasks.getState().activeId !== null) return null

    const task = deps.tasks.getState().create(text)
    const controller = new AbortController()
    controllers.set(task.id, controller)
    void run(task, controller.signal)
    return task
  }

  function cancelActive(): void {
    const id = deps.tasks.getState().activeId
    if (id === null) return
    const controller = controllers.get(id)
    // Cancelled first, so that anything the run emits as it is aborted is ignored.
    finish(id, { status: 'cancelled', message: MESSAGES.cancel })
    controller?.abort()
  }

  function retry(taskId: string): Task | null {
    const task = findTask(taskId)
    return task?.status === 'failed' ? startTask(task.prompt) : null
  }

  return { startTask, cancelActive, retry }
}

function makeRunner(mode: AgentMode): AgentRunner {
  switch (mode) {
    case 'prototype':
      return new MockRunner({ timeScale: fastMode() ? 0.05 : 1 })
    case 'real':
      return new RealRunner()
  }
}

export const { startTask, cancelActive, retry } = createOrchestrator({
  tasks: useTasks,
  settings: useSettings,
  makeRunner,
})
