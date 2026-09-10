import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { ShelfNode } from '../schema/nodes/shelf'
import { WallNode } from '../schema/nodes/wall'
import {
  installSceneMutationHandler,
  type NodeChanges,
  SceneMutationError,
  type SceneMutationHandler,
} from './scene-mutation'
import useScene, { clearSceneHistory } from './use-scene'

globalThis.requestAnimationFrame ??= (callback) => {
  callback(0)
  return 0
}
globalThis.cancelAnimationFrame ??= () => {}

const cleanups: (() => void)[] = []
function install(handler: SceneMutationHandler) {
  const dispose = installSceneMutationHandler(handler)
  cleanups.push(dispose)
  return dispose
}
function snapshot() {
  const { nodes, rootNodeIds, collections, materials, installedPlugins } = useScene.getState()
  return { nodes, rootNodeIds, collections, materials, installedPlugins }
}

beforeEach(() => {
  useScene.getState().setReadOnly(false)
  useScene.getState().unloadScene()
  clearSceneHistory()
})
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  clearSceneHistory()
})

describe('scene mutation host boundary', () => {
  test('default create, move, undo, redo and delete keep the existing history', () => {
    const before = snapshot()
    const node = ShelfNode.parse({})
    expect(useScene.getState().createNode(node)).toBeUndefined()
    const created = snapshot()
    useScene.getState().updateNode(node.id, { position: [1, 0, 2] })
    expect(useScene.temporal.getState().pastStates).toHaveLength(2)
    useScene.temporal.getState().undo()
    expect(snapshot()).toEqual(created)
    useScene.temporal.getState().undo()
    expect(snapshot()).toEqual(before)
    useScene.temporal.getState().redo()
    expect(snapshot()).toEqual(created)
    useScene.getState().deleteNode(node.id)
    expect(snapshot()).toEqual(before)
  })

  test('all seven public node mutation methods pass through the same handler once', () => {
    const seen: NodeChanges[] = []
    install((changes, commit) => {
      seen.push(changes)
      commit()
    })
    const first = ShelfNode.parse({})
    const second = ShelfNode.parse({})
    const third = ShelfNode.parse({})
    useScene.getState().createNode(first)
    useScene.getState().createNodes([{ node: second }])
    useScene.getState().updateNode(first.id, { name: 'First' })
    useScene.getState().updateNodes([{ id: second.id, data: { name: 'Second' } }])
    useScene.getState().applyNodeChanges({ create: [{ node: third }] })
    useScene.getState().deleteNode(first.id)
    useScene.getState().deleteNodes([second.id, third.id])
    expect(seen.map((changes) => Object.keys(changes))).toEqual([
      ['create'],
      ['create'],
      ['update'],
      ['update'],
      ['create'],
      ['delete'],
      ['delete'],
    ])
    expect(useScene.temporal.getState().pastStates).toHaveLength(7)
  })

  test('false, missing commit, or validation failure leave the scene and history unchanged', () => {
    const before = snapshot()
    install((_changes, commit) => {
      commit()
      return false
    })
    useScene.getState().createNode(ShelfNode.parse({}))
    install(() => {})
    useScene.getState().createNode(ShelfNode.parse({}))
    install((_changes, commit) => {
      commit()
      throw new Error('invalid input')
    })
    expect(() => useScene.getState().createNode(ShelfNode.parse({}))).toThrow('invalid input')
    expect(snapshot()).toEqual(before)
    expect(useScene.temporal.getState().pastStates).toHaveLength(0)
  })

  test('replacement changes commit together and undo restores the exact baseline', () => {
    const existing = ShelfNode.parse({})
    useScene.getState().createNode(existing)
    clearSceneHistory()
    const before = snapshot()
    const added = ShelfNode.parse({})
    install((_changes, commit) =>
      commit({
        create: [{ node: added }],
        update: [{ id: existing.id, data: { name: 'Updated' } }],
      }),
    )
    useScene.getState().updateNode(existing.id, { name: 'Requested' })
    expect(useScene.getState().nodes[existing.id]?.name).toBe('Updated')
    expect(useScene.getState().nodes[added.id]).toBeDefined()
    expect(useScene.temporal.getState().pastStates).toHaveLength(1)
    useScene.temporal.getState().undo()
    expect(snapshot()).toEqual(before)
  })

  test('approval without replacement preserves deleteNodes reconciliation', () => {
    const left = WallNode.parse({ start: [0, 0], end: [2, 0] })
    const right = WallNode.parse({ start: [2, 0], end: [4, 0] })
    const branch = WallNode.parse({ start: [2, 0], end: [2, 2] })
    useScene.getState().createNodes([{ node: left }, { node: right }, { node: branch }])
    clearSceneHistory()
    const before = snapshot()
    install((_changes, commit) => commit())
    useScene.getState().deleteNode(branch.id)
    expect(Object.values(useScene.getState().nodes)).toHaveLength(1)
    expect(useScene.temporal.getState().pastStates).toHaveLength(1)
    useScene.temporal.getState().undo()
    expect(snapshot()).toEqual(before)
  })

  test('a stale cleanup cannot uninstall a newer handler', () => {
    const first = install((_changes, commit) => commit())
    const second = install(() => false)
    first()
    useScene.getState().createNode(ShelfNode.parse({}))
    expect(Object.keys(useScene.getState().nodes)).toHaveLength(0)
    second()
    second()
    useScene.getState().createNode(ShelfNode.parse({}))
    expect(Object.keys(useScene.getState().nodes)).toHaveLength(1)
  })

  test('reentrant validation cannot write or recurse and a later valid call still works', () => {
    install(() => useScene.getState().createNode(ShelfNode.parse({})))
    expect(() => useScene.getState().createNode(ShelfNode.parse({}))).toThrow(SceneMutationError)
    expect(Object.keys(useScene.getState().nodes)).toHaveLength(0)
    install((_changes, commit) => commit())
    useScene.getState().createNode(ShelfNode.parse({}))
    expect(Object.keys(useScene.getState().nodes)).toHaveLength(1)
  })

  test('duplicate or expired commit callbacks cannot write', () => {
    let lateCommit: (() => void) | undefined
    install((_changes, commit) => {
      lateCommit = commit
      commit()
      commit()
    })
    expect(() => useScene.getState().createNode(ShelfNode.parse({}))).toThrow(SceneMutationError)
    expect(() => lateCommit?.()).toThrow(SceneMutationError)
    expect(Object.keys(useScene.getState().nodes)).toHaveLength(0)
    expect(useScene.temporal.getState().pastStates).toHaveLength(0)
  })

  test('a host approval cannot bypass the existing read-only lock', () => {
    install((_changes, commit) => commit())
    useScene.getState().setReadOnly(true)
    useScene.getState().createNode(ShelfNode.parse({}))
    expect(Object.keys(useScene.getState().nodes)).toHaveLength(0)
    expect(useScene.temporal.getState().pastStates).toHaveLength(0)
  })
})
