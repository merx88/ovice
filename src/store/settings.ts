import { create } from 'zustand'
import { safeLoad, safeSave } from './storage'

export type AgentMode = 'prototype' | 'real'

export interface SettingsState {
  mode: AgentMode
  parallax: boolean
  reduceMotion: boolean
  /** Switches mode when it is available; `{ ok: false }` leaves the mode unchanged. */
  setMode: (mode: AgentMode) => { ok: boolean }
  setParallax: (parallax: boolean) => void
  setReduceMotion: (reduceMotion: boolean) => void
}

const STORAGE_KEY = 'ovice.settings.v1'
const DEFAULT_MODE: AgentMode = 'prototype'
const AVAILABLE_MODES: readonly AgentMode[] = ['prototype']

function isAvailableMode(value: unknown): value is AgentMode {
  return AVAILABLE_MODES.some((mode) => mode === value)
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches === true
  } catch {
    return false
  }
}

/** The stored settings that are present and well typed; anything else is left out. */
function loadStoredSettings(): Partial<Pick<SettingsState, 'mode' | 'parallax' | 'reduceMotion'>> {
  const raw = safeLoad<unknown>(STORAGE_KEY, null)
  if (typeof raw !== 'object' || raw === null) return {}
  const { mode, parallax, reduceMotion } = raw as Record<string, unknown>
  return {
    mode: isAvailableMode(mode) ? mode : undefined,
    parallax: typeof parallax === 'boolean' ? parallax : undefined,
    reduceMotion: typeof reduceMotion === 'boolean' ? reduceMotion : undefined,
  }
}

export function createSettingsStore() {
  const stored = loadStoredSettings()
  // reduceMotion is only saved once it has been chosen explicitly, so that
  // until then every load keeps following the OS preference.
  let reduceMotionChosen = stored.reduceMotion !== undefined

  const store = create<SettingsState>()((set) => ({
    mode: stored.mode ?? DEFAULT_MODE,
    parallax: stored.parallax ?? true,
    reduceMotion: stored.reduceMotion ?? prefersReducedMotion(),
    setMode: (mode) => {
      if (!isAvailableMode(mode)) return { ok: false }
      set({ mode })
      return { ok: true }
    },
    setParallax: (parallax) => set({ parallax }),
    setReduceMotion: (reduceMotion) => {
      reduceMotionChosen = true
      set({ reduceMotion })
    },
  }))

  store.subscribe(({ mode, parallax, reduceMotion }) => {
    safeSave(STORAGE_KEY, reduceMotionChosen ? { mode, parallax, reduceMotion } : { mode, parallax })
  })

  return store
}

export const useSettings = createSettingsStore()
