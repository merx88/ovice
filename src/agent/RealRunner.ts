import type { AgentEvent, AgentRunner } from './types'

/** Placeholder for the real agent: every run fails straight away. */
export class RealRunner implements AgentRunner {
  async run(_prompt: string, onEvent: (e: AgentEvent) => void, signal: AbortSignal): Promise<void> {
    if (signal.aborted) return
    onEvent({ type: 'error', message: 'Real mode is not ready yet.' })
  }
}
