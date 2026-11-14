// What a change of the tasks store means to the character: which task it
// should start working on, how the task it was working on ended, and when the
// result viewer was closed on which result. And what the store means to a
// character that sees it for the first time.
import type { Task, TasksState } from '../store/tasks'

/** The part of the tasks store the character reacts to. */
export type TasksSnapshot = Pick<TasksState, 'tasks' | 'activeId' | 'viewingId'>

/** An event for the character's state machine, with the task it is about. */
export type TaskEvent =
  | { type: 'taskStarted' | 'taskDone' | 'taskCancelled' | 'taskFailed'; taskId: string }
  /** The result viewer was closed; `taskId` is the task whose result it was showing. */
  | { type: 'viewerClosed'; taskId: string }

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
 * that is running now if it is another one, then the viewer closing on the
 * result it was showing.
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

  if (previous.viewingId !== null && next.viewingId === null) {
    events.push({ type: 'viewerClosed', taskId: previous.viewingId })
  }

  return events
}

/**
 * The result that is still waiting to be handed over in a store nobody has
 * watched so far: that of the newest task, if the task finished with one
 * during this page load and the viewer is not already showing it. Tasks are
 * kept newest first. `pageLoadedAt` has to be a reading of the clock
 * `createdAt` is stamped from, the wall clock (`Date.now()`); the page's own
 * time origin is counted on another one, which falls behind while a computer
 * sleeps.
 */
function waitingResult(found: TasksSnapshot, pageLoadedAt: number): Task | undefined {
  const newest: Task | undefined = found.tasks[0]
  if (newest?.status !== 'done' || newest.result === null) return undefined
  // What an earlier page load produced has been handed over there, or never will be.
  if (newest.createdAt < pageLoadedAt) return undefined
  // A result somebody is reading has been delivered.
  if (found.viewingId === newest.id) return undefined
  return newest
}

/**
 * The events for a character that looks at the tasks for the first time. That
 * can be well after the page was loaded at `pageLoadedAt`: its model can take
 * longer to arrive than a task takes to run.
 *
 * A task that is running is picked up, as `taskEvents` picks it up from
 * `NO_TASKS`. Failing that, a result that is still waiting is reported as a
 * task that started and is done, which is what the character would have been
 * told had it been there all along; so it stands up and hands the result over.
 * Everything else in the store is history and is not reported.
 *
 * This is for the first sight only. From then on `taskEvents` tells what
 * changes, which is how a result is handed over once and not again.
 */
export function taskEventsAtFirstSight(found: TasksSnapshot, pageLoadedAt: number): TaskEvent[] {
  const running = runningTask(found)
  if (running) return [{ type: 'taskStarted', taskId: running.id }]

  const waiting = waitingResult(found, pageLoadedAt)
  if (!waiting) return []
  return [
    { type: 'taskStarted', taskId: waiting.id },
    { type: 'taskDone', taskId: waiting.id },
  ]
}
