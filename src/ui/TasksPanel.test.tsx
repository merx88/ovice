import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { useTasks, type Task, type TaskStatus } from '../store/tasks'
import { TasksPanel } from './TasksPanel'

const STATUS_LABELS: Record<TaskStatus, string> = {
  running: '진행 중',
  done: '완료',
  cancelled: '취소됨',
  failed: '실패',
}

let serial = 0

/** A task as the store would hold it in the status given. */
function task(status: TaskStatus, prompt: string, patch: Partial<Task> = {}): Task {
  serial += 1
  return {
    id: `task-${serial}`,
    prompt,
    status,
    step: 'writing',
    message: 'Writing up the report...',
    result: status === 'done' ? { title: prompt, markdown: `# ${prompt}` } : null,
    error: status === 'failed' ? 'Something went wrong.' : null,
    createdAt: Date.UTC(2026, 10, 13, 4, serial),
    finishedAt: status === 'running' ? null : Date.UTC(2026, 10, 13, 5, serial),
    ...patch,
  }
}

function show(...tasks: Task[]) {
  useTasks.setState({ tasks, activeId: tasks.find((t) => t.status === 'running')?.id ?? null, viewingId: null })
  return render(<TasksPanel />)
}

beforeEach(() => {
  localStorage.clear()
  useTasks.setState({ tasks: [], activeId: null, viewingId: null })
})

describe('TasksPanel', () => {
  it('says so when no task has been given yet', () => {
    show()
    expect(screen.getByText('아직 맡긴 작업이 없어요')).toBeInTheDocument()
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
  })

  it('is a named part of the page with a heading', () => {
    show()
    expect(screen.getByRole('region', { name: '작업 목록' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '작업 목록' })).toBeInTheDocument()
  })

  it('lists the tasks newest first, as the store holds them', () => {
    show(task('running', 'third'), task('done', 'second'), task('cancelled', 'first'))
    const rows = screen.getAllByRole('listitem')
    expect(rows.map((row) => within(row).getByText(/first|second|third/).textContent)).toEqual([
      'third',
      'second',
      'first',
    ])
    expect(screen.queryByText('아직 맡긴 작업이 없어요')).not.toBeInTheDocument()
  })

  it.each(Object.entries(STATUS_LABELS) as [TaskStatus, string][])(
    'labels a %s task “%s”',
    (status, label) => {
      show(task(status, 'compare three laptops'))
      expect(within(screen.getByRole('listitem')).getByText(label)).toBeInTheDocument()
      for (const other of Object.values(STATUS_LABELS)) {
        if (other !== label) expect(screen.queryByText(other)).not.toBeInTheDocument()
      }
    },
  )

  it('opens the result of a finished task when its row is pressed', async () => {
    const done = task('done', 'compare three laptops')
    show(task('running', 'a newer one'), done)
    await userEvent.click(screen.getByRole('button', { name: /compare three laptops/ }))
    expect(useTasks.getState().viewingId).toBe(done.id)
  })

  it('opens it from the keyboard as well', async () => {
    const done = task('done', 'compare three laptops')
    show(done)
    await userEvent.tab()
    expect(screen.getByRole('button', { name: /compare three laptops/ })).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    expect(useTasks.getState().viewingId).toBe(done.id)
  })

  it.each(['running', 'cancelled', 'failed'] as const)('offers nothing to press on a %s task', (status) => {
    show(task(status, 'compare three laptops'))
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText('compare three laptops')).toBeInTheDocument()
  })

  it('offers nothing to press on a finished task that has no result', () => {
    show(task('done', 'compare three laptops', { result: null }))
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('never shows the last progress line of a task', () => {
    show(
      task('running', 'a'),
      task('done', 'b'),
      task('cancelled', 'c', { message: 'Okay, stopping.' }),
      task('failed', 'd'),
    )
    expect(screen.queryByText('Writing up the report...')).not.toBeInTheDocument()
    expect(screen.queryByText('Okay, stopping.')).not.toBeInTheDocument()
    expect(screen.queryByText('Something went wrong.')).not.toBeInTheDocument()
  })

  it('shows when each task was given, in a form machines can read too', () => {
    const created = Date.UTC(2026, 10, 13, 4, 20)
    show(task('done', 'compare three laptops', { createdAt: created }))
    const time = screen.getByRole('listitem').querySelector('time')
    expect(time).toHaveAttribute('datetime', new Date(created).toISOString())
    expect(time?.textContent).toMatch(/\d/)
  })

  it('leaves the time out, instead of failing, when the stored time is not one', () => {
    show(task('done', 'compare three laptops', { createdAt: 1e20 }), task('failed', 'another', { createdAt: NaN }))
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(document.querySelector('time')).toBeNull()
  })

  it('shows a prompt as the text it is', () => {
    const hostile = '<img src=x onerror=alert(1)> **bold** # heading'
    const { container } = show(task('done', hostile), task('failed', hostile))
    expect(screen.getAllByText(hostile)).toHaveLength(2)
    expect(container.querySelector('img, strong, h1')).toBeNull()
  })

  it('follows the store: a running task becomes a finished one that can be opened', () => {
    const running = task('running', 'compare three laptops')
    show(running)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    act(() => useTasks.getState().update(running.id, { status: 'done', result: { title: 't', markdown: 'm' } }))
    expect(screen.getByRole('button', { name: /compare three laptops/ })).toBeInTheDocument()
    expect(screen.getByText('완료')).toBeInTheDocument()
  })
})
