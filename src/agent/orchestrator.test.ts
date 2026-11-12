import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSettingsStore } from '../store/settings'
import type { AgentMode } from '../store/settings'
import { createTasksStore, useTasks } from '../store/tasks'
import type { Task } from '../store/tasks'
import { MESSAGES, STEP_MESSAGES } from './messages'
import { cancelActive, createOrchestrator, retry, startTask } from './orchestrator'
import type { AgentEvent, AgentRunner } from './types'

const START = new Date(2026, 10, 12, 9, 0, 0)
const RESULT = { title: 'Note apps compared', markdown: '# Note apps compared' }

/** A runner the test drives by hand: it records what it was given and emits on request. */
class FakeRunner implements AgentRunner {
  prompt: string | null = null
  signal: AbortSignal | null = null
  private onEvent: ((e: AgentEvent) => void) | null = null
  private settle: { resolve: () => void; reject: (reason: unknown) => void } | null = null

  run(prompt: string, onEvent: (e: AgentEvent) => void, signal: AbortSignal): Promise<void> {
    this.prompt = prompt
    this.onEvent = onEvent
    this.signal = signal
    return new Promise<void>((resolve, reject) => {
      this.settle = { resolve, reject }
    })
  }

  emit(event: AgentEvent): void {
    if (!this.onEvent) throw new Error('the runner has not been started')
    this.onEvent(event)
  }

  resolve(): void {
    this.settle?.resolve()
  }

  reject(reason: unknown): void {
    this.settle?.reject(reason)
  }
}

function setup() {
  const tasks = createTasksStore()
  const settings = createSettingsStore()
  const runners: FakeRunner[] = []
  const makeRunner = vi.fn((_mode: AgentMode): AgentRunner => {
    const runner = new FakeRunner()
    runners.push(runner)
    return runner
  })
  const orchestrator = createOrchestrator({ tasks, settings, makeRunner })
  const find = (id: string): Task => {
    const task = tasks.getState().tasks.find((candidate) => candidate.id === id)
    if (!task) throw new Error(`no task ${id}`)
    return task
  }
  return { tasks, settings, runners, makeRunner, orchestrator, find }
}

/** Starts a task that must be accepted. */
function mustStart(start: (prompt: string) => Task | null, prompt = 'Compare three note apps'): Task {
  const task = start(prompt)
  if (!task) throw new Error('the task was not started')
  return task
}

/** Lets settled promises run their handlers. */
async function flush(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0)
}

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
  vi.setSystemTime(START)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('startTask', () => {
  it('rejects a prompt that is only whitespace', () => {
    const { orchestrator, tasks, makeRunner } = setup()

    expect(orchestrator.startTask('')).toBeNull()
    expect(orchestrator.startTask('  \n\t ')).toBeNull()

    expect(tasks.getState().tasks).toEqual([])
    expect(tasks.getState().activeId).toBeNull()
    expect(makeRunner).not.toHaveBeenCalled()
  })

  it('creates a running task and hands the trimmed prompt to a runner', () => {
    const { orchestrator, tasks, runners, find } = setup()

    const task = mustStart(orchestrator.startTask, '  Compare three note apps \n')

    expect(task.prompt).toBe('Compare three note apps')
    expect(task.status).toBe('running')
    expect(tasks.getState().activeId).toBe(task.id)
    expect(find(task.id)).toEqual(task)
    expect(runners).toHaveLength(1)
    expect(runners[0].prompt).toBe('Compare three note apps')
    expect(runners[0].signal?.aborted).toBe(false)
  })

  it('refuses a second task while one is running', () => {
    const { orchestrator, tasks, makeRunner } = setup()

    const first = mustStart(orchestrator.startTask)
    const second = orchestrator.startTask('Another request')

    expect(second).toBeNull()
    expect(tasks.getState().tasks).toHaveLength(1)
    expect(tasks.getState().activeId).toBe(first.id)
    expect(makeRunner).toHaveBeenCalledTimes(1)
  })

  it('asks for the runner of the current mode, which is always prototype', () => {
    const { orchestrator, settings, runners, makeRunner } = setup()

    mustStart(orchestrator.startTask)
    runners[0].emit({ type: 'done', result: RESULT })
    expect(settings.getState().setMode('real')).toEqual({ ok: false })
    mustStart(orchestrator.startTask)

    expect(makeRunner.mock.calls).toEqual([['prototype'], ['prototype']])
  })
})

