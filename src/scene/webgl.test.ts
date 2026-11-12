import { afterEach, describe, expect, it, vi } from 'vitest'
import { isWebGLAvailable } from './webgl'

/** Makes every canvas hand out a context for the listed context types only. */
function stubGetContext(supported: string[]) {
  return vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation(((type: string) => (supported.includes(type) ? {} : null)) as HTMLCanvasElement['getContext'])
}

describe('isWebGLAvailable', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('is true when a webgl2 context can be created', () => {
    const getContext = stubGetContext(['webgl2', 'webgl'])
    expect(isWebGLAvailable()).toBe(true)
    expect(getContext).toHaveBeenCalledWith('webgl2')
  })

  it('falls back to webgl 1', () => {
    stubGetContext(['webgl'])
    expect(isWebGLAvailable()).toBe(true)
  })

  it('is false when no context can be created, even though the WebGL classes exist', () => {
    vi.stubGlobal('WebGLRenderingContext', class {})
    stubGetContext([])
    expect(isWebGLAvailable()).toBe(false)
    vi.unstubAllGlobals()
  })

  it('is false when creating a context throws', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      throw new Error('context creation blocked')
    })
    expect(isWebGLAvailable()).toBe(false)
  })
})
