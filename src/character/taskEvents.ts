// What a change of the tasks store means to the character: which task it
// should start working on, how the task it was working on ended, and when the
// result viewer was closed.
import type { Task, TasksState } from '../store/tasks'

/** The part of the tasks store the character reacts to. */
export type TasksSnapshot = Pick<TasksState, 'tasks' | 'activeId' | 'viewingId'>

/** An event for the character's state machine, with the task it is about. */
export type TaskEvent =
  | { type: 'taskStarted' | 'taskDone' | 'taskCancelled' | 'taskFailed'; taskId: string }
  | { type: 'viewerClosed' }

/** The store before anything is known about it: what to compare the first snapshot with. */
export const NO_TASKS: TasksSnapshot = { tasks: [], activeId: null, viewingId: null }

/** The task that is running in `snapshot`, if there is one. */
export function runningTask(snapshot: TasksSnapshot): Task | undefined {
  if (snapshot.activeId === null) return undefined
  const task = snapshot.tasks.find(({ id }) => id === snapshot.activeId)
  return task?.status === 'running' ? task : undefined
}

const ENDINGS = { done: 'taskDone', cancelled: 'taskCancelled', failed: 'taskFailed' } as const

/**
 * The events that take the character from `previous` to `next`, in the order
 * they happened: first how the task that was running ended, then the task
 * that is running now if it is another one, then the viewer closing.
 *
 * Only the task that was running in `previous` is followed, so each task is
 * reported as started once and as ended once, and tasks that were already
 * over when they were first seen (the history a page load restores) are
 * never reported at all.
 */
export function taskEvents(previous: TasksSnapshot, next: TasksSnapshot): TaskEvent[] {
  const events: TaskEvent[] = []

  const followed = runningTask(previous)
  if (followed) {
    const now = next.tasks.find(({ id }) => id === followed.id)
    // A task that is gone will never report how it ended.
    const status = now?.status ?? 'cancelled'
    if (status !== 'running') events.push({ type: ENDINGS[status], taskId: followed.id })
  }

  const running = runningTask(next)
  if (running && running.id !== followed?.id) events.push({ type: 'taskStarted', taskId: running.id })

  if (previous.viewingId !== null && next.viewingId === null) events.push({ type: 'viewerClosed' })

  return events
}
