export type RendererCapabilityCanvas = {
  getContext(contextId: 'webgl2'): unknown
}

/** Mirrors `GPUPowerPreference` without pulling WebGPU ambient types into the declaration build. */
export type RendererPowerPreference = 'high-performance' | 'low-power'

type RendererGpuAdapter = {
  features?: Iterable<string>
  requestDevice(descriptor?: { requiredFeatures?: string[] }): Promise<unknown>
}

type RendererGpu = {
  requestAdapter(options?: Record<string, unknown>): Promise<RendererGpuAdapter | null>
}

export type RendererCapability =
  | { backend: 'webgpu'; device: unknown; status: 'supported' }
  | { backend: 'webgl'; status: 'supported' }
  | { error?: unknown; status: 'unsupported' }

export type RendererBackendParameters = {
  device?: unknown
  forceWebGL?: boolean
}

type InitializableRenderer = {
  dispose?: () => void
  init: () => Promise<unknown>
}

export type RendererInitializationResult<Renderer> =
  | { backend: 'webgpu' | 'webgl'; renderer: Renderer; status: 'ready' }
  | { error?: unknown; retryBackend?: 'webgl'; status: 'unsupported' }

const WEBGPU_INITIALIZATION_TIMEOUT_MS = 4000

function browserGpu(): RendererGpu | null {
  if (typeof navigator === 'undefined') return null
  return (navigator as Navigator & { gpu?: RendererGpu }).gpu ?? null
}

function browserCanvas(): RendererCapabilityCanvas | null {
  if (typeof document === 'undefined') return null
  return document.createElement('canvas')
}

/**
 * Because we hand the device to `WebGPURenderer` ourselves, three treats it as
 * caller-owned and never destroys it. Release it on failed initialization and
 * attach ownership to a successfully initialized renderer's disposal.
 */
function releaseDevice(device: unknown) {
  try {
    ;(device as { destroy?: () => void } | null)?.destroy?.()
  } catch {}
}

function releaseProbeContext(context: unknown) {
  try {
    const gl = context as {
      getExtension?: (name: string) => { loseContext?: () => void } | null
    }
    gl.getExtension?.('WEBGL_lose_context')?.loseContext?.()
  } catch {}
}

function withTimeout<Result>(promise: Promise<Result>, timeoutMs: number, operation: string) {
  let timeout: ReturnType<typeof setTimeout>
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`${operation} timed out after ${timeoutMs}ms`))
    }, timeoutMs)
  })

  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeout))
}

async function requestWebGpuDevice(gpu: RendererGpu, powerPreference?: RendererPowerPreference) {
  const adapter = await gpu.requestAdapter({
    featureLevel: 'compatibility',
    ...(powerPreference ? { powerPreference } : {}),
  })
  if (!adapter) return null

  const requiredFeatures = adapter.features ? Array.from(adapter.features) : undefined
  return adapter.requestDevice(requiredFeatures?.length ? { requiredFeatures } : undefined)
}

export async function detectRendererCapability({
  canvas = browserCanvas(),
  gpu = browserGpu(),
  powerPreference,
  webgpuTimeoutMs = WEBGPU_INITIALIZATION_TIMEOUT_MS,
}: {
  canvas?: RendererCapabilityCanvas | null
  gpu?: RendererGpu | null
  powerPreference?: RendererPowerPreference
  webgpuTimeoutMs?: number
} = {}): Promise<RendererCapability> {
  let capabilityError: unknown

  if (gpu) {
    const pending = requestWebGpuDevice(gpu, powerPreference)
    try {
      const device = await withTimeout(pending, webgpuTimeoutMs, 'WebGPU adapter/device request')
      if (device) return { backend: 'webgpu', device, status: 'supported' }
    } catch (error) {
      capabilityError = error
      // Losing the race means a device may still arrive after we have given up
      // on it, so reclaim it. Attaching the handler only on this path keeps
      // ownership of a device we did return unambiguous.
      pending.then(releaseDevice).catch(() => {})
    }
  }

  if (canvas) {
    try {
      const context = canvas.getContext('webgl2')
      if (context) {
        releaseProbeContext(context)
        return { backend: 'webgl', status: 'supported' }
      }
    } catch (error) {
      capabilityError ??= error
    }
  }

  return { error: capabilityError, status: 'unsupported' }
}

export async function initializeGpuRenderer<Renderer extends InitializableRenderer>({
  createRenderer,
  gpu,
  powerPreference,
  probeCanvas = browserCanvas(),
  webgpuTimeoutMs = WEBGPU_INITIALIZATION_TIMEOUT_MS,
}: {
  createRenderer: (parameters: RendererBackendParameters) => Renderer
  gpu?: RendererGpu | null
  powerPreference?: RendererPowerPreference
  probeCanvas?: RendererCapabilityCanvas | null
  webgpuTimeoutMs?: number
}): Promise<RendererInitializationResult<Renderer>> {
  const capability = await detectRendererCapability({
    canvas: probeCanvas,
    gpu,
    powerPreference,
    webgpuTimeoutMs,
  })
  if (capability.status === 'unsupported') return capability

  let renderer: Renderer | undefined
  let initPromise: Promise<unknown> | undefined
  try {
    renderer = createRenderer(
      capability.backend === 'webgpu' ? { device: capability.device } : { forceWebGL: true },
    )
    initPromise = renderer.init()
    await (capability.backend === 'webgpu'
      ? withTimeout(initPromise, webgpuTimeoutMs, 'WebGPU renderer initialization')
      : initPromise)
    if (capability.backend === 'webgpu') {
      const dispose = renderer.dispose?.bind(renderer)
      let disposed = false
      renderer.dispose = () => {
        if (disposed) return
        disposed = true
        try {
          dispose?.()
        } finally {
          releaseDevice(capability.device)
        }
      }
    }
    return { backend: capability.backend, renderer, status: 'ready' }
  } catch (error) {
    // three's dispose() calls async setAnimationLoop(), which awaits init() if
    // unfinished. Dispose only a late success; a failed init would reject again.
    const abandonedRenderer = renderer
    initPromise?.then(
      () => {
        try {
          abandonedRenderer?.dispose?.()
        } catch {}
      },
      () => undefined,
    )
    if (capability.backend !== 'webgpu') return { error, status: 'unsupported' }

    releaseDevice(capability.device)
    // This canvas may already own a WebGPU context, and a late init still owns
    // its cleanup. The host must retry with gpu:null on a fresh display canvas.
    return { error, retryBackend: 'webgl', status: 'unsupported' }
  }
}
