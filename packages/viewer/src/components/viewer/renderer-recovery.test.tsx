import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

if (!process.env.VIEWER_RECOVERY_TEST) {
  test('Viewer releases lost renderers, retries once and isolates subsequent generations', () => {
    const child = spawnSync(process.execPath, ['run', fileURLToPath(import.meta.url)], {
      env: { ...process.env, VIEWER_RECOVERY_TEST: '1' },
      encoding: 'utf8',
      timeout: 20_000,
    })
    assert.equal(child.status, 0, child.error?.message ?? `${child.stdout}\n${child.stderr}`)
  })
} else {
  const { mock } = await import('bun:test')
  const React = await import('react')
  type Dependencies = readonly unknown[] | undefined
  type EffectSlot = { kind: 'effect'; dependencies: Dependencies; cleanup?: () => void }
  type MemoSlot = { dependencies: Dependencies; value: unknown }
  type Element = { type?: unknown; key?: string | null; props?: Record<string, unknown> }
  let slots: unknown[] = []
  let cursor = 0
  let dirty = true
  let tree: unknown
  const pendingEffects: (() => void)[] = []
  let renderViewer: () => unknown

  function sameDependencies(left: Dependencies, right: Dependencies) {
    return (
      !!left &&
      !!right &&
      left.length === right.length &&
      left.every((item, index) => Object.is(item, right[index]))
    )
  }

  function effect(callback: () => undefined | (() => void), dependencies?: Dependencies) {
    const index = cursor++
    const previous = slots[index] as EffectSlot | undefined
    if (previous && sameDependencies(previous.dependencies, dependencies)) return
    pendingEffects.push(() => {
      previous?.cleanup?.()
      const cleanup = callback()
      slots[index] = { kind: 'effect', dependencies, cleanup: cleanup || undefined }
    })
  }

  function flush() {
    let renders = 0
    while (dirty) {
      assert.ok(renders++ < 20, 'Viewer must settle without a render loop')
      dirty = false
      cursor = 0
      tree = renderViewer()
      for (const commit of pendingEffects.splice(0)) commit()
    }
    return tree
  }

  function unmount() {
    for (const slot of slots) {
      const current = slot as EffectSlot | undefined
      if (current?.kind === 'effect') current.cleanup?.()
    }
    slots = []
    pendingEffects.length = 0
    tree = null
    dirty = false
  }

  mock.module('react', () => ({
    ...React,
    useContext: () => false,
    forwardRef: (render: (props: Record<string, unknown>, ref: unknown) => unknown) => render,
    useState: <T,>(initial: T | (() => T)) => {
      const index = cursor++
      if (!(index in slots))
        slots[index] = typeof initial === 'function' ? (initial as () => T)() : initial
      return [
        slots[index] as T,
        (next: T | ((previous: T) => T)) => {
          const value =
            typeof next === 'function' ? (next as (previous: T) => T)(slots[index] as T) : next
          if (!Object.is(slots[index], value)) {
            slots[index] = value
            dirty = true
          }
        },
      ]
    },
    useRef: <T,>(initial: T) => {
      const index = cursor++
      if (!(index in slots)) slots[index] = { current: initial }
      return slots[index] as { current: T }
    },
    useMemo: <T,>(factory: () => T, dependencies?: Dependencies): T => {
      const index = cursor++
      const previous = slots[index] as MemoSlot | undefined
      if (!previous || !sameDependencies(previous.dependencies, dependencies))
        slots[index] = { dependencies, value: factory() }
      return (slots[index] as MemoSlot).value as T
    },
    useEffect: effect,
    useLayoutEffect: effect,
    useImperativeHandle: () => {},
  }))
  mock.module('react-dom', () => ({
    flushSync: (callback: () => void) => {
      callback()
      flush()
    },
  }))

  const Canvas = () => null
  mock.module('@react-three/fiber', () => ({
    Canvas,
    extend: () => {},
    useFrame: () => {},
    useThree: () => ({}),
  }))
  mock.module('@pascal-app/core', () => ({
    nodeRegistry: { size: 1, get: () => undefined },
    sceneRegistry: { nodes: new Map() },
    useScene: { getState: () => ({ nodes: {}, rootNodeIds: [], dirtyNodes: new Set() }) },
  }))
  const viewerState = {
    sceneTheme: 'studio',
    transparentBackground: false,
    shadows: true,
    shading: 'rendered',
    shadingByContext: {},
    setRenderContext: () => {},
    setShading: () => {},
    setTransparentBackground: () => {},
  }
  mock.module('../../store/use-viewer', () => ({
    default: Object.assign(
      (select: (state: typeof viewerState) => unknown) => select(viewerState),
      { getState: () => viewerState },
    ),
  }))
  mock.module('../../lib/scene-themes', () => ({
    getSceneTheme: () => ({ appearance: 'dark', toneMappingExposure: 1 }),
  }))
  mock.module('../../lib/ktx2-loader', () => ({ ensureKtx2Support: () => {} }))
  mock.module('../../lib/gpu-perf', () => ({ PERF_OVERLAY_ENABLED: false }))
  mock.module('../../lib/texture-node-guard', () => ({ installTextureNodeNullGuard: () => {} }))
  mock.module('../../lib/drawable-geometry', () => ({ hasDrawableGeometry: () => true }))
  for (const [path, names] of [
    ['../../systems/floor-elevation/floor-elevation-system', ['FloorElevationSystem']],
    ['../../systems/geometry/geometry-system', ['GeometrySystem']],
    ['../../systems/perf-action-settle/perf-action-settle-system', ['PerfActionSettleSystem']],
    ['../error-boundary', ['ErrorBoundary']],
    ['../renderers/scene-renderer', ['SceneRenderer']],
    ['./frame-limiter', ['default']],
    ['./lights', ['Lights']],
    ['./perf-monitor', ['PerfMonitor']],
    ['./perf-panel', ['PerfPanel']],
    ['./pointer-raycast-layers', ['PointerRaycastLayers']],
    ['./registered-systems', ['RegisteredSystems']],
    ['./scene-bvh', ['SceneBvh']],
    ['./selection-manager', ['SelectionManager']],
    ['./viewer-camera', ['ViewerCamera']],
    ['./unsupported-gpu-fallback', ['UnsupportedGpuViewerFallback']],
  ] as const)
    mock.module(path, () => Object.fromEntries(names.map((name) => [name, () => null])))
  mock.module('./post-processing', () => ({ default: () => null, DEFAULT_HOVER_STYLES: {} }))
  mock.module('./batched-mesh-spike', () => ({
    BATCH_SPIKE_ENABLED: false,
    BatchedMeshSpike: () => null,
  }))

  class Renderer {
    disposed = 0
    toneMapping = 0
    toneMappingExposure = 0
    onDeviceLost: (info: { reason: string }) => void = () => {}
    constructor(readonly options: Record<string, unknown>) {}
    setRenderObjectFunction() {}
    dispose() {
      this.disposed++
      this.onDeviceLost({ reason: 'destroyed' })
    }
  }
  mock.module('three/webgpu', () => ({
    WebGPURenderer: Renderer,
    ACESFilmicToneMapping: 1,
    PCFShadowMap: 1,
  }))
  let retryWithWebGl = false
  const initializationCalls: { gpu?: unknown }[] = []
  mock.module('../../lib/renderer-capability', () => ({
    initializeGpuRenderer: async (options: {
      gpu?: unknown
      createRenderer: (parameters: { forceWebGL?: boolean }) => Renderer
    }) => {
      initializationCalls.push(options)
      if (retryWithWebGl) {
        retryWithWebGl = false
        return { status: 'unsupported', retryBackend: 'webgl' }
      }
      return {
        status: 'ready',
        backend: options.gpu === null ? 'webgl' : 'webgpu',
        renderer: options.createRenderer(options.gpu === null ? { forceWebGL: true } : {}),
      }
    },
  }))
  const { default: Viewer } = await import('./index')
  renderViewer = () =>
    (Viewer as unknown as (props: Record<string, unknown>, ref: null) => unknown)({}, null)

  let time = 0
  let timerId = 0
  const timers = new Map<number, { at: number; callback: () => void }>()
  Object.defineProperty(globalThis, 'setTimeout', {
    value: (callback: () => void, delay: number) => {
      const id = ++timerId
      timers.set(id, { at: time + delay, callback })
      return id
    },
  })
  Object.defineProperty(globalThis, 'clearTimeout', {
    value: (id: number) => {
      timers.delete(id)
    },
  })
  function advance(milliseconds: number) {
    time += milliseconds
    for (const [id, timer] of timers) {
      if (timer.at <= time) {
        timers.delete(id)
        timer.callback()
        flush()
      }
    }
  }
  function elements(node: unknown): Element[] {
    if (!node || typeof node !== 'object') return []
    if (Array.isArray(node)) return node.flatMap(elements)
    const element = node as Element
    return [element, ...elements(element.props?.children)]
  }
  function text(node: unknown): string {
    if (typeof node === 'string') return node
    if (Array.isArray(node)) return node.map(text).join('')
    return node && typeof node === 'object' ? text((node as Element).props?.children) : ''
  }
  function canvas() {
    return elements(tree).find((element) => element.type === Canvas)
  }
  function factory(element: Element) {
    return element.props?.gl as (props: { canvas: HTMLCanvasElement }) => Promise<Renderer>
  }
  async function settle() {
    await Promise.resolve()
    await Promise.resolve()
    flush()
  }

  flush()
  const firstCanvas = canvas()!
  assert.ok(firstCanvas)
  assert.equal(firstCanvas.key, '0')
  const first = await factory(firstCanvas)({ canvas: {} as HTMLCanvasElement })
  const obsoleteLoss = first.onDeviceLost
  first.onDeviceLost({ reason: 'unknown' })
  assert.equal(canvas(), undefined, 'device loss synchronously removes the old Canvas')
  assert.match(text(tree), /三维显示已暂停/)
  await settle()
  assert.equal(first.disposed, 1, 'the actual lifecycle releases the old renderer')
  advance(749)
  assert.equal(canvas(), undefined, 'recovery waits for the R3F teardown window')
  advance(1)
  const recoveredCanvas = canvas()!
  assert.ok(recoveredCanvas)
  assert.equal(recoveredCanvas.key, '1')
  const second = await factory(recoveredCanvas)({ canvas: {} as HTMLCanvasElement })
  obsoleteLoss({ reason: 'unknown' })
  flush()
  assert.equal(
    canvas()?.key,
    '1',
    'a saved callback from the old owner cannot invalidate the new generation',
  )
  second.onDeviceLost({ reason: 'unknown' })
  assert.equal(canvas(), undefined)
  await settle()
  advance(750)
  assert.equal(canvas(), undefined, 'a second loss cannot start an automatic retry loop')
  const manualRetry = elements(tree).find(
    (element) => element.type === 'button' && text(element) === '恢复三维显示',
  )
  assert.ok(manualRetry, 'a second loss exposes the manual recovery action')
  advance(60_000)
  assert.equal(canvas(), undefined)
  assert.equal(timers.size, 0)
  ;(manualRetry.props?.onClick as () => void)()
  flush()
  assert.equal(canvas()?.key, '2', 'manual recovery owns a fresh Canvas generation')
  unmount()
  await settle()
  obsoleteLoss({ reason: 'unknown' })
  assert.equal(dirty, false, 'an unmounted owner cannot enqueue recovery state')

  dirty = true
  retryWithWebGl = true
  flush()
  const webGpuCanvas = canvas()!
  const requestedCanvas = {} as HTMLCanvasElement
  void factory(webGpuCanvas)({ canvas: requestedCanvas })
  await settle()
  assert.equal(canvas(), undefined, 'backend fallback first removes the original Canvas')
  advance(750)
  const webGlCanvas = canvas()!
  assert.ok(webGlCanvas)
  assert.equal(webGlCanvas.key, '1')
  const replacement = await factory(webGlCanvas)({ canvas: {} as HTMLCanvasElement })
  assert.equal(initializationCalls.at(-1)?.gpu, null, 'WebGL retry bypasses a second WebGPU probe')
  assert.equal(replacement.options.forceWebGL, true)
  unmount()
  await settle()
  assert.equal(replacement.disposed, 1)
}
