import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentStep } from '../store/tasks'
import { MESSAGES, STEP_MESSAGES } from './messages'
import { MockRunner, STEP_DURATIONS_MS, STEP_ORDER } from './MockRunner'
import { buildMockReport } from './mockReport'
import type { AgentEvent } from './types'

const START = new Date(2026, 10, 12, 9, 0, 0)

/** Starts a run and records what it emits and whether it has settled. */
function start(runner: MockRunner, signal: AbortSignal, prompt = 'Compare three note apps') {
  const events: AgentEvent[] = []
  const run = { events, resolved: false }
  void runner
    .run(prompt, (event) => events.push(event), signal)
    .then(() => {
      run.resolved = true
    })
  return run
}

function last(events: AgentEvent[]): AgentEvent {
  return events[events.length - 1]
}

function stepEvent(step: AgentStep): AgentEvent {
  return { type: 'step', step, message: STEP_MESSAGES[step] }
}

describe('agent messages', () => {
  it('uses the agreed wording for every step', () => {
    expect(STEP_MESSAGES).toEqual({
      reading: 'Reading your request...',
      searching: "I'm searching for information on the web...",
      comparing: 'Comparing what I found...',
      writing: 'Writing up the report...',
    })
  })

  it('uses the agreed wording for done, cancel and error', () => {
    expect(MESSAGES).toEqual({
      done: ['The research is ready.', 'Let me hand you the file.'],
      cancel: 'Okay, stopping.',
      error: 'Something went wrong.',
    })
  })
})