describe('runner events', () => {
  it('records the step and its message', () => {
    const { orchestrator, runners, find } = setup()
    const task = mustStart(orchestrator.startTask)

    runners[0].emit({ type: 'step', step: 'reading', message: STEP_MESSAGES.reading })
    expect(find(task.id)).toMatchObject({ status: 'running', step: 'reading', message: 'Reading your request...' })

    runners[0].emit({ type: 'step', step: 'searching', message: STEP_MESSAGES.searching })
    expect(find(task.id)).toMatchObject({
      status: 'running',
      step: 'searching',
      message: "I'm searching for information on the web...",
      finishedAt: null,
    })
  })

  it('finishes the task with its result on done', () => {
    const { orchestrator, tasks, runners, find } = setup()
    const task = mustStart(orchestrator.startTask)
    runners[0].emit({ type: 'step', step: 'writing', message: STEP_MESSAGES.writing })

    vi.setSystemTime(START.getTime() + 13_500)
    runners[0].emit({ type: 'done', result: RESULT })

    expect(find(task.id)).toMatchObject({
      status: 'done',
      result: RESULT,
      message: null,
      error: null,
      finishedAt: START.getTime() + 13_500,
    })
    expect(tasks.getState().activeId).toBeNull()
    expect(runners[0].signal?.aborted).toBe(false)
  })

  it('fails the task with the error message on error', () => {
    const { orchestrator, tasks, runners, find } = setup()
    const task = mustStart(orchestrator.startTask)

    vi.setSystemTime(START.getTime() + 2_500)
    runners[0].emit({ type: 'error', message: 'The search timed out.' })

    expect(find(task.id)).toMatchObject({
      status: 'failed',
      error: 'The search timed out.',
      result: null,
      finishedAt: START.getTime() + 2_500,
    })
    expect(tasks.getState().activeId).toBeNull()
  })

  it.each<[string, AgentEvent, AgentEvent[]]>([
    ['done', { type: 'done', result: RESULT }, [{ type: 'error', message: 'late' }]],
    ['failed', { type: 'error', message: 'first' }, [{ type: 'done', result: RESULT }]],
    [
      'done',
      { type: 'done', result: RESULT },
      [{ type: 'step', step: 'reading', message: STEP_MESSAGES.reading }],
    ],
  ])('ignores events after the task is %s', (_status, ending, late) => {
    const { orchestrator, runners, find } = setup()
    const task = mustStart(orchestrator.startTask)
    runners[0].emit(ending)
    const finished = find(task.id)

    vi.setSystemTime(START.getTime() + 60_000)
    for (const event of late) runners[0].emit(event)

    expect(find(task.id)).toEqual(finished)
  })
})

