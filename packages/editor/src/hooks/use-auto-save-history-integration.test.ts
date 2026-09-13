import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import type { SceneGraph } from '../lib/scene'

if (!process.env.AUTOSAVE_HISTORY_FIXTURE) {
  test('history and explicit deletion save a bare stage while accidental wipes remain blocked', () => {
    const child = spawnSync(process.execPath, ['run', fileURLToPath(import.meta.url)], {
      env: { ...process.env, AUTOSAVE_HISTORY_FIXTURE: '1' },
      encoding: 'utf8',
      timeout: 20_000,
    })
    assert.equal(child.status, 0, child.error?.message ?? `${child.stdout}\n${child.stderr}`)
  })
} else {
  const { mock } = await import('bun:test')
  const React = await import('react')
  const effects: (() => undefined | (() => void))[] = []
  mock.module('react', () => ({
    ...React,
    useRef: <T>(current: T) => ({ current }),
    useCallback: <T>(callback: T) => callback,
    useEffect: (effect: () => undefined | (() => void)) => effects.push(effect),
  }))
  mock.module('../lib/scene', () => ({ saveSceneToLocalStorage: () => {} }))
  mock.module('@pascal-app/viewer', () => ({
    useViewer: { getState: () => ({ inputDragging: false }) },
  }))
  mock.module('../store/use-interaction-scope', () => ({
    default: { getState: () => ({ scope: { kind: 'idle' } }) },
  }))
  const { SiteNode, BuildingNode, LevelNode, SlabNode, clearSceneHistory, useScene } = await import(
    '@pascal-app/core'
  )
  const site = SiteNode.parse({ id: 'site_autosave', children: ['building_autosave'] })
  const building = BuildingNode.parse({
    id: 'building_autosave',
    parentId: site.id,
    children: ['level_autosave'],
  })
  const level = LevelNode.parse({
    id: 'level_autosave',
    parentId: building.id,
    children: ['slab_autosave'],
    level: 0,
  })
  const slab = SlabNode.parse({
    id: 'slab_autosave',
    parentId: level.id,
    polygon: [
      [-4, -3],
      [4, -3],
      [4, 3],
      [-4, 3],
    ],
  })
  const scaffold = {
    nodes: { [site.id]: site, [building.id]: building, [level.id]: level, [slab.id]: slab },
    rootNodeIds: [site.id],
  }
  const timers = new Map<number, () => void>()
  let timerId = 0
  const windowEvents = new EventTarget()
  Object.assign(globalThis, {
    window: windowEvents,
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    setTimeout: (callback: () => void) => {
      const id = ++timerId
      timers.set(id, callback)
      return id
    },
    clearTimeout: (id: number) => timers.delete(id),
  })
  const requests: { graph: SceneGraph; keepalive: boolean }[] = []
  const local: SceneGraph[] = []
  const { authorizeSceneNodeDrop, useAutoSave } = await import('./use-auto-save')
  const { pauseSceneHistory, resumeSceneHistory, useLiveNodeOverrides } = await import(
    '@pascal-app/core'
  )
  function Fixture() {
    return useAutoSave({
      onLocalSave: async (graph) => {
        local.push(graph)
      },
      onSave: async (graph, options) => {
        requests.push({ graph: structuredClone(graph), keepalive: options?.keepalive ?? false })
      },
    })
  }
  const { isLoadingSceneRef } = Fixture()
  const cleanups = effects.map((effect) => effect())
  function loadScaffold() {
    isLoadingSceneRef.current = true
    useScene.getState().setScene(scaffold.nodes, scaffold.rootNodeIds)
    clearSceneHistory()
    isLoadingSceneRef.current = false
  }
  function addObjects() {
    useScene.getState().applyNodeChanges({
      create: [1, 2, 3].map((index) => ({
        node: LevelNode.parse({
          id: `level_added${index}`,
          parentId: building.id,
          level: index,
          children: [],
        }),
      })),
    })
  }
  async function debounce() {
    for (let i = 0; i < 10; i++) await Promise.resolve()
    const entry = timers.entries().next().value
    if (!entry) return
    timers.delete(entry[0])
    entry[1]()
    for (let i = 0; i < 10; i++) await Promise.resolve()
  }
  function lastCount() {
    return Object.keys(requests.at(-1)!.graph.nodes).length
  }
  loadScaffold()
  addObjects()
  await debounce()
  const beforeDragLocal = local.length,
    beforeDragNetwork = requests.length
  pauseSceneHistory(useScene)
  for (let i = 1; i <= 100; i++)
    useLiveNodeOverrides.getState().set('level_added1', { name: `drag-${i}` })
  await debounce()
  assert.equal(local.length, beforeDragLocal, 'pointer moves do not persist intermediate states')
  assert.equal(requests.length, beforeDragNetwork, 'pointer moves send no network save')
  // Transform tools keep pointer moves in live overrides, then commit after resume.
  resumeSceneHistory(useScene)
  useScene.getState().updateNode('level_added1', { name: 'drag-100' })
  useLiveNodeOverrides.getState().clear('level_added1')
  await debounce()
  assert.equal(local.length, beforeDragLocal + 1, 'release creates exactly one durable commit')
  assert.equal(requests.length, beforeDragNetwork + 1)
  loadScaffold()
  addObjects()
  await debounce()
  assert.equal(lastCount(), 7)
  useScene.temporal.getState().undo()
  assert.equal(Object.keys(useScene.getState().nodes).length, 4)
  const restoredScaffold = useScene.getState().nodes
  await debounce()
  assert.equal(lastCount(), 4, 'one undo to the initial scaffold must persist')
  useScene.temporal.getState().redo()
  await debounce()
  assert.equal(lastCount(), 7)
  useScene.temporal.getState().undo()
  for (let i = 0; i < 10; i++) await Promise.resolve()
  const beforeExit = requests.length
  windowEvents.dispatchEvent(new Event('pagehide'))
  assert.equal(Object.keys(local.at(-1)!.nodes).length, 4, 'undo is locally persisted before exit')
  assert.equal(requests.length, beforeExit, 'exit does not send a full-scene PUT')
  await debounce()
  assert.equal(requests.at(-1)?.keepalive, false)

  useScene.temporal.getState().redo()
  await debounce()
  const beforeStaleAuthorization = requests.length
  useScene.setState({ nodes: restoredScaffold })
  await debounce()
  assert.equal(
    requests.length,
    beforeStaleAuthorization,
    'a past authorized snapshot cannot later bypass the guard without an actual history jump',
  )

  loadScaffold()
  addObjects()
  await debounce()
  const beforeAccidental = requests.length
  useScene.setState({ nodes: { ...scaffold.nodes }, rootNodeIds: scaffold.rootNodeIds })
  await debounce()
  windowEvents.dispatchEvent(new Event('pagehide'))
  assert.equal(requests.length, beforeAccidental, 'a new accidental scaffold is not authorized')
  useScene.getState().unloadScene()
  await debounce()
  windowEvents.dispatchEvent(new Event('pagehide'))
  assert.equal(requests.length, beforeAccidental, 'an unloaded zero-node store is not authorized')

  loadScaffold()
  addObjects()
  await debounce()
  useScene.getState().deleteNodes(['level_added1', 'level_added2', 'level_added3'])
  authorizeSceneNodeDrop(useScene.getState())
  await debounce()
  assert.equal(lastCount(), 4, 'an explicit host deletion of the last objects must persist')
  useScene.temporal.getState().undo()
  await debounce()
  assert.equal(lastCount(), 7)
  useScene.temporal.getState().redo()
  await debounce()
  assert.equal(lastCount(), 4, 'redo of an intentional deletion must persist')

  loadScaffold()
  addObjects()
  await debounce()
  useScene.temporal.getState().undo()
  const beforeLoading = requests.length
  isLoadingSceneRef.current = true
  windowEvents.dispatchEvent(new Event('pagehide'))
  assert.equal(
    requests.length,
    beforeLoading,
    'loading takes precedence over history authorization',
  )
  for (const cleanup of cleanups) cleanup?.()
}
