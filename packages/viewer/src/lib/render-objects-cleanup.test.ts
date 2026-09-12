import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  BoxGeometry,
  DataTexture,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  RenderTarget,
  Scene,
} from 'three'

test('renderer releases object bindings before destroying the backend sampler cache', async () => {
  const modulePath = 'three/src/renderers/common/Renderer.js'
  const { default: Renderer } = (await import(modulePath)) as {
    default: { prototype: { dispose: { call(value: object): void } } }
  }
  let backendAlive = true,
    released = false
  const empty = { dispose() {} }
  Renderer.prototype.dispose.call({
    _initialized: true,
    _objects: {
      dispose() {
        assert.ok(backendAlive)
        released = true
      },
    },
    backend: {
      dispose() {
        assert.ok(released)
        backendAlive = false
      },
      timestampQueryPool: {},
    },
    info: empty,
    _animation: empty,
    _geometries: empty,
    _pipelines: empty,
    _nodes: empty,
    _bindings: empty,
    _renderLists: empty,
    _renderContexts: empty,
    _textures: empty,
    _frameBufferTargets: new Map(),
    setRenderTarget() {},
    setAnimationLoop() {},
  })
  assert.ok(released)
})

test('renderer teardown removes shared material listeners without disposing another viewer assets', async () => {
  const modulePath = 'three/src/renderers/common/RenderObjects.js'
  const { default: RenderObjects } = (await import(modulePath)) as {
    default: new (
      ...args: unknown[]
    ) => {
      get(...args: unknown[]): {
        onMaterialDispose(): void
        onGeometryDispose(): void
        dispose(): void
      }
      dispose(): void
      renderObjects: Set<unknown>
    }
  }
  const material = new MeshBasicMaterial(),
    geometry = new BoxGeometry()
  let assetDisposals = 0,
    releases = 0
  material.addEventListener('dispose', () => assetDisposals++)
  geometry.addEventListener('dispose', () => assetDisposals++)
  const create = () =>
    new RenderObjects(
      { contextNode: { id: 0, version: 0 }, _currentSourceMaterial: null },
      { getCacheKey: () => 0, delete: () => releases++ },
      {},
      { delete() {} },
      { deleteForRender() {} },
      {},
    )
  const first = create(),
    second = create()
  const mesh = new Mesh(geometry, material),
    scene = new Scene(),
    camera = new PerspectiveCamera()
  const args = [mesh, material, scene, camera, {}, {}, null]
  const other = second.get(...args)
  for (let i = 0; i < 25; i++) {
    const manager = i === 0 ? first : create()
    const object = manager.get(...args)
    assert.equal(material.hasEventListener('dispose', object.onMaterialDispose), true)
    manager.dispose()
    manager.dispose()
    assert.equal(manager.renderObjects.size, 0)
    assert.equal(material.hasEventListener('dispose', object.onMaterialDispose), false)
    assert.equal(geometry.hasEventListener('dispose', object.onGeometryDispose), false)
    assert.equal(material.hasEventListener('dispose', other.onMaterialDispose), true)
  }
  assert.equal(releases, 25)
  assert.equal(assetDisposals, 0)
  other.dispose()
  assert.equal(second.renderObjects.size, 0)
  second.dispose()
  assert.equal(releases, 26)
  material.dispose()
  geometry.dispose()
})

test('texture teardown detaches only its own shared asset listeners and retains explicit disposal', async () => {
  const modulePath = 'three/src/renderers/common/Textures.js'
  const { default: Textures } = (await import(modulePath)) as {
    default: new (
      ...args: unknown[]
    ) => {
      updateTexture(texture: object): void
      updateRenderTarget(target: object): void
      get(target: object): { onDispose(): void }
      has(target: object): boolean
      dispose(): void
      _disposeListeners: Map<object, () => void>
    }
  }
  const texture = new DataTexture(new Uint8Array(4), 1, 1)
  const target = new RenderTarget(1, 1, { depthBuffer: false })
  let assetDisposals = 0,
    backendDisposals = 0
  for (const asset of [texture, target, target.texture]) {
    asset.addEventListener('dispose', () => assetDisposals++)
  }
  const create = () => {
    const manager = new Textures(
      {},
      {
        createDefaultTexture() {},
        createTexture() {},
        destroyTexture() {
          backendDisposals++
        },
        delete() {},
      },
      { memory: { renderTargets: 0 }, createTexture() {}, destroyTexture() {} },
    )
    manager.updateTexture(texture)
    manager.updateRenderTarget(target)
    return manager
  }
  const other = create()
  const otherListener = other.get(texture).onDispose
  for (let index = 0; index < 25; index++) {
    const manager = create()
    const listeners = [texture, target, target.texture].map((asset) => manager.get(asset).onDispose)
    manager.updateTexture(texture)
    assert.equal(manager._disposeListeners.size, 3)
    manager.dispose()
    manager.dispose()
    assert.equal(manager._disposeListeners.size, 0)
    for (const [index, asset] of [texture, target, target.texture].entries()) {
      assert.equal(asset.hasEventListener('dispose', listeners[index]!), false)
      assert.equal(manager.has(asset), false)
    }
    assert.equal(texture.hasEventListener('dispose', otherListener), true)
  }
  assert.equal(assetDisposals, 0)
  assert.equal(backendDisposals, 0)
  texture.dispose()
  assert.equal(other._disposeListeners.has(texture), false)
  assert.equal(other.has(texture), false)
  target.dispose()
  assert.equal(other._disposeListeners.size, 0)
  assert.equal(other.has(target.texture), false)
  assert.equal(assetDisposals, 2)
  assert.equal(backendDisposals, 2)
  other.dispose()
})
