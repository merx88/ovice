import { useTasks, type Task, type TaskStatus } from '../store/tasks'
import { Icon } from './Icon'
import './dock.css'

/** The id of the panel, for the button that opens it. */
export const TASKS_PANEL_ID = 'tasks-panel'
const TITLE_ID = 'tasks-panel-title'

const STATUS_LABELS: Record<TaskStatus, string> = {
  running: '진행 중',
  done: '완료',
  cancelled: '취소됨',
  failed: '실패',
}

const CREATED_FORMAT = new Intl.DateTimeFormat('ko-KR', {
  month: 'long',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

/** When the task was given, or nothing if what the store holds is not a time. */
function Created({ at }: { at: number }) {
  const date = new Date(at)
  if (Number.isNaN(date.getTime())) return null
  return <time dateTime={date.toISOString()}>{CREATED_FORMAT.format(date)}</time>
}

function TaskRow({ task, onOpen }: { task: Task; onOpen(id: string): void }) {
  // The prompt is the user's own text and is shown as such. The agent's last
  // progress line (`task.message`) is stale once the task has ended and is left out.
  const content = (
    <>
      <span className="task__prompt">{task.prompt}</span>
      <span className="task__meta">
        <span className="task__status" data-status={task.status}>
          {STATUS_LABELS[task.status]}
        </span>
        <Created at={task.createdAt} />
      </span>
    </>
  )

  if (task.status === 'done' && task.result !== null) {
    return (
      <li>
        <button type="button" className="task task--open" onClick={() => onOpen(task.id)}>
          <span className="task__body">{content}</span>
          <Icon name="chevronRight" size={18} />
        </button>
      </li>
    )
  }
  return (
    <li>
      <div className="task">
        <span className="task__body">{content}</span>
      </div>
    </li>
  )
}

/** The panel above the dock that lists every task, newest first; a finished one opens its result. */
export function TasksPanel() {
  const tasks = useTasks((state) => state.tasks)
  const setViewing = useTasks((state) => state.setViewing)

  return (
    <section id={TASKS_PANEL_ID} className="panel panel--tasks" aria-labelledby={TITLE_ID} tabIndex={-1}>
      <h2 id={TITLE_ID} className="panel__title">
        작업 목록
      </h2>
      {tasks.length === 0 ? (
        <p className="panel__empty">아직 맡긴 작업이 없어요</p>
      ) : (
        <ul className="tasks">
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} onOpen={setViewing} />
          ))}
        </ul>
      )}
    </section>
  )
}
