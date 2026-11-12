import { describe, expect, it } from 'vitest'
import { RealRunner } from './RealRunner'
import type { AgentEvent } from './types'

describe('RealRunner', () => {
  it('reports right away that real mode is not ready', async () => {
    const events: AgentEvent[] = []

    await new RealRunner().run('prompt', (event) => events.push(event), new AbortController().signal)

    expect(events).toEqual([{ type: 'error', message: 'Real mode is not ready yet.' }])
  })

  it('emits nothing when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const events: AgentEvent[] = []

    await new RealRunner().run('prompt', (event) => events.push(event), controller.signal)

    expect(events).toEqual([])
  })
})
