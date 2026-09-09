import { type Camera, Color, type Scene } from 'three'
import type { RenderTarget, WebGPURenderer } from 'three/webgpu'
import { unpackMonitorPixels } from './camera-stage-math'

export type MonitorRenderer = Pick<
  WebGPURenderer,
  | 'getRenderTarget'
  | 'getActiveCubeFace'
  | 'getActiveMipmapLevel'
  | 'setRenderTarget'
  | 'getMRT'
  | 'setMRT'
  | 'getClearColor'
  | 'getClearAlpha'
  | 'setClearColor'
  | 'autoClear'
  | 'render'
  | 'readRenderTargetPixelsAsync'
  | 'backend'
>

export async function renderMonitorPixels(
  renderer: MonitorRenderer,
  scene: Scene,
  camera: Camera,
  target: RenderTarget,
  background: string,
): Promise<Uint8ClampedArray<ArrayBuffer>> {
  const oldTarget = renderer.getRenderTarget()
  const face = renderer.getActiveCubeFace()
  const mip = renderer.getActiveMipmapLevel()
  const mrt = renderer.getMRT()
  const clearColor = new Color()
  renderer.getClearColor(clearColor as Parameters<WebGPURenderer['getClearColor']>[0])
  const alpha = renderer.getClearAlpha()
  const autoClear = renderer.autoClear
  try {
    renderer.setMRT(null)
    renderer.setClearColor(new Color(background), 1)
    renderer.autoClear = true
    renderer.setRenderTarget(target)
    renderer.render(scene, camera)
  } finally {
    // Restore synchronously; the main render never waits for GPU readback.
    renderer.setRenderTarget(oldTarget, face, mip)
    renderer.setMRT(mrt)
    renderer.setClearColor(clearColor, alpha)
    renderer.autoClear = autoClear
  }
  const pixels = await renderer.readRenderTargetPixelsAsync(
    target,
    0,
    0,
    target.width,
    target.height,
  )
  if (!(pixels instanceof Uint8Array)) throw new Error('监看像素格式不可用')
  const backend = renderer.backend as {
    device?: unknown
    isWebGPUBackend?: boolean
    constructor?: { name: string }
  }
  const webgpu = Boolean(
    backend.device || backend.isWebGPUBackend || backend.constructor?.name === 'WebGPUBackend',
  )
  return unpackMonitorPixels(pixels, target.width, target.height, webgpu)
}