describe('MockRunner', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(START)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('exports the step order and durations', () => {
    expect(STEP_ORDER).toEqual(['reading', 'searching', 'comparing', 'writing'])
    expect(STEP_DURATIONS_MS).toEqual({ reading: 2500, searching: 4500, comparing: 3000, writing: 3500 })
  })

  it('emits each step when it starts, then done at 13.5s', async () => {
    const run = start(new MockRunner(), new AbortController().signal)

    expect(run.events).toEqual([stepEvent('reading')])

    await vi.advanceTimersByTimeAsync(2499)
    expect(run.events).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(run.events).toEqual([stepEvent('reading'), stepEvent('searching')])

    await vi.advanceTimersByTimeAsync(4499)
    expect(run.events).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(last(run.events)).toEqual(stepEvent('comparing'))

    await vi.advanceTimersByTimeAsync(2999)
    expect(run.events).toHaveLength(3)
    await vi.advanceTimersByTimeAsync(1)
    expect(last(run.events)).toEqual(stepEvent('writing'))

    await vi.advanceTimersByTimeAsync(3499)
    expect(run.events).toHaveLength(4)
    expect(run.resolved).toBe(false)
    await vi.advanceTimersByTimeAsync(1)

    expect(run.events.map((event) => (event.type === 'step' ? event.step : event.type))).toEqual([
      'reading',
      'searching',
      'comparing',
      'writing',
      'done',
    ])
    expect(run.resolved).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('finishes with the mock report for the prompt, dated when the run ends', async () => {
    const run = start(new MockRunner(), new AbortController().signal, 'Compare three note apps')

    await vi.advanceTimersByTimeAsync(13_500)

    expect(last(run.events)).toEqual({
      type: 'done',
      result: buildMockReport('Compare three note apps', new Date(START.getTime() + 13_500)),
    })
  })

  it('scales every duration by timeScale', async () => {
    const run = start(new MockRunner({ timeScale: 0.05 }), new AbortController().signal)

    await vi.advanceTimersByTimeAsync(124)
    expect(run.events).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(run.events).toHaveLength(2)

    await vi.advanceTimersByTimeAsync(550)
    expect(run.events).toHaveLength(5)
    expect(last(run.events).type).toBe('done')
    expect(run.resolved).toBe(true)
  })

  it('stops emitting and resolves when aborted mid-run', async () => {
    const controller = new AbortController()
    const run = start(new MockRunner(), controller.signal)

    await vi.advanceTimersByTimeAsync(3000)
    expect(run.events).toEqual([stepEvent('reading'), stepEvent('searching')])

    controller.abort()
    await vi.advanceTimersByTimeAsync(0)
    expect(run.resolved).toBe(true)
    expect(vi.getTimerCount()).toBe(0)

    await vi.advanceTimersByTimeAsync(20_000)
    expect(run.events).toHaveLength(2)
  })

  it('emits nothing and resolves when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const run = start(new MockRunner(), controller.signal)

    await vi.advanceTimersByTimeAsync(0)
    expect(run.resolved).toBe(true)
    expect(vi.getTimerCount()).toBe(0)

    await vi.advanceTimersByTimeAsync(20_000)
    expect(run.events).toEqual([])
  })

  it('stops when the listener aborts while handling an event', async () => {
    const controller = new AbortController()
    const events: AgentEvent[] = []
    let resolved = false
    void new MockRunner()
      .run(
        'prompt',
        (event) => {
          events.push(event)
          if (event.type === 'step' && event.step === 'searching') controller.abort()
        },
        controller.signal,
      )
      .then(() => {
        resolved = true
      })

    await vi.advanceTimersByTimeAsync(2500)
    expect(resolved).toBe(true)
    expect(vi.getTimerCount()).toBe(0)

    await vi.advanceTimersByTimeAsync(20_000)
    expect(events).toEqual([stepEvent('reading'), stepEvent('searching')])
  })

  it('fails at the end of the failAt step with the error message', async () => {
    const run = start(new MockRunner({ failAt: 'comparing' }), new AbortController().signal)

    await vi.advanceTimersByTimeAsync(9999)
    expect(run.events).toEqual([stepEvent('reading'), stepEvent('searching'), stepEvent('comparing')])
    expect(run.resolved).toBe(false)

    await vi.advanceTimersByTimeAsync(1)
    expect(last(run.events)).toEqual({ type: 'error', message: MESSAGES.error })
    expect(run.resolved).toBe(true)
    expect(vi.getTimerCount()).toBe(0)

    await vi.advanceTimersByTimeAsync(20_000)
    expect(run.events).toHaveLength(4)
    expect(run.events.some((event) => event.type === 'done')).toBe(false)
  })

  it('does not fail when aborted before the failAt step ends', async () => {
    const controller = new AbortController()
    const run = start(new MockRunner({ failAt: 'reading' }), controller.signal)

    await vi.advanceTimersByTimeAsync(1000)
    controller.abort()
    await vi.advanceTimersByTimeAsync(20_000)

    expect(run.events).toEqual([stepEvent('reading')])
    expect(run.resolved).toBe(true)
  })

  it.each([
    ['a completed run', undefined, 13_500],
    ['a failed run', 'searching' as const, 7000],
  ])('leaves no abort listener on the signal after %s', async (_name, failAt, duration) => {
    const { signal } = new AbortController()
    const added = vi.spyOn(signal, 'addEventListener')
    const removed = vi.spyOn(signal, 'removeEventListener')
    const run = start(new MockRunner({ failAt }), signal)

    await vi.advanceTimersByTimeAsync(duration)

    expect(run.resolved).toBe(true)
    expect(added.mock.calls.length).toBeGreaterThan(0)
    for (const [type, listener] of added.mock.calls) {
      expect(type).toBe('abort')
      expect(removed).toHaveBeenCalledWith('abort', listener)
    }
  })

  it('rejects and leaves nothing pending when the listener throws', async () => {
    const failure = new Error('listener failed')
    const run = new MockRunner().run(
      'prompt',
      (event) => {
        if (event.type === 'step' && event.step === 'searching') throw failure
      },
      new AbortController().signal,
    )
    const outcome = expect(run).rejects.toBe(failure)

    await vi.advanceTimersByTimeAsync(2500)

    await outcome
    expect(vi.getTimerCount()).toBe(0)
  })
})
