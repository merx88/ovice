import { create } from 'zustand'
import { safeLoad, safeSave } from './storage'

export type TaskStatus = 'running' | 'done' | 'cancelled' | 'failed'
export type AgentStep = 'reading' | 'searching' | 'comparing' | 'writing'

export interface Task {
  id: string
  prompt: string
  status: TaskStatus
  step: AgentStep | null
  message: string | null
  result: { title: string; markdown: string } | null
  error: string | null
  createdAt: number
  finishedAt: number | null
}

export interface TasksState {
  /** Newest first. */
  tasks: Task[]
  /** Id of the running task, or null when nothing is running. */
  activeId: string | null
  viewingId: string | null
  create: (prompt: string) => Task
  update: (id: string, patch: Partial<Task>) => void
  setViewing: (id: string | null) => void
}

const STORAGE_KEY = 'ovice.tasks.v1'
const STATUSES: readonly unknown[] = ['running', 'done', 'cancelled', 'failed'] satisfies TaskStatus[]
const STEPS: readonly unknown[] = ['reading', 'searching', 'comparing', 'writing'] satisfies AgentStep[]

function isResult(value: unknown): value is Task['result'] {
  if (value === null) return true
  if (typeof value !== 'object') return false
  const { title, markdown } = value as Record<string, unknown>
  return typeof title === 'string' && typeof markdown === 'string'
}

function isTask(value: unknown): value is Task {
  if (typeof value !== 'object' || value === null) return false
  const task = value as Record<string, unknown>
  return (
    typeof task.id === 'string' &&
    typeof task.prompt === 'string' &&
    STATUSES.includes(task.status) &&
    (task.step === null || STEPS.includes(task.step)) &&
    (task.message === null || typeof task.message === 'string') &&
    isResult(task.result) &&
    (task.error === null || typeof task.error === 'string') &&
    typeof task.createdAt === 'number' &&
    (task.finishedAt === null || typeof task.finishedAt === 'number')
  )
}

/**
 * Reads the stored tasks, dropping anything that is not a task. Nothing
 * survives a page load still running, so a task stored as `running` was
 * interrupted: it comes back as `cancelled`, finished now.
 */
function loadStoredTasks(): Task[] {
  const raw = safeLoad<unknown>(STORAGE_KEY, null)
  if (!Array.isArray(raw)) return []

  const now = Date.now()
  let interrupted = false
  const tasks = raw.filter(isTask).map((task): Task => {
    if (task.status !== 'running') return task
    interrupted = true
    return { ...task, status: 'cancelled', finishedAt: now }
  })
  if (interrupted) safeSave(STORAGE_KEY, tasks)
  return tasks
}

export function createTasksStore() {
  const store = create<TasksState>()((set) => ({
    tasks: loadStoredTasks(),
    activeId: null,
    viewingId: null,
    create: (prompt) => {
      const task: Task = {
        id: crypto.randomUUID(),
        prompt,
        status: 'running',
        step: null,
        message: null,
        result: null,
        error: null,
        createdAt: Date.now(),
        finishedAt: null,
      }
      set((state) => ({ tasks: [task, ...state.tasks], activeId: task.id }))
      return task
    },
    update: (id, patch) =>
      set((state) => {
        const current = state.tasks.find((task) => task.id === id)
        if (!current) return state
        const next: Task = { ...current, ...patch, id }
        return {
          tasks: state.tasks.map((task) => (task === current ? next : task)),
          activeId: state.activeId === id && next.status !== 'running' ? null : state.activeId,
        }
      }),
    setViewing: (viewingId) => set({ viewingId }),
  }))

  store.subscribe((state, previous) => {
    if (state.tasks !== previous.tasks) safeSave(STORAGE_KEY, state.tasks)
  })

  return store
}

export const useTasks = createTasksStore()