describe('a run that ends without a result', () => {
  it('fails the task when the run rejects', async () => {
    const { orchestrator, tasks, runners, find } = setup()
    const task = mustStart(orchestrator.startTask)

    vi.setSystemTime(START.getTime() + 1_000)
    runners[0].reject(new Error('listener blew up'))
    await flush()

    expect(find(task.id)).toMatchObject({
      status: 'failed',
      error: 'Something went wrong.',
      finishedAt: START.getTime() + 1_000,
    })
    expect(tasks.getState().activeId).toBeNull()
  })

  it('fails the task when the runner cannot be started', () => {
    const tasks = createTasksStore()
    const orchestrator = createOrchestrator({
      tasks,
      settings: createSettingsStore(),
      makeRunner: () => {
        throw new Error('no runner')
      },
    })

    const task = mustStart(orchestrator.startTask)

    expect(tasks.getState().tasks[0]).toMatchObject({ id: task.id, status: 'failed', error: MESSAGES.error })
    expect(tasks.getState().activeId).toBeNull()
  })

  it('fails the task when the run settles while it is still running', async () => {
    const { orchestrator, tasks, runners, find } = setup()
    const task = mustStart(orchestrator.startTask)

    runners[0].resolve()
    await flush()

    expect(find(task.id)).toMatchObject({ status: 'failed', error: MESSAGES.error, finishedAt: START.getTime() })
    expect(tasks.getState().activeId).toBeNull()
  })

  it('leaves a finished task alone when its run settles', async () => {
    const { orchestrator, runners, find } = setup()
    const done = mustStart(orchestrator.startTask)
    runners[0].emit({ type: 'done', result: RESULT })
    runners[0].resolve()
    const failed = mustStart(orchestrator.startTask)
    runners[1].emit({ type: 'error', message: 'The search timed out.' })
    runners[1].reject(new Error('after the fact'))
    await flush()

    expect(find(done.id)).toMatchObject({ status: 'done', result: RESULT, error: null })
    expect(find(failed.id)).toMatchObject({ status: 'failed', error: 'The search timed out.' })
  })
})

describe('cancelActive', () => {
  it('does nothing when no task is running', () => {
    const { orchestrator, tasks, runners } = setup()
    mustStart(orchestrator.startTask)
    runners[0].emit({ type: 'done', result: RESULT })
    const before = tasks.getState().tasks

    orchestrator.cancelActive()

    expect(tasks.getState().tasks).toBe(before)
    expect(runners[0].signal?.aborted).toBe(false)
  })

  it('aborts the run and marks the task cancelled', () => {
    const { orchestrator, tasks, runners, find } = setup()
    const task = mustStart(orchestrator.startTask)
    runners[0].emit({ type: 'step', step: 'searching', message: STEP_MESSAGES.searching })

    vi.setSystemTime(START.getTime() + 3_000)
    orchestrator.cancelActive()

    expect(runners[0].signal?.aborted).toBe(true)
    expect(find(task.id)).toMatchObject({
      status: 'cancelled',
      step: 'searching',
      message: 'Okay, stopping.',
      finishedAt: START.getTime() + 3_000,
    })
    expect(tasks.getState().activeId).toBeNull()
  })

  it('ignores whatever the cancelled run still emits or how it settles', async () => {
    const { orchestrator, runners, find } = setup()
    const task = mustStart(orchestrator.startTask)
    orchestrator.cancelActive()
    const cancelled = find(task.id)

    vi.setSystemTime(START.getTime() + 60_000)
    runners[0].emit({ type: 'step', step: 'writing', message: STEP_MESSAGES.writing })
    runners[0].emit({ type: 'done', result: RESULT })
    runners[0].emit({ type: 'error', message: 'late' })
    runners[0].resolve()
    await flush()

    expect(find(task.id)).toEqual(cancelled)
  })

  it('ignores an event the run emits as it is aborted', () => {
    const tasks = createTasksStore()
    const complainsWhenAborted: AgentRunner = {
      run: (_prompt, onEvent, signal) =>
        new Promise<void>((resolve) => {
          signal.addEventListener('abort', () => {
            onEvent({ type: 'error', message: 'aborted' })
            resolve()
          })
        }),
    }
    const orchestrator = createOrchestrator({
      tasks,
      settings: createSettingsStore(),
      makeRunner: () => complainsWhenAborted,
    })
    const task = mustStart(orchestrator.startTask)

    orchestrator.cancelActive()

    expect(tasks.getState().tasks[0]).toMatchObject({
      id: task.id,
      status: 'cancelled',
      message: MESSAGES.cancel,
      error: null,
    })
  })

  it('keeps a cancelled run away from the task started after it', () => {
    const { orchestrator, tasks, runners, find } = setup()
    const first = mustStart(orchestrator.startTask)
    orchestrator.cancelActive()
    const second = mustStart(orchestrator.startTask, 'Another request')

    runners[0].emit({ type: 'done', result: RESULT })

    expect(find(first.id).status).toBe('cancelled')
    expect(find(second.id)).toMatchObject({ status: 'running', result: null })
    expect(tasks.getState().activeId).toBe(second.id)
    expect(runners[1].signal?.aborted).toBe(false)
  })
})

