import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'

const threeRoot = resolve(dirname(createRequire(import.meta.url).resolve('three/webgpu')), '..')
const variants = [
  'src/renderers/webgl-fallback/WebGLBackend.js',
  'build/three.webgpu.js',
  'build/three.webgpu.nodes.js',
  'build/three.webgpu.min.js',
  'build/three.webgpu.nodes.min.js',
]

type Handle = { name: string }
type Backend = {
  init(renderer: unknown): void
  set(texture: object, data: object): void
  state: { bindFramebuffer(target: number, framebuffer: Handle | null): void }
  utils: { _clientWaitAsync(): Promise<void> }
  textureUtils: {
    copyTextureToBuffer(
      texture: object,
      x: number,
      y: number,
      width: number,
      height: number,
      face: number,
    ): Promise<Uint8Array>
  }
}
type BackendConstructor = new (options: { context: unknown }) => Backend

// Only the GL driver is substituted. All five variants execute Three's actual
// backend initialization, framebuffer state cache, and texture readback method.
async function fixture(variant: string) {
  const module = (await import(pathToFileURL(resolve(threeRoot, variant)).href)) as {
    default?: BackendConstructor
    WebGLBackend?: BackendConstructor
  }
  const Constructor = module.WebGLBackend ?? module.default
  assert.ok(Constructor)
  const buffers: Handle[] = []
  const framebuffers: Handle[] = []
  const deletedBuffers: Handle[] = []
  const deletedFramebuffers: Handle[] = []
  let readFramebuffer: Handle | null = null
  let drawFramebuffer: Handle | null = null
  let packBuffer: Handle | null = null
  const gl = {
    UNSIGNED_BYTE: 5121,
    RGBA: 6408,
    FRAMEBUFFER: 36160,
    READ_FRAMEBUFFER: 36008,
    DRAW_FRAMEBUFFER: 36009,
    READ_FRAMEBUFFER_BINDING: 36010,
    PIXEL_PACK_BUFFER: 35051,
    PIXEL_PACK_BUFFER_BINDING: 35053,
    SCISSOR_BOX: 3088,
    VIEWPORT: 2978,
    MAX_TEXTURE_IMAGE_UNITS: 34930,
    TEXTURE_2D: 3553,
    COLOR_ATTACHMENT0: 36064,
    STREAM_READ: 35041,
    getSupportedExtensions: () => [],
    getExtension: () => null,
    getParameter(parameter: number) {
      if (parameter === gl.READ_FRAMEBUFFER_BINDING) return readFramebuffer
      if (parameter === gl.PIXEL_PACK_BUFFER_BINDING) return packBuffer
      if (parameter === gl.MAX_TEXTURE_IMAGE_UNITS) return 8
      return [0, 0, 512, 288]
    },
    createFramebuffer() {
      const framebuffer = { name: `read-${framebuffers.length}` }
      framebuffers.push(framebuffer)
      return framebuffer
    },
    createBuffer() {
      const buffer = { name: `pack-${buffers.length}` }
      buffers.push(buffer)
      return buffer
    },
    bindFramebuffer(target: number, framebuffer: Handle | null) {
      if (target !== gl.DRAW_FRAMEBUFFER) readFramebuffer = framebuffer
      if (target !== gl.READ_FRAMEBUFFER) drawFramebuffer = framebuffer
    },
    bindBuffer(target: number, buffer: Handle | null) {
      assert.equal(target, gl.PIXEL_PACK_BUFFER)
      packBuffer = buffer
    },
    framebufferTexture2D() {},
    bufferData(_target: number, byteLength: number) {
      assert.equal(byteLength, 512 * 288 * 4)
    },
    readPixels() {
      assert.equal(readFramebuffer, framebuffers.at(-1))
      assert.equal(packBuffer, buffers.at(-1))
    },
    getBufferSubData(_target: number, _offset: number, destination: Uint8Array) {
      assert.ok(packBuffer)
      destination.fill(37)
    },
    deleteFramebuffer(framebuffer: Handle) {
      assert.ok(!deletedFramebuffers.includes(framebuffer), 'release framebuffer only once')
      deletedFramebuffers.push(framebuffer)
    },
    deleteBuffer(buffer: Handle) {
      assert.ok(!deletedBuffers.includes(buffer), 'release buffer only once')
      deletedBuffers.push(buffer)
    },
  }
  const backend = new Constructor({ context: gl })
  backend.init({
    currentSamples: 0,
    depth: true,
    stencil: false,
    domElement: { addEventListener() {} },
    info: {},
  })
  backend.utils._clientWaitAsync = async () => {}
  const texture = { isCubeTexture: false }
  backend.set(texture, { textureGPU: {}, glFormat: gl.RGBA, glType: gl.UNSIGNED_BYTE })
  return {
    backend,
    gl,
    read: () => backend.textureUtils.copyTextureToBuffer(texture, 0, 0, 512, 288, 0),
    bindings: () => ({ readFramebuffer, drawFramebuffer, packBuffer }),
    assertReleased(count: number) {
      assert.equal(buffers.length, count)
      assert.equal(framebuffers.length, count)
      assert.deepEqual(deletedBuffers, buffers)
      assert.deepEqual(deletedFramebuffers, framebuffers)
    },
  }
}

