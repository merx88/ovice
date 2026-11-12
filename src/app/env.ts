/** True when the URL asks for shortened timings (`?fast=1`). */
export function fastMode(): boolean {
  return new URLSearchParams(window.location.search).get('fast') === '1'
}
