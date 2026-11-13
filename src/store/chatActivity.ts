// When the chat was last used. The prompt field reports it; the character's
// driver watches it, because a character that waits on the sofa hurries back
// to its desk as soon as somebody is about to write to it.
import { create } from 'zustand'

export interface ChatActivityState {
  /**
   * When the chat was last used, on the page's own clock (`performance.now()`,
   * in ms), which is the clock the character goes by; -Infinity until it has
   * been used at all.
   */
  at: number
  /** For the chat field: it has been focused or pressed, or its text has changed. */
  report: () => void
}

export function createChatActivityStore() {
  return create<ChatActivityState>()((set) => ({
    at: -Infinity,
    report: () => set({ at: performance.now() }),
  }))
}

export const useChatActivity = createChatActivityStore()
