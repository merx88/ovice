import { beforeEach, describe, expect, it } from 'vitest'
import { createTasksStore, type Task, type TaskStatus } from '../store/tasks'
import { initialMachine, transition, type CharEvent } from './stateMachine'
import {
  NO_TASKS,
  runningTask,
  taskEvents,
  taskEventsAtFirstSight,
  type TaskEvent,
  type TasksSnapshot,
} from './taskEvents'

function task(id: string, status: TaskStatus, patch: Partial<Task> = {}): Task {
  return {
    id,
    prompt: `prompt ${id}`,
    status,
    step: null,
    message: null,
    result: status === 'done' ? { title: 'Title', markdown: '# Title' } : null,
    error: status === 'failed' ? 'Something went wrong.' : null,
    createdAt: 1_000,
    finishedAt: status === 'running' ? null : 2_000,
    ...patch,
  }
}

function snapshot(tasks: Task[], activeId: string | null = null, viewingId: string | null = null): TasksSnapshot {
  return { tasks, activeId, viewingId }
}

describe('runningTask', () => {
  it('is the task the active id points at while it is running', () => {
    const running = task('b', 'running')
    expect(runningTask(snapshot([running, task('a', 'done')], 'b'))).toBe(running)
  })

  it('is nothing when no task is active, or the active id points at a task that is over or gone', () => {
    expect(runningTask(NO_TASKS)).toBeUndefined()
    expect(runningTask(snapshot([task('a', 'running')]))).toBeUndefined()
    expect(runningTask(snapshot([task('a', 'done')], 'a'))).toBeUndefined()
    expect(runningTask(snapshot([task('a', 'running')], 'gone'))).toBeUndefined()
  })
})