for (const variant of variants) {
  test(`${variant}: repeated successful readbacks release both GL resources`, async () => {
    const f = await fixture(variant)
    for (let index = 0; index < 10; index++) {
      const pixels = await f.read()
      assert.equal(pixels.byteLength, 512 * 288 * 4)
      assert.equal(pixels[0], 37)
      assert.equal(pixels.at(-1), 37)
    }
    f.assertReleased(10)
  })

  test(`${variant}: wait rejection releases both GL resources`, async () => {
    const f = await fixture(variant)
    f.backend.utils._clientWaitAsync = async () => {
      throw new Error('device lost while waiting')
    }
    await assert.rejects(f.read(), /device lost while waiting/)
    f.assertReleased(1)
  })

  test(`${variant}: driver exceptions restore bindings and release both GL resources`, async () => {
    for (const operation of ['readPixels', 'getBufferSubData'] as const) {
      const f = await fixture(variant)
      const previousFrame = { name: 'previous frame' }
      const previousPack = { name: 'previous pack' }
      f.backend.state.bindFramebuffer(f.gl.FRAMEBUFFER, previousFrame)
      f.gl.bindBuffer(f.gl.PIXEL_PACK_BUFFER, previousPack)
      f.gl[operation] = () => {
        throw new Error('driver failure')
      }
      await assert.rejects(f.read(), /driver failure/)
      assert.deepEqual(f.bindings(), {
        readFramebuffer: previousFrame,
        drawFramebuffer: previousFrame,
        packBuffer: previousPack,
      })
      f.assertReleased(1)
    }
  })

  test(`${variant}: pending readback restores bindings and cannot overwrite later rendering`, async () => {
    for (const fails of [false, true]) {
      const f = await fixture(variant)
      const originalFrame = { name: 'original frame' }
      const originalPack = { name: 'original pack' }
      f.backend.state.bindFramebuffer(f.gl.FRAMEBUFFER, originalFrame)
      f.gl.bindBuffer(f.gl.PIXEL_PACK_BUFFER, originalPack)
      let finishWait: () => void = () => assert.fail('wait was not started')
      f.backend.utils._clientWaitAsync = () =>
        new Promise<void>((resolveWait, rejectWait) => {
          finishWait = () => (fails ? rejectWait(new Error('wait failed')) : resolveWait())
        })
      const pending = f.read()
      assert.deepEqual(f.bindings(), {
        readFramebuffer: originalFrame,
        drawFramebuffer: originalFrame,
        packBuffer: originalPack,
      })
      // A main render can start while the GPU fence is pending. Completion of
      // the old read must not rebind its old framebuffer or pixel-pack buffer.
      const nextFrame = { name: 'next render' }
      const nextPack = { name: 'next pack' }
      f.backend.state.bindFramebuffer(f.gl.FRAMEBUFFER, nextFrame)
      f.gl.bindBuffer(f.gl.PIXEL_PACK_BUFFER, nextPack)
      finishWait()
      if (fails) await assert.rejects(pending, /wait failed/)
      else await pending
      assert.deepEqual(f.bindings(), {
        readFramebuffer: nextFrame,
        drawFramebuffer: nextFrame,
        packBuffer: nextPack,
      })
      f.assertReleased(1)
    }
  })
}
