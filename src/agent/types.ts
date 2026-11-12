import type { AgentStep } from '../store/tasks'

export type AgentEvent =
  | { type: 'step'; step: AgentStep; message: string }
  | { type: 'done'; result: { title: string; markdown: string } }
  | { type: 'error'; message: string }

export interface AgentRunner {
  run(prompt: string, onEvent: (e: AgentEvent) => void, signal: AbortSignal): Promise<void>
}
