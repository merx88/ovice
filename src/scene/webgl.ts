/**
 * True when the browser can actually create a WebGL context. The WebGL
 * classes exist even where context creation is blocked (no GPU, a disabled
 * driver), so this tries it on a throwaway canvas.
 */
export function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}
