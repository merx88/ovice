/**
 * Reads a JSON value from localStorage. Returns `fallback` when the key is
 * missing, the stored text is not valid JSON, or storage is unavailable.
 * The parsed value is not validated: callers check its shape themselves.
 */
export function safeLoad<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

/**
 * Writes a JSON value to localStorage. Failures (storage blocked or full,
 * value not serializable) are swallowed so the app keeps running in memory.
 */
export function safeSave(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Persistence is best effort.
  }
}
