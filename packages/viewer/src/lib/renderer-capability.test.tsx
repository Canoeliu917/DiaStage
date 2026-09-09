// @ts-expect-error — bun:test is provided by the Bun runtime; viewer does not
// include Bun ambient types in its production declaration build.
import { describe, expect, mock, test } from 'bun:test'
import {
  initializeGpuRenderer,
  type RendererBackendParameters,
  type RendererCapabilityCanvas,
} from './renderer-capability'

function canvasWithContexts(contexts: Partial<Record<'webgl2', unknown>>) {
  return {
    getContext: (contextId: 'webgl2') => contexts[contextId] ?? null,
  } satisfies RendererCapabilityCanvas
}

describe('GPU renderer capability and initialization', () => {
  test('uses a working WebGPU device without requiring WebGL', async () => {
    const device = {}
    const createRenderer = mock(() => ({ init: async () => undefined }))

    const result = await initializeGpuRenderer({
      createRenderer,
      gpu: {
        requestAdapter: async () => ({
          requestDevice: async () => device,
        }),
      },
    })

    expect(result.status).toBe('ready')
    expect(createRenderer).toHaveBeenCalledWith({ device })
  })

  test('reports unsupported when neither WebGPU nor WebGL is available', async () => {
    const createRenderer = mock(() => ({ init: async () => undefined }))

    const result = await initializeGpuRenderer({
      createRenderer,
      gpu: null,
      probeCanvas: canvasWithContexts({}),
    })

    expect(result.status).toBe('unsupported')
    expect(createRenderer).not.toHaveBeenCalled()
  })

  test('falls back to WebGL when WebGPU cannot provide a device', async () => {
    const webglContext = {}
    const init = mock(async () => undefined)
    const createRenderer = mock(() => ({ init }))

    const result = await initializeGpuRenderer({
      createRenderer,
      gpu: {
        requestAdapter: async () => ({
          requestDevice: async () => {
            throw new Error('device unavailable')
          },
        }),
      },
      probeCanvas: canvasWithContexts({ webgl2: webglContext }),
    })

    expect(result.status).toBe('ready')
    expect(createRenderer).toHaveBeenCalledWith({ forceWebGL: true })
    expect(init).toHaveBeenCalledTimes(1)
  })

  test('requests a fresh WebGL attempt when WebGPU renderer initialization fails', async () => {
    const device = {}
    const webglContext = {}
    const displayGetContext = mock((_contextId: 'webgl2', attributes?: { antialias?: boolean }) =>
      attributes?.antialias ? webglContext : null,
    )
    const webgpuDispose = mock(() => undefined)
    const webglInit = mock(async () => undefined)
    const createRenderer = mock(() => ({
      dispose: webgpuDispose,
      init: async () => {
        throw new Error('WebGPU renderer init failed')
      },
    }))

    const result = await initializeGpuRenderer({
      createRenderer,
      gpu: {
        requestAdapter: async () => ({
          requestDevice: async () => device,
        }),
      },
    })

    expect(result.status).toBe('unsupported')
    if (result.status === 'unsupported') expect(result.retryBackend).toBe('webgl')
    expect(createRenderer).toHaveBeenCalledTimes(1)
    expect(createRenderer).toHaveBeenCalledWith({ device })
    expect(webgpuDispose).not.toHaveBeenCalled()

    const retry = await initializeGpuRenderer({
      gpu: null,
      probeCanvas: canvasWithContexts({ webgl2: {} }),
      createRenderer: (parameters) => {
        expect(parameters).toEqual({ forceWebGL: true })
        return {
          init: async () => {
            expect(displayGetContext('webgl2', { antialias: true })).toBe(webglContext)
            await webglInit()
          },
        }
      },
    })
    expect(retry.status).toBe('ready')
    if (retry.status === 'ready') expect(retry.backend).toBe('webgl')
    expect(webglInit).toHaveBeenCalledTimes(1)
  })

  test('isolates WebGL capability probing from the display canvas', async () => {
    const probeContext = {}
    const displayContext = {}
    const probeGetContext = mock(() => probeContext)
    const displayGetContext = mock((_contextId: 'webgl2', attributes?: { antialias?: boolean }) =>
      attributes?.antialias ? displayContext : null,
    )

    const result = await initializeGpuRenderer({
      createRenderer: (backendParameters) => ({
        init: async () => {
          expect(backendParameters).toEqual({ forceWebGL: true })
          expect(displayGetContext('webgl2', { antialias: true })).toBe(displayContext)
        },
      }),
      gpu: null,
      probeCanvas: { getContext: probeGetContext },
    })

    expect(result.status).toBe('ready')
    expect(probeGetContext).toHaveBeenCalledTimes(1)
    expect(probeGetContext).toHaveBeenCalledWith('webgl2')
    expect(displayGetContext).toHaveBeenCalledTimes(1)
    expect(displayGetContext).toHaveBeenCalledWith('webgl2', { antialias: true })
  })

  test('times out a hung WebGPU adapter request and falls back to WebGL', async () => {
    const createRenderer = mock(() => ({ init: async () => undefined }))

    const result = await initializeGpuRenderer({
      createRenderer,
      gpu: {
        requestAdapter: () => new Promise<never>(() => undefined),
      },
      probeCanvas: canvasWithContexts({ webgl2: {} }),
      webgpuTimeoutMs: 10,
    })

    expect(result.status).toBe('ready')
    if (result.status === 'ready') expect(result.backend).toBe('webgl')
    expect(createRenderer).toHaveBeenCalledWith({ forceWebGL: true })
  })

  test('reports unsupported after a hung WebGPU adapter times out without WebGL', async () => {
    const result = await initializeGpuRenderer({
      createRenderer: () => ({ init: async () => undefined }),
      gpu: {
        requestAdapter: () => new Promise<never>(() => undefined),
      },
      probeCanvas: canvasWithContexts({}),
      webgpuTimeoutMs: 10,
    })

    expect(result.status).toBe('unsupported')
  })

  test('requests a fresh WebGL attempt after hung WebGPU renderer initialization', async () => {
    const device = {}
    const webgpuDispose = mock(() => undefined)
    const parameters: RendererBackendParameters[] = []

    const result = await initializeGpuRenderer({
      createRenderer: (backendParameters) => {
        parameters.push(backendParameters)
        return backendParameters.device
          ? {
              dispose: webgpuDispose,
              init: () => new Promise<never>(() => undefined),
            }
          : { init: async () => undefined }
      },
      gpu: {
        requestAdapter: async () => ({ requestDevice: async () => device }),
      },
      webgpuTimeoutMs: 10,
    })

    expect(result.status).toBe('unsupported')
    if (result.status === 'unsupported') expect(result.retryBackend).toBe('webgl')
    expect(parameters).toEqual([{ device }])
    expect(webgpuDispose).not.toHaveBeenCalled()
  })

  test('reports unsupported when WebGPU device and WebGL are unavailable', async () => {
    const result = await initializeGpuRenderer({
      createRenderer: () => ({ init: async () => undefined }),
      gpu: {
        requestAdapter: async () => null,
      },
      probeCanvas: canvasWithContexts({}),
    })

    expect(result.status).toBe('unsupported')
  })

  test('catches renderer initialization failure and selects the fallback UI', async () => {
    const dispose = mock(() => undefined)

    const result = await initializeGpuRenderer({
      createRenderer: () => ({
        dispose,
        init: async () => {
          throw new Error('getSupportedExtensions on null context')
        },
      }),
      gpu: null,
      probeCanvas: canvasWithContexts({ webgl2: {} }),
    })

    expect(result.status).toBe('unsupported')
    if (result.status === 'unsupported') expect(result.retryBackend).toBeUndefined()
    expect(dispose).not.toHaveBeenCalled()
  })

  test('forwards powerPreference to the adapter request', async () => {
    const requestAdapter = mock(async () => ({ requestDevice: async () => ({}) }))

    const result = await initializeGpuRenderer({
      createRenderer: () => ({ init: async () => undefined }),
      gpu: { requestAdapter },
      powerPreference: 'high-performance',
    })

    expect(result.status).toBe('ready')
    // Supplying `device` makes three skip its own requestAdapter, so losing the
    // hint here means dual-GPU users silently get the integrated GPU.
    expect(requestAdapter).toHaveBeenCalledWith({
      featureLevel: 'compatibility',
      powerPreference: 'high-performance',
    })
  })

  test('omits powerPreference when the caller does not supply one', async () => {
    const requestAdapter = mock(async () => ({ requestDevice: async () => ({}) }))

    await initializeGpuRenderer({
      createRenderer: () => ({ init: async () => undefined }),
      gpu: { requestAdapter },
    })

    expect(requestAdapter).toHaveBeenCalledWith({ featureLevel: 'compatibility' })
  })

  test('destroys the owned device when the WebGPU renderer needs a new WebGL attempt', async () => {
    const destroy = mock(() => undefined)
    const device = { destroy }

    const result = await initializeGpuRenderer({
      createRenderer: (backendParameters) =>
        backendParameters.device
          ? {
              init: async () => {
                throw new Error('WebGPU renderer init failed')
              },
            }
          : { init: async () => undefined },
      gpu: { requestAdapter: async () => ({ requestDevice: async () => device }) },
    })

    expect(result.status).toBe('unsupported')
    if (result.status === 'unsupported') expect(result.retryBackend).toBe('webgl')
    // three never destroys a caller-supplied device; disposing an uninitialized
    // renderer would await the already-failed init through setAnimationLoop.
    expect(destroy).toHaveBeenCalledTimes(1)
  })

  test('destroys a device that resolves after the request timed out', async () => {
    const destroy = mock(() => undefined)
    let resolveDevice: (device: unknown) => void = () => undefined

    const result = await initializeGpuRenderer({
      createRenderer: () => ({ init: async () => undefined }),
      gpu: {
        requestAdapter: async () => ({
          requestDevice: () =>
            new Promise((resolve) => {
              resolveDevice = resolve
            }),
        }),
      },
      probeCanvas: canvasWithContexts({ webgl2: {} }),
      webgpuTimeoutMs: 10,
    })

    expect(result.status).toBe('ready')
    if (result.status === 'ready') expect(result.backend).toBe('webgl')

    resolveDevice({ destroy })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(destroy).toHaveBeenCalledTimes(1)
  })

  test('reports unsupported when the probe canvas has a context but the display canvas does not', async () => {
    const dispose = mock(() => undefined)

    const result = await initializeGpuRenderer({
      createRenderer: () => ({
        dispose,
        // Chrome's live-context cap means the probe can succeed while the
        // display canvas — created with different attributes — returns null.
        init: async () => {
          throw new TypeError("Cannot read properties of null (reading 'getSupportedExtensions')")
        },
      }),
      gpu: null,
      probeCanvas: canvasWithContexts({ webgl2: {} }),
    })

    expect(result.status).toBe('unsupported')
    if (result.status === 'unsupported') expect(result.error).toBeInstanceOf(TypeError)
    expect(dispose).not.toHaveBeenCalled()
  })

  test('releases the temporary WebGL probe before initializing the display renderer', async () => {
    const loseContext = mock(() => undefined)
    const getExtension = mock(() => ({ loseContext }))
    const result = await initializeGpuRenderer({
      gpu: null,
      probeCanvas: canvasWithContexts({ webgl2: { getExtension } }),
      createRenderer: () => ({
        init: async () => {
          expect(loseContext).toHaveBeenCalledTimes(1)
        },
      }),
    })

    expect(result.status).toBe('ready')
    expect(getExtension).toHaveBeenCalledWith('WEBGL_lose_context')
  })

  test('releases a successful renderer and its owned device once, preserving dispose this', async () => {
    const destroy = mock(() => undefined)
    const device = { destroy }
    const disposedInstances: unknown[] = []
    const renderer = {
      init: async () => undefined,
      dispose() {
        disposedInstances.push(this)
      },
    }
    const result = await initializeGpuRenderer({
      gpu: { requestAdapter: async () => ({ requestDevice: async () => device }) },
      createRenderer: () => renderer,
    })

    expect(result.status).toBe('ready')
    expect(destroy).not.toHaveBeenCalled()
    renderer.dispose()
    renderer.dispose()
    expect(disposedInstances).toEqual([renderer])
    expect(destroy).toHaveBeenCalledTimes(1)
  })

  test('still releases the owned device when renderer disposal throws', async () => {
    const destroy = mock(() => undefined)
    const renderer = {
      init: async () => undefined,
      dispose: mock(() => {
        throw new Error('cleanup failed')
      }),
    }
    await initializeGpuRenderer({
      gpu: { requestAdapter: async () => ({ requestDevice: async () => ({ destroy }) }) },
      createRenderer: () => renderer,
    })

    expect(() => renderer.dispose()).toThrow('cleanup failed')
    expect(destroy).toHaveBeenCalledTimes(1)
    renderer.dispose()
    expect(destroy).toHaveBeenCalledTimes(1)
  })

  test('disposes a late init success without touching a subsequent fresh initialization', async () => {
    const destroy = mock(() => undefined)
    const oldDispose = mock(() => undefined)
    const fallbackDispose = mock(() => undefined)
    let finishInit: () => void = () => undefined
    const result = await initializeGpuRenderer({
      gpu: { requestAdapter: async () => ({ requestDevice: async () => ({ destroy }) }) },
      webgpuTimeoutMs: 10,
      createRenderer: (parameters) =>
        parameters.device
          ? {
              init: () =>
                new Promise<void>((resolve) => {
                  finishInit = resolve
                }),
              dispose: oldDispose,
            }
          : { init: async () => undefined, dispose: fallbackDispose },
    })

    expect(result.status).toBe('unsupported')
    if (result.status === 'unsupported') expect(result.retryBackend).toBe('webgl')
    expect(destroy).toHaveBeenCalledTimes(1)
    expect(oldDispose).not.toHaveBeenCalled()
    const retry = await initializeGpuRenderer({
      gpu: null,
      probeCanvas: canvasWithContexts({ webgl2: {} }),
      createRenderer: () => ({ init: async () => undefined, dispose: fallbackDispose }),
    })
    expect(retry.status).toBe('ready')
    finishInit()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(oldDispose).toHaveBeenCalledTimes(1)
    expect(fallbackDispose).not.toHaveBeenCalled()
    expect(destroy).toHaveBeenCalledTimes(1)
  })

  test('handles a late init rejection without disposing the uninitialized renderer', async () => {
    const destroy = mock(() => undefined)
    const dispose = mock(() => undefined)
    let failInit: (error: Error) => void = () => undefined
    const result = await initializeGpuRenderer({
      gpu: { requestAdapter: async () => ({ requestDevice: async () => ({ destroy }) }) },
      webgpuTimeoutMs: 10,
      createRenderer: (parameters) =>
        parameters.device
          ? {
              init: () =>
                new Promise<never>((_resolve, reject) => {
                  failInit = reject
                }),
              dispose,
            }
          : { init: async () => undefined },
    })

    expect(result.status).toBe('unsupported')
    if (result.status === 'unsupported') expect(result.retryBackend).toBe('webgl')
    failInit(new Error('late failure'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(dispose).not.toHaveBeenCalled()
    expect(destroy).toHaveBeenCalledTimes(1)
  })
})
