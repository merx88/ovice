import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTasksStore, useTasks } from './tasks'
import type { Task } from './tasks'

const KEY = 'ovice.tasks.v1'

function stored(): unknown {
  const raw = localStorage.getItem(KEY)
  return raw === null ? null : JSON.parse(raw)
}

function storedTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'stored-1',
    prompt: 'stored prompt',
    status: 'done',
    step: null,
    message: null,
    result: { title: 'Title', markdown: '# Title' },
    error: null,
    createdAt: 1_000,
    finishedAt: 2_000,
    ...overrides,
  }
}

describe('tasks store', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('starts empty with nothing active or viewed', () => {
    const state = createTasksStore().getState()
    expect(state.tasks).toEqual([])
    expect(state.activeId).toBeNull()
    expect(state.viewingId).toBeNull()
  })

  describe('create', () => {
    it('adds a running task and makes it the active one', () => {
      vi.useFakeTimers()
      vi.setSystemTime(5_000)
      const store = createTasksStore()

      const task = store.getState().create('x')

      expect(task).toEqual({
        id: expect.any(String),
        prompt: 'x',
        status: 'running',
        step: null,
        message: null,
        result: null,
        error: null,
        createdAt: 5_000,
        finishedAt: null,
      })
      expect(store.getState().tasks).toEqual([task])
      expect(store.getState().activeId).toBe(task.id)
    })

    it('puts the newest task first and gives each a distinct id', () => {
      const store = createTasksStore()
      const first = store.getState().create('first')
      store.getState().update(first.id, { status: 'done' })
      const second = store.getState().create('second')

      expect(second.id).not.toBe(first.id)
      expect(store.getState().tasks.map((task) => task.prompt)).toEqual(['second', 'first'])
    })
  })

  describe('update', () => {
    it('applies the patch to the matching task only', () => {
      const store = createTasksStore()
      const older = store.getState().create('older')
      store.getState().update(older.id, { status: 'done' })
      const newer = store.getState().create('newer')

      store.getState().update(newer.id, { step: 'searching', message: 'Searching' })

      const [first, second] = store.getState().tasks
      expect(first).toEqual({ ...newer, step: 'searching', message: 'Searching' })
      expect(second).toEqual({ ...older, status: 'done' })
    })

    it('keeps the task active while it is still running', () => {
      const store = createTasksStore()
      const task = store.getState().create('x')

      store.getState().update(task.id, { step: 'reading' })
      store.getState().update(task.id, { status: 'running', step: 'writing' })

      expect(store.getState().activeId).toBe(task.id)
    })

    it.each(['done', 'cancelled', 'failed'] as const)(
      'clears activeId when the active task becomes %s',
      (status) => {
        const store = createTasksStore()
        const task = store.getState().create('x')

        store.getState().update(task.id, { status, finishedAt: 9_000 })

        expect(store.getState().activeId).toBeNull()
        expect(store.getState().tasks[0]).toMatchObject({ status, finishedAt: 9_000 })
      },
    )

    it('leaves activeId alone when another task is updated', () => {
      const store = createTasksStore()
      const older = store.getState().create('older')
      store.getState().update(older.id, { status: 'failed' })
      const active = store.getState().create('active')

      store.getState().update(older.id, { status: 'cancelled' })

      expect(store.getState().activeId).toBe(active.id)
    })

    it('ignores an unknown id', () => {
      const store = createTasksStore()
      const task = store.getState().create('x')
      const before = store.getState().tasks

      store.getState().update('missing', { status: 'done' })

      expect(store.getState().tasks).toBe(before)
      expect(store.getState().activeId).toBe(task.id)
    })

    it('never changes a task id', () => {
      const store = createTasksStore()
      const task = store.getState().create('x')

      store.getState().update(task.id, { id: 'other', step: 'reading' })

      expect(store.getState().tasks[0]).toMatchObject({ id: task.id, step: 'reading' })
      expect(store.getState().activeId).toBe(task.id)
    })
  })

  describe('setViewing', () => {
    it('sets and clears the viewed task', () => {
      const store = createTasksStore()
      const task = store.getState().create('x')

      store.getState().setViewing(task.id)
      expect(store.getState().viewingId).toBe(task.id)

      store.getState().setViewing(null)
      expect(store.getState().viewingId).toBeNull()
    })
  })

  describe('persistence', () => {
    it('saves every change and restores the tasks in a new store', () => {
      const store = createTasksStore()
      const task = store.getState().create('x')
      expect(stored()).toEqual([task])

      const result = { title: 'T', markdown: 'body' }
      store.getState().update(task.id, { status: 'done', result, finishedAt: 9_000 })
      const finished = { ...task, status: 'done', result, finishedAt: 9_000 }
      expect(stored()).toEqual([finished])

      const reloaded = createTasksStore().getState()
      expect(reloaded.tasks).toEqual([finished])
      expect(reloaded.activeId).toBeNull()
    })

    it('does not persist which task is being viewed', () => {
      const store = createTasksStore()
      const task = store.getState().create('x')
      store.getState().update(task.id, { status: 'done' })
      store.getState().setViewing(task.id)

      expect(stored()).toEqual(store.getState().tasks)
      expect(createTasksStore().getState().viewingId).toBeNull()
    })

    it('cancels a stored running task on load instead of leaving it running', () => {
      const running = storedTask({
        id: 'interrupted',
        status: 'running',
        step: 'searching',
        result: null,
        finishedAt: null,
      })
      const done = storedTask({ id: 'finished' })
      localStorage.setItem(KEY, JSON.stringify([running, done]))
      vi.useFakeTimers()
      vi.setSystemTime(7_000)

      const state = createTasksStore().getState()

      expect(state.tasks).toEqual([{ ...running, status: 'cancelled', finishedAt: 7_000 }, done])
      expect(state.activeId).toBeNull()
    })

    it('writes the cancellation back so a later load sees the same task', () => {
      const running = storedTask({ status: 'running', result: null, finishedAt: null })
      localStorage.setItem(KEY, JSON.stringify([running]))
      vi.useFakeTimers()
      vi.setSystemTime(7_000)
      const first = createTasksStore().getState().tasks

      vi.setSystemTime(8_000)
      expect(stored()).toEqual(first)
      expect(createTasksStore().getState().tasks).toEqual(first)
    })

    it('does not write on load when nothing needed fixing', () => {
      const raw = JSON.stringify([storedTask()])
      localStorage.setItem(KEY, raw)
      const setItem = vi.spyOn(Storage.prototype, 'setItem')

      createTasksStore()

      expect(setItem).not.toHaveBeenCalled()
    })

    it.each([
      ['broken JSON', '[{"id":'],
      ['null', 'null'],
      ['an object', '{"tasks":[]}'],
      ['a string', '"tasks"'],
      ['a number', '42'],
    ])('starts empty when the stored value is %s', (_label, raw) => {
      localStorage.setItem(KEY, raw)
      const store = createTasksStore()

      expect(store.getState().tasks).toEqual([])
      expect(store.getState().activeId).toBeNull()
      expect(() => store.getState().create('x')).not.toThrow()
    })

    it('drops stored entries that are not tasks and keeps the valid ones', () => {
      const valid = storedTask()
      const entries: unknown[] = [
        null,
        'task',
        7,
        [],
        {},
        { ...valid, id: 5 },
        { ...valid, prompt: undefined },
        { ...valid, status: 'paused' },
        { ...valid, step: 'dancing' },
        { ...valid, message: 3 },
        { ...valid, result: 'text' },
        { ...valid, result: { title: 'only title' } },
        { ...valid, error: {} },
        { ...valid, createdAt: '1000' },
        { ...valid, finishedAt: 'later' },
        valid,
      ]
      localStorage.setItem(KEY, JSON.stringify(entries))

      expect(createTasksStore().getState().tasks).toEqual([valid])
    })

    it('keeps working in memory when localStorage throws', () => {
      const fail = () => {
        throw new DOMException('denied', 'SecurityError')
      }
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(fail)
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(fail)

      const store = createTasksStore()
      const task = store.getState().create('x')
      store.getState().update(task.id, { status: 'done' })

      expect(store.getState().tasks).toEqual([{ ...task, status: 'done' }])
      expect(store.getState().activeId).toBeNull()
    })
  })

  describe('default instance', () => {
    it('is usable outside React', () => {
      const seen: Array<string | null> = []
      const unsubscribe = useTasks.subscribe((state) => seen.push(state.viewingId))

      useTasks.getState().setViewing('some-id')
      unsubscribe()
      useTasks.getState().setViewing(null)

      expect(seen).toEqual(['some-id'])
      expect(useTasks.getState().viewingId).toBeNull()
    })

    it('is usable as a React hook with a selector', () => {
      const { result } = renderHook(() => useTasks((state) => state.viewingId))
      expect(result.current).toBeNull()

      act(() => useTasks.getState().setViewing('some-id'))
      expect(result.current).toBe('some-id')

      act(() => useTasks.getState().setViewing(null))
    })
  })
})
