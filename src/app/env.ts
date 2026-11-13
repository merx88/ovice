/** True when the URL asks for shortened timings (`?fast=1`). */
export function fastMode(): boolean {
  return new URLSearchParams(window.location.search).get('fast') === '1'
}

/**
 * When this page was loaded: what the wall clock (`Date.now()`) read as the
 * page's script started, in milliseconds since 1970. It is the clock a task
 * is stamped with when it is created, so the two can be compared.
 *
 * Not `performance.timeOrigin`: that is counted on a clock which stands still
 * while the computer sleeps, and after a sleep it can read well before the
 * page was really loaded. A task from before a reload would then look as if
 * it belonged to this page.
 *
 * The one place that starts a task (`agent/orchestrator.ts`) imports this
 * file, so this has been read before any task of this page load can exist.
 */
export const PAGE_LOADED_AT = Date.now()