describe('taskEvents', () => {
  it('reports nothing when nothing changed', () => {
    const idle = snapshot([task('a', 'done')])
    expect(taskEvents(idle, idle)).toEqual([])
    const busy = snapshot([task('b', 'running'), task('a', 'done')], 'b')
    expect(taskEvents(busy, busy)).toEqual([])
  })

  describe('history', () => {
    it('reports nothing for the tasks that are there when the app loads', () => {
      const loaded = snapshot([task('c', 'done'), task('b', 'cancelled'), task('a', 'failed')])
      expect(taskEvents(NO_TASKS, loaded)).toEqual([])
    })

    it('reports nothing when an old result is looked at', () => {
      const before = snapshot([task('a', 'done')])
      expect(taskEvents(before, { ...before, viewingId: 'a' })).toEqual([])
    })

    it('reports nothing when a task that is not being followed changes', () => {
      const before = snapshot([task('b', 'running'), task('a', 'done')], 'b')
      const after = snapshot([task('b', 'running'), task('a', 'failed')], 'b')
      expect(taskEvents(before, after)).toEqual([])
    })
  })

  describe('a task starting', () => {
    it('reports the task that becomes the running one', () => {
      const before = snapshot([task('a', 'done')])
      const after = snapshot([task('b', 'running'), task('a', 'done')], 'b')
      expect(taskEvents(before, after)).toEqual([{ type: 'taskStarted', taskId: 'b' }])
    })

    it('picks up a task that is already running when watching begins', () => {
      const running = snapshot([task('a', 'running')], 'a')
      expect(taskEvents(NO_TASKS, running)).toEqual([{ type: 'taskStarted', taskId: 'a' }])
    })

    it('reports it once, not again as the task goes through its steps', () => {
      const started = snapshot([task('a', 'running')], 'a')
      const stepped = snapshot([task('a', 'running', { step: 'searching', message: 'searching' })], 'a')
      expect(taskEvents(started, stepped)).toEqual([])
    })

    it('does not take an active id that points at no running task for a start', () => {
      expect(taskEvents(NO_TASKS, snapshot([task('a', 'done')], 'a'))).toEqual([])
      expect(taskEvents(NO_TASKS, snapshot([], 'gone'))).toEqual([])
    })
  })

  describe('the followed task ending', () => {
    const running = snapshot([task('a', 'running')], 'a')

    it.each<[TaskStatus, TaskEvent['type']]>([
      ['done', 'taskDone'],
      ['cancelled', 'taskCancelled'],
      ['failed', 'taskFailed'],
    ])('reports a task that ends as %s with %s', (status, type) => {
      expect(taskEvents(running, snapshot([task('a', status)]))).toEqual([{ type, taskId: 'a' }])
    })

    it('reports the end exactly once', () => {
      const ended = snapshot([task('a', 'done')])
      expect(taskEvents(running, ended)).toHaveLength(1)
      expect(taskEvents(ended, ended)).toEqual([])
      expect(taskEvents(ended, { ...ended, viewingId: 'a' })).toEqual([])
    })

    it('reports the end before the start when the next task has begun by the time it looks', () => {
      const next = snapshot([task('b', 'running'), task('a', 'done')], 'b')
      expect(taskEvents(running, next)).toEqual([
        { type: 'taskDone', taskId: 'a' },
        { type: 'taskStarted', taskId: 'b' },
      ])
    })

    it('counts a followed task that has disappeared as cancelled', () => {
      expect(taskEvents(running, snapshot([]))).toEqual([{ type: 'taskCancelled', taskId: 'a' }])
    })
  })

  describe('the viewer', () => {
    const tasks = [task('b', 'done'), task('a', 'done')]

    it('reports the viewer closing', () => {
      expect(taskEvents(snapshot(tasks, null, 'a'), snapshot(tasks))).toEqual([{ type: 'viewerClosed' }])
    })

    it('reports nothing when the viewer opens or shows another result', () => {
      expect(taskEvents(snapshot(tasks), snapshot(tasks, null, 'a'))).toEqual([])
      expect(taskEvents(snapshot(tasks, null, 'a'), snapshot(tasks, null, 'b'))).toEqual([])
    })

    it('reports the viewer closing after what happened to the tasks in the same change', () => {
      const before = snapshot([task('b', 'running'), task('a', 'done')], 'b', 'a')
      const after = snapshot([task('c', 'running'), task('b', 'failed'), task('a', 'done')], 'c')
      expect(taskEvents(before, after)).toEqual([
        { type: 'taskFailed', taskId: 'b' },
        { type: 'taskStarted', taskId: 'c' },
        { type: 'viewerClosed' },
      ])
    })
  })

  describe('with the tasks store', () => {
    beforeEach(() => {
      localStorage.clear()
    })

    /** Collects what a watcher of `store` is told, starting from the store as it is now. */
    function watch(store: ReturnType<typeof createTasksStore>): TaskEvent[] {
      const seen: TaskEvent[] = [...taskEvents(NO_TASKS, store.getState())]
      store.subscribe((state, previous) => seen.push(...taskEvents(previous, state)))
      return seen
    }

    it('follows a task from start to finish, one event each', () => {
      const store = createTasksStore()
      const seen = watch(store)

      const created = store.getState().create('first')
      store.getState().update(created.id, { step: 'reading', message: 'Reading your request...' })
      store.getState().update(created.id, { step: 'searching', message: 'searching' })
      store.getState().update(created.id, { status: 'done', result: { title: 't', markdown: 'm' }, message: null })
      store.getState().setViewing(created.id)
      store.getState().setViewing(null)

      expect(seen).toEqual([
        { type: 'taskStarted', taskId: created.id },
        { type: 'taskDone', taskId: created.id },
        { type: 'viewerClosed' },
      ])
    })

    it('reports each of several tasks under its own id', () => {
      const store = createTasksStore()
      const seen = watch(store)

      const first = store.getState().create('first')
      store.getState().update(first.id, { status: 'cancelled' })
      const second = store.getState().create('second')
      store.getState().update(second.id, { status: 'failed', error: 'x' })

      expect(seen).toEqual([
        { type: 'taskStarted', taskId: first.id },
        { type: 'taskCancelled', taskId: first.id },
        { type: 'taskStarted', taskId: second.id },
        { type: 'taskFailed', taskId: second.id },
      ])
    })

    it('stays silent about tasks restored from storage, finished or interrupted', () => {
      const stored = [task('done-1', 'done'), task('ran', 'running'), task('failed-1', 'failed')]
      localStorage.setItem('ovice.tasks.v1', JSON.stringify(stored))
      const store = createTasksStore()
      expect(store.getState().tasks).toHaveLength(3)

      expect(watch(store)).toEqual([])
    })
  })

  it('produces events the character machine accepts as they are', () => {
    const started = snapshot([task('a', 'running')], 'a')
    const events: CharEvent[] = [...taskEvents(NO_TASKS, started), ...taskEvents(started, snapshot([task('a', 'done')]))]
    const machine = events.reduce((m, event) => transition(m, event, 0), initialMachine(0))
    expect(machine.state).toBe('standingUp')
  })
})

