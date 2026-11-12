import type { AgentStep } from '../store/tasks'

/** What the character says while each step is in progress. */
export const STEP_MESSAGES: Record<AgentStep, string> = {
  reading: 'Reading your request...',
  searching: "I'm searching for information on the web...",
  comparing: 'Comparing what I found...',
  writing: 'Writing up the report...',
}

/** What the character says when a task ends. `done` is two lines, said in order. */
export const MESSAGES = {
  done: ['The research is ready.', 'Let me hand you the file.'],
  cancel: 'Okay, stopping.',
  error: 'Something went wrong.',
} as const
