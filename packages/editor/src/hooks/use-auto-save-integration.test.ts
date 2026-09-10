import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import type { SceneGraph } from '../lib/scene'

if (!process.env.AUTOSAVE_RACE_FIXTURE) {
  test('an edit during a save remains dirty and is flushed if the page exits before the next debounce', () => {
    const child = spawnSync(process.execPath, ['run', fileURLToPath(import.meta.url)], {
      env: { ...process.env, AUTOSAVE_RACE_FIXTURE: '1' },
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
  let graph = {
    nodes: { site: { metadata: { roles: 2, takes: 0 } } },
    rootNodeIds: ['site'],
    collections: {},
    materials: {},
    installedPlugins: [],
  }
  let listener: (state: typeof graph) => void = () => {}
  mock.module('@pascal-app/core', () => ({
    useScene: {
      getState: () => graph,
      temporal: {
        getState: () => ({ pastStates: [], futureStates: [] }),
        subscribe: () => () => {},
      },
      subscribe: (next: (state: typeof graph) => void) => {
        listener = next
        return () => {}
      },
    },
  }))
  mock.module('../lib/scene', () => ({ saveSceneToLocalStorage: () => {} }))
  const timers = new Map<number, () => void>()
  let timerId = 0
  const windowEvents = new EventTarget()
  Object.assign(globalThis, {
    window: windowEvents,
    setTimeout: (callback: () => void) => {
      const id = ++timerId
      timers.set(id, callback)
      return id
    },
    clearTimeout: (id: number) => timers.delete(id),
  })
  const requests: { graph: SceneGraph; keepalive: boolean }[] = []
  let resolveSave: () => void = () => {}
  const { useAutoSave } = await import('./use-auto-save')
  function Fixture() {
    return useAutoSave({
      onSave: (data, options) => {
        requests.push({ graph: structuredClone(data), keepalive: options?.keepalive ?? false })
        return new Promise<void>((resolve) => {
          resolveSave = resolve
        })
      },
    })
  }
  const { isLoadingSceneRef } = Fixture()
  const cleanups = effects.map((effect) => effect())
  isLoadingSceneRef.current = false
  graph = { ...graph, nodes: { site: { metadata: { roles: 2, takes: 1 } } } }
  listener(graph)
  const firstTimer = timers.values().next().value
  assert.ok(firstTimer)
  firstTimer()
  assert.equal(requests.length, 1)
  graph = { ...graph, nodes: { site: { metadata: { roles: 3, takes: 1 } } } }
  listener(graph)
  resolveSave()
  await Promise.resolve()
  await Promise.resolve()
  windowEvents.dispatchEvent(new Event('pagehide'))
  assert.equal(
    requests.length,
    2,
    'the newer edit must survive exit before the next scheduled save',
  )
  assert.equal(requests[1]?.keepalive, true)
  assert.deepEqual(requests[1]?.graph.nodes, graph.nodes)
  resolveSave()
  for (const cleanup of cleanups) cleanup?.()
}
