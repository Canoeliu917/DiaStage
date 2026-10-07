import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import type { ThumbnailGenerateEvent } from '@pascal-app/core'
import type { SnapshotCameraData } from '@pascal-app/editor'

if (!process.env.AUDIENCE_COVER_TEST) {
  test('audience covers preserve the viewport and reject stale captures without blocking saves', () => {
    const child = spawnSync(process.execPath, ['run', fileURLToPath(import.meta.url)], {
      env: { ...process.env, AUDIENCE_COVER_TEST: '1' },
      encoding: 'utf8',
      timeout: 20_000,
    })
    assert.equal(child.status, 0, child.error?.message ?? `${child.stdout}\n${child.stderr}`)
  })
} else {
  const { mock } = await import('bun:test')
  const React = await import('react')
  const { SiteNode } = await import('@pascal-app/core/schema')
  const { sceneGraphSignature } = await import('../lib/scene-signature')
  const site = SiteNode.parse({ id: 'site_cover', metadata: {} })
  let graph = { nodes: { [site.id]: site }, rootNodeIds: [site.id] }
  const originalGraph = structuredClone(graph)
  const viewer = { projectId: 'default', cameraPosition: [9, 4, 3], cameraTarget: [1, 0, 1] }
  const originalViewer = structuredClone(viewer)
  const captures: ThumbnailGenerateEvent[] = []
  const listeners = new Map<string, Set<(event: any) => void>>()
  const emitter = {
    on(name: string, listener: (event: any) => void) {
      const set = listeners.get(name) ?? new Set()
      set.add(listener)
      listeners.set(name, set)
    },
    off(name: string, listener: (event: any) => void) {
      listeners.get(name)?.delete(listener)
    },
    emit(name: string, event: any) {
      if (name === 'camera-controls:generate-thumbnail') captures.push(event)
      for (const listener of [...(listeners.get(name) ?? [])]) listener(event)
    },
  }
  mock.module('@pascal-app/core', () => ({
    emitter,
    useScene: { getState: () => graph },
    useLiveTransforms: { getState: () => ({ transforms: new Map() }) },
  }))
  mock.module('@pascal-app/viewer', () => ({ useViewer: { getState: () => viewer } }))
  mock.module('@pascal-app/editor', () => ({
    useEditor: { getState: () => ({ isPreviewMode: false, isCaptureMode: false }) },
  }))
  mock.module('../lib/theatre/simulation-store', () => ({
    readStageDocument: () => ({
      venue: {
        id: 'venue',
        name: '舞台',
        type: 'black-box',
        width: 8,
        depth: 6,
        height: 4,
        origin: [0, 0, 0],
      },
    }),
  }))
  let hookIndex = 0
  const hooks: any[] = []
  let effects: (() => void)[] = []
  mock.module('react', () => ({
    ...React,
    useCallback: (callback: unknown) => callback,
    useRef: (initial: unknown) => {
      const index = hookIndex++
      hooks[index] ??= { current: initial }
      return hooks[index]
    },
    useState: (initial: unknown) => {
      const index = hookIndex++
      if (!(index in hooks)) hooks[index] = initial
      return [
        hooks[index],
        (value: unknown) => {
          hooks[index] = value
        },
      ]
    },
    useEffect: (effect: () => (() => void) | undefined, deps: unknown[]) => {
      const index = hookIndex++
      const previous = hooks[index]
      if (!previous || deps.some((value, i) => value !== previous.deps[i]))
        effects.push(() => {
          previous?.cleanup?.()
          hooks[index] = { deps, cleanup: effect() }
        })
    },
  }))
  let timerId = 0
  const timers = new Map<number, { callback: () => void; delay: number }>()
  Object.assign(globalThis, {
    setTimeout(callback: () => void, delay: number) {
      timers.set(++timerId, { callback, delay })
      return timerId
    },
    clearTimeout(id: number) {
      timers.delete(id)
    },
    localStorage: { getItem: () => null },
  })
  const flush = async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve()
  }
  const fire = async (delay: number) => {
    for (const [id, timer] of [...timers]) {
      if (timer.delay !== delay) continue
      timers.delete(id)
      timer.callback()
    }
    await flush()
  }
  let holdEncoding = false
  const readers: { onload?: () => void }[] = []
  Object.assign(globalThis, {
    FileReader: class {
      result = 'data:image/webp;base64,Y292ZXI='
      onload?: () => void
      readAsDataURL() {
        readers.push(this)
        if (!holdEncoding) this.onload?.()
      }
    },
  })
  const posts: { url: string; body: any }[] = []
  let offline = false
  let postStatus = 200
  globalThis.fetch = async (url, init) => {
    if (offline) throw new Error('offline')
    posts.push({ url: String(url), body: JSON.parse(String(init?.body)) })
    return Response.json({ version: posts.at(-1)!.body.expectedVersion }, { status: postStatus })
  }
  const { useAudienceCover } = await import('./use-audience-cover')
  let ready = false
  function render() {
    hookIndex = 0
    effects = []
    // biome-ignore lint/correctness/useHookAtTopLevel: this harness executes the hook lifecycle explicitly.
    const result = useAudienceCover({
      sceneId: 'cover-test',
      ready,
    })
    for (const effect of effects) effect()
    return result
  }
  const respond = (requestId = captures.at(-1)?.requestId) =>
    render().onThumbnailCapture(new Blob(['cover'], { type: 'image/webp' }), {
      requestId,
      position: [0, 0, 0],
      target: null,
    } as SnapshotCameraData)
  const schedule = (version: number) => {
    render().scheduleCover({ version, signature: sceneGraphSignature(graph) })
    render()
  }

  schedule(7)
  await fire(300)
  assert.equal(captures.length, 0, 'backfill waits for scene readiness')
  ready = true
  render()
  await fire(300)
  assert.equal(captures.length, 1)
  assert.equal(captures[0]?.projectId, 'default')
  assert.equal(captures[0]?.captureMode, 'standard')
  assert.equal(captures[0]?.snapLevels, undefined)
  assert.deepEqual(captures[0]?.standardSize, { w: 1920, h: 1080 })
  assert.ok(captures[0]?.cameraPose && captures[0].cameraPose.position[2] > 3)
  respond('other-snapshot')
  await flush()
  assert.equal(posts.length, 0)
  respond()
  await flush()
  assert.equal(posts.length, 1)
  assert.deepEqual(posts[0], {
    url: '/api/scenes/cover-test/thumbnail',
    body: { expectedVersion: 7, thumbnailUrl: 'data:image/webp;base64,Y292ZXI=' },
  })
  assert.deepEqual(viewer, originalViewer, 'capture never moves the viewing camera')
  assert.deepEqual(graph, originalGraph, 'cover generation does not save or change stage nodes')

  schedule(8)
  graph = structuredClone(graph)
  graph.nodes[site.id]!.name = 'newer scene'
  await fire(300)
  assert.equal(captures.length, 1, 'stale graph before capture is ignored')
  schedule(9)
  await fire(300)
  holdEncoding = true
  respond()
  await flush()
  graph = structuredClone(graph)
  graph.nodes[site.id]!.name = 'changed during encoding'
  readers.at(-1)?.onload?.()
  await flush()
  assert.equal(posts.length, 1, 'stale graph after rendering is not uploaded')
  holdEncoding = false

  schedule(10)
  await fire(300)
  const beforeRetry = captures.length
  emitter.emit('snapshot:capture-failed', {
    requestId: captures.at(-1)!.requestId,
    error: '快照渲染器尚未就绪，请重试。',
  })
  await flush()
  await fire(800)
  assert.equal(captures.length, beforeRetry + 1)
  emitter.emit('snapshot:capture-failed', {
    requestId: captures.at(-1)!.requestId,
    error: '快照渲染器尚未就绪，请重试。',
  })
  await flush()
  await fire(800)
  assert.equal(captures.length, beforeRetry + 1, 'renderer readiness retries are bounded')

  schedule(11)
  await fire(300)
  await fire(10_000)
  assert.equal(
    listeners.get('snapshot:capture-failed')?.size,
    0,
    'capture timeout removes listeners',
  )
  offline = true
  schedule(12)
  await fire(300)
  respond()
  await flush()
  offline = false
  schedule(13)
  await fire(300)
  respond()
  await flush()
  assert.equal(posts.at(-1)?.body.expectedVersion, 13, 'a cover failure cannot block the next save')

  postStatus = 503
  schedule(14)
  await fire(300)
  respond()
  await flush()
  const beforePostRetry = posts.length
  await fire(800)
  assert.equal(posts.length, beforePostRetry + 1, 'transient upload failures retry once')
  await fire(800)
  assert.equal(posts.length, beforePostRetry + 1, 'upload retries are bounded')
  postStatus = 409
  schedule(15)
  await fire(300)
  respond()
  await flush()
  const afterConflict = posts.length
  await fire(800)
  assert.equal(posts.length, afterConflict, 'version conflicts discard the obsolete cover')
  postStatus = 200
  schedule(16)
  await fire(300)
  for (const hook of hooks) hook?.cleanup?.()
  respond('late-capture')
  await flush()
  assert.equal(posts.length, afterConflict)
  assert.equal(listeners.get('snapshot:capture-failed')?.size, 0)
}
