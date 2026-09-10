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
  const { authorizeSceneNodeDrop, useAutoSave } = await import('./use-auto-save')
  function Fixture() {
    return useAutoSave({
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
    const entry = timers.entries().next().value
    assert.ok(entry, 'a dirty edit schedules autosave')
    timers.delete(entry[0])
    entry[1]()
    await Promise.resolve()
    await Promise.resolve()
  }
  function lastCount() {
    return Object.keys(requests.at(-1)!.graph.nodes).length
  }
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
  windowEvents.dispatchEvent(new Event('pagehide'))
  assert.equal(lastCount(), 4, 'undo followed immediately by exit must persist')
  assert.equal(requests.at(-1)?.keepalive, true)

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
