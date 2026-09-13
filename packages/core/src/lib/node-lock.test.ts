import { afterEach, expect, test } from 'bun:test'
import { WallNode } from '../schema'
import useLiveNodeOverrides from '../store/use-live-node-overrides'
import useLiveTransforms from '../store/use-live-transforms'
import useScene from '../store/use-scene'
import { getNodeLock } from './node-lock'

afterEach(() => {
  useScene.getState().unloadScene()
  useLiveTransforms.getState().clearAll()
  useLiveNodeOverrides.getState().clearAll()
})

test('locks cover the whole object and affected ancestors, without locking siblings', () => {
  const parent = WallNode.parse({ start: [0, 0], end: [1, 0] })
  const child = WallNode.parse({
    parentId: parent.id,
    start: [0, 0],
    end: [1, 0],
    metadata: { stageLocked: true },
  })
  const grandchild = WallNode.parse({ parentId: child.id, start: [0, 0], end: [1, 0] })
  const sibling = WallNode.parse({ parentId: parent.id, start: [0, 0], end: [1, 0] })
  const nodes = Object.fromEntries(
    [parent, child, grandchild, sibling].map((node) => [node.id, node]),
  )
  expect(getNodeLock(nodes, child.id)).toBe(child)
  expect(getNodeLock(nodes, grandchild.id)).toBe(child)
  expect(getNodeLock(nodes, parent.id)).toBeUndefined()
  expect(getNodeLock(nodes, parent.id, true)).toBe(child)
  expect(getNodeLock(nodes, sibling.id, true)).toBeUndefined()
  const unlocked = { ...nodes, [child.id]: { ...child, metadata: { stageLocked: false } } }
  expect(getNodeLock(unlocked, grandchild.id, true)).toBeUndefined()
  expect(getNodeLock(nodes, grandchild.id, true)).toBe(child)
})

test('locked objects cannot publish transient transform or geometry, and unlock restores both', () => {
  const parent = WallNode.parse({ start: [0, 0], end: [1, 0], metadata: { stageLocked: true } })
  const child = WallNode.parse({ parentId: parent.id, start: [0, 0], end: [1, 0] })
  const sibling = WallNode.parse({ start: [0, 0], end: [1, 0] })
  const nodes = Object.fromEntries([parent, child, sibling].map((node) => [node.id, node]))
  useScene.setState({ nodes })
  const transforms = useLiveTransforms.getState().transforms
  const overrides = useLiveNodeOverrides.getState().overrides
  const pose = { position: [1, 0, 0] as [number, number, number], rotation: 1 }
  useLiveTransforms.getState().set(child.id, pose)
  useLiveNodeOverrides.getState().set(child.id, { height: 10 })
  useLiveNodeOverrides.getState().setMany([
    [child.id, { height: 10 }],
    [sibling.id, { height: 10 }],
  ])
  expect(useLiveTransforms.getState().transforms).toBe(transforms)
  expect(useLiveNodeOverrides.getState().overrides).toBe(overrides)
  useScene.setState({
    nodes: { ...nodes, [parent.id]: { ...parent, metadata: { stageLocked: false } } },
  })
  useLiveTransforms.getState().set(child.id, pose)
  useLiveNodeOverrides.getState().set(child.id, { height: 10 })
  expect(useLiveTransforms.getState().get(child.id)).toEqual(pose)
  expect(useLiveNodeOverrides.getState().get(child.id)).toEqual({ height: 10 })
})