describe('taskEventsAtFirstSight', () => {
  /** When the page was loaded, on the clock `createdAt` is read from. */
  const LOADED_AT = 50_000
  /** Created during this page load, and during an earlier one. */
  const fresh = { createdAt: LOADED_AT + 4_000 }
  const stale = { createdAt: LOADED_AT - 4_000 }
  const handOver = (taskId: string): TaskEvent[] => [
    { type: 'taskStarted', taskId },
    { type: 'taskDone', taskId },
  ]

  it('reports nothing for an empty store', () => {
    expect(taskEventsAtFirstSight(NO_TASKS, LOADED_AT)).toEqual([])
  })

  describe('a result that is waiting', () => {
    it('reports the newest task as started and done when it finished during this page load', () => {
      const found = snapshot([task('b', 'done', fresh), task('a', 'done', stale)])
      expect(taskEventsAtFirstSight(found, LOADED_AT)).toEqual(handOver('b'))
    })

    it('counts a task created in the very millisecond the page was loaded, and none from before', () => {
      const at = (createdAt: number) => snapshot([task('a', 'done', { createdAt })])
      expect(taskEventsAtFirstSight(at(LOADED_AT), LOADED_AT)).toEqual(handOver('a'))
      expect(taskEventsAtFirstSight(at(LOADED_AT - 1), LOADED_AT)).toEqual([])
    })

    it('takes the events through the character machine to standing up', () => {
      const events: CharEvent[] = taskEventsAtFirstSight(snapshot([task('a', 'done', fresh)]), LOADED_AT)
      const machine = events.reduce((m, event) => transition(m, event, 0), initialMachine(0))
      expect(machine.state).toBe('standingUp')
    })

    it('is still waiting while the viewer shows another result', () => {
      const found = snapshot([task('b', 'done', fresh), task('a', 'done', stale)], null, 'a')
      expect(taskEventsAtFirstSight(found, LOADED_AT)).toEqual(handOver('b'))
    })
  })

  describe('history', () => {
    it('reports nothing for tasks of an earlier page load, however they ended', () => {
      const found = snapshot([task('c', 'done', stale), task('b', 'cancelled', stale), task('a', 'failed', stale)])
      expect(taskEventsAtFirstSight(found, LOADED_AT)).toEqual([])
    })

    it.each<TaskStatus>(['cancelled', 'failed'])('reports nothing when the newest task ended as %s', (status) => {
      // Only the newest task counts, not a result further down the list.
      const found = snapshot([task('b', status, fresh), task('a', 'done', fresh)])
      expect(taskEventsAtFirstSight(found, LOADED_AT)).toEqual([])
      // And only if it is done, whatever it carries.
      const carrying = snapshot([task('b', status, { ...fresh, result: { title: 'Title', markdown: '# Title' } })])
      expect(taskEventsAtFirstSight(carrying, LOADED_AT)).toEqual([])
    })

    it('reports nothing for a task that is done but has no result to hand over', () => {
      const found = snapshot([task('a', 'done', { ...fresh, result: null })])
      expect(taskEventsAtFirstSight(found, LOADED_AT)).toEqual([])
    })

    it('reports nothing when that result is already open in the viewer', () => {
      const found = snapshot([task('a', 'done', fresh)], null, 'a')
      expect(taskEventsAtFirstSight(found, LOADED_AT)).toEqual([])
    })
  })

  describe('a task that is running', () => {
    it('is picked up, as it is when watching begins from nothing', () => {
      const found = snapshot([task('b', 'running', fresh), task('a', 'done', fresh)], 'b')
      expect(taskEventsAtFirstSight(found, LOADED_AT)).toEqual([{ type: 'taskStarted', taskId: 'b' }])
      expect(taskEventsAtFirstSight(found, LOADED_AT)).toEqual(taskEvents(NO_TASKS, found))
    })

    it('is the only thing reported, even where a finished result stands before it in the list', () => {
      const found = snapshot([task('b', 'done', fresh), task('a', 'running', fresh)], 'a')
      expect(taskEventsAtFirstSight(found, LOADED_AT)).toEqual([{ type: 'taskStarted', taskId: 'a' }])
    })
  })

  describe('with the tasks store', () => {
    beforeEach(() => {
      localStorage.clear()
    })

    it('finds the result of a task that ran from start to finish before anybody watched', () => {
      const loadedAt = Date.now()
      const store = createTasksStore()
      const created = store.getState().create('first')
      store.getState().update(created.id, { step: 'writing', message: 'writing' })
      store.getState().update(created.id, { status: 'done', result: { title: 't', markdown: 'm' }, message: null })

      expect(taskEventsAtFirstSight(store.getState(), loadedAt)).toEqual(handOver(created.id))
    })

    it('hands a result over once: what follows the first sight is told by `taskEvents` alone', () => {
      const loadedAt = Date.now()
      const store = createTasksStore()
      const created = store.getState().create('first')
      store.getState().update(created.id, { status: 'done', result: { title: 't', markdown: 'm' }, message: null })

      const seen: TaskEvent[] = [...taskEventsAtFirstSight(store.getState(), loadedAt)]
      store.subscribe((state, previous) => seen.push(...taskEvents(previous, state)))
      store.getState().setViewing(created.id)
      store.getState().setViewing(null)

      expect(seen).toEqual([...handOver(created.id), { type: 'viewerClosed' }])
    })

    it('stays silent after a reload about a result that an earlier page load produced', () => {
      // The page that ran the task...
      const before = createTasksStore()
      const created = before.getState().create('first')
      before.getState().update(created.id, { status: 'done', result: { title: 't', markdown: 'm' }, message: null })
      // ...and the page that is loaded afterwards, which finds the task in storage.
      const loadedAt = created.createdAt + 1
      const store = createTasksStore()
      expect(store.getState().tasks.map(({ id, status }) => ({ id, status }))).toEqual([{ id: created.id, status: 'done' }])

      expect(taskEventsAtFirstSight(store.getState(), loadedAt)).toEqual([])
    })
  })
})