describe('retry', () => {
  it('starts a new task with the prompt of a failed one', () => {
    const { orchestrator, tasks, runners, find } = setup()
    const failed = mustStart(orchestrator.startTask, 'Compare three note apps')
    runners[0].emit({ type: 'error', message: 'The search timed out.' })
    const before = find(failed.id)

    const again = orchestrator.retry(failed.id)

    expect(again).not.toBeNull()
    expect(again?.id).not.toBe(failed.id)
    expect(again).toMatchObject({ prompt: 'Compare three note apps', status: 'running', error: null })
    expect(tasks.getState().tasks.map((task) => task.id)).toEqual([again?.id, failed.id])
    expect(tasks.getState().activeId).toBe(again?.id)
    expect(find(failed.id)).toBe(before)
    expect(runners).toHaveLength(2)
    expect(runners[1].prompt).toBe('Compare three note apps')
  })

  it('refuses a task that did not fail', () => {
    const { orchestrator, tasks, runners } = setup()

    const done = mustStart(orchestrator.startTask)
    runners[0].emit({ type: 'done', result: RESULT })
    expect(orchestrator.retry(done.id)).toBeNull()

    const cancelled = mustStart(orchestrator.startTask)
    orchestrator.cancelActive()
    expect(orchestrator.retry(cancelled.id)).toBeNull()

    const running = mustStart(orchestrator.startTask)
    expect(orchestrator.retry(running.id)).toBeNull()

    expect(orchestrator.retry('no-such-task')).toBeNull()
    expect(tasks.getState().tasks).toHaveLength(3)
  })

  it('refuses while another task is running', () => {
    const { orchestrator, tasks, runners, makeRunner } = setup()
    const failed = mustStart(orchestrator.startTask)
    runners[0].emit({ type: 'error', message: 'The search timed out.' })
    const running = mustStart(orchestrator.startTask, 'Another request')

    expect(orchestrator.retry(failed.id)).toBeNull()

    expect(tasks.getState().tasks).toHaveLength(2)
    expect(tasks.getState().activeId).toBe(running.id)
    expect(makeRunner).toHaveBeenCalledTimes(2)
  })
})

describe('the default orchestrator', () => {
  const stepOf = (id: string) => useTasks.getState().tasks.find((task) => task.id === id)?.step

  afterEach(() => {
    cancelActive()
    window.history.replaceState(null, '', '/')
  })

  it('runs the scripted agent against the shared tasks store', async () => {
    const task = mustStart(startTask, 'Compare three note apps')

    expect(useTasks.getState().activeId).toBe(task.id)
    expect(stepOf(task.id)).toBe('reading')
    await vi.advanceTimersByTimeAsync(2499)
    expect(stepOf(task.id)).toBe('reading')
    await vi.advanceTimersByTimeAsync(1)
    expect(stepOf(task.id)).toBe('searching')

    cancelActive()

    expect(useTasks.getState().activeId).toBeNull()
    expect(useTasks.getState().tasks[0]).toMatchObject({ id: task.id, status: 'cancelled', message: MESSAGES.cancel })
    expect(retry(task.id)).toBeNull()
    await vi.advanceTimersByTimeAsync(20_000)
    expect(useTasks.getState().tasks[0]).toMatchObject({ id: task.id, status: 'cancelled', result: null })
  })

  it('shortens every step to a twentieth with ?fast=1', async () => {
    window.history.replaceState(null, '', '/?fast=1')
    const task = mustStart(startTask, 'Compare three note apps')

    await vi.advanceTimersByTimeAsync(124)
    expect(stepOf(task.id)).toBe('reading')
    await vi.advanceTimersByTimeAsync(1)
    expect(stepOf(task.id)).toBe('searching')

    await vi.advanceTimersByTimeAsync(1_000)
    expect(useTasks.getState().tasks[0]).toMatchObject({ id: task.id, status: 'done' })
    expect(useTasks.getState().activeId).toBeNull()
  })
})
