import { afterEach, beforeEach, expect, test } from 'bun:test'
import {
  type AnyNodeId,
  BlockNode,
  clearSceneHistory,
  createBoxBlockTopology,
  getItemBoundsCenter,
  ItemNode,
  subscribeSceneCommits,
  useScene,
} from '@pascal-app/core'
import { Box3, Euler, Quaternion, Vector3 } from 'three'
import { createTheatreSceneGraph } from '../theatre/new-production'
import { commandMeta, connectStageCommandExecutor, executeStageCommands } from './command-executor'
import { rigidRotation } from './rigid-rotation'
import { SCENERY_LIBRARY } from './scenery'

globalThis.requestAnimationFrame ??= () => 0
globalThis.cancelAnimationFrame ??= () => {}
let disconnect: () => void
beforeEach(() => {
  const graph = createTheatreSceneGraph()
  useScene.getState().setReadOnly(false)
  useScene.getState().setScene(graph.nodes, graph.rootNodeIds, graph)
  clearSceneHistory()
  disconnect = connectStageCommandExecutor()
})
afterEach(() => {
  disconnect()
  useScene.getState().unloadScene()
  clearSceneHistory()
})

test('native floor-level fold tilts pass the executor guard, save one edit and undo without lifting', () => {
  const entry = SCENERY_LIBRARY.find((entry) => entry.asset.id === 'SCN-FOLD-02')!
  const [width, height, depth] = entry.asset.dimensions!
  const result = executeStageCommands([
    {
      type: 'AddScenery',
      meta: commandMeta(),
      nodeId: 'floor-fold',
      name: '二帘组合',
      kind: entry.kind,
      libraryAssetId: entry.asset.id,
      dimensionsMeters: { width, height, depth },
      transform: { position: { x: 0, y: 0, z: 3 }, rotationDegrees: { x: 0, y: 0, z: 0 } },
    },
  ])
  expect(result.ok).toBe(true)
  const id = result.nodeIds[0] as AnyNodeId
  const before = useScene.getState().nodes[id]!
  if (before.type !== 'item') throw new Error('expected real fold model')
  const center = (node: typeof before) =>
    new Vector3(...getItemBoundsCenter(node))
      .applyEuler(new Euler(...node.rotation))
      .add(new Vector3(...node.position))
  for (const angle of [15, 30]) {
    clearSceneHistory()
    let commits = 0
    const cleanup = subscribeSceneCommits((commit) => {
      if (commit.origin === 'local') commits++
    })
    useScene.getState().updateNode(id, rigidRotation(before, 'x', angle))
    const after = useScene.getState().nodes[id]!
    if (after.type !== 'item') throw new Error('expected real fold model')
    expect(after.rotation).not.toEqual(before.rotation)
    expect(center(after).distanceTo(center(before))).toBeCloseTo(0, 9)
    expect(after.asset).toEqual(before.asset)
    expect(after.scale).toEqual([1, 1, 1])
    expect(ItemNode.parse(JSON.parse(JSON.stringify(after)))).toEqual(after)
    expect(commits).toBe(1)
    expect(useScene.temporal.getState().pastStates).toHaveLength(1)
    useScene.temporal.getState().undo()
    expect(useScene.getState().nodes[id]).toEqual(before)
    cleanup()
  }
})

test('library models rotate without scaling or detaching, and undo restores their pose', () => {
  const entry = SCENERY_LIBRARY[0]!
  const result = executeStageCommands([
    {
      type: 'AddScenery',
      meta: commandMeta(),
      nodeId: 'rigid-model',
      name: '模型',
      kind: entry.kind,
      libraryAssetId: entry.asset.id,
      dimensionsMeters: { width: 0.5, height: 0.8, depth: 0.5 },
      transform: { position: { x: 0, y: 0, z: 3 }, rotationDegrees: { x: 0, y: 0, z: 0 } },
    },
  ])
  expect(result.ok).toBe(true)
  const id = result.nodeIds[0] as AnyNodeId
  const before = useScene.getState().nodes[id]!
  if (before.type !== 'item') throw new Error('expected library model')
  for (const axis of ['x', 'y', 'z'] as const) {
    clearSceneHistory()
    useScene.getState().updateNode(id, rigidRotation(before, axis, 90))
    const after = useScene.getState().nodes[id]!
    if (after.type !== 'item') throw new Error('expected model')
    expect(after.rotation).not.toEqual(before.rotation)
    expect(after.asset).toEqual(before.asset)
    expect(after.scale).toEqual(before.scale)
    expect(after.parentId).toBe(before.parentId)
    expect(useScene.temporal.getState().pastStates).toHaveLength(1)
    useScene.temporal.getState().undo()
    expect(useScene.getState().nodes[id]).toEqual(before)
  }
})

for (const kind of ['door-flat', 'window-flat', 'platform', 'chair', 'table'] as const) {
  test(`${kind} rotates as one rigid prop around its centre and undoes in one step`, () => {
    const result = executeStageCommands([
      {
        type: 'AddScenery',
        meta: commandMeta(),
        nodeId: 'rigid-test',
        name: kind,
        kind,
        libraryAssetId: null,
        dimensionsMeters: { width: 1, height: 1, depth: 0.5 },
        transform: { position: { x: 0, y: 0, z: 3 }, rotationDegrees: { x: 0, y: 0, z: 0 } },
      },
    ])
    expect(result.ok).toBe(true)
    const id = result.nodeIds[0] as AnyNodeId
    const before = useScene.getState().nodes[id]!
    if (before.type !== 'block') throw new Error('expected proxy block')
    for (const axis of ['x', 'y', 'z'] as const) {
      clearSceneHistory()
      useScene.getState().updateNode(id, rigidRotation(before, axis, 90))
      const after = useScene.getState().nodes[id]!
      if (after.type !== 'block') throw new Error('expected block')
      expect(after).not.toBe(before)
      expect(after.topology.faces).toEqual(before.topology.faces)
      const a = before.topology.vertices,
        b = after.topology.vertices
      for (let i = 0; i < a.length; i++)
        for (let j = i + 1; j < a.length; j++) {
          const distance = (p: typeof a) =>
            new Vector3(...p[i]!.position).distanceTo(new Vector3(...p[j]!.position))
          expect(distance(b)).toBeCloseTo(distance(a), 9)
        }
      const worldCenter = (node: typeof before) =>
        new Box3()
          .setFromPoints(
            node.topology.vertices.map((vertex) =>
              new Vector3(...vertex.position)
                .applyAxisAngle(new Vector3(0, 1, 0), node.rotation)
                .add(new Vector3(...node.position)),
            ),
          )
          .getCenter(new Vector3())
      expect(worldCenter(after).distanceTo(worldCenter(before))).toBeCloseTo(0, 9)
      expect(useScene.temporal.getState().pastStates).toHaveLength(1)
      useScene.temporal.getState().undo()
      expect(useScene.getState().nodes[id]).toEqual(before)
    }
  })
}

for (const axis of ['x', 'z'] as const) {
  test(`1m block ${axis} tilt keeps its centre at 0.5m and allows its bottom corner below the floor`, () => {
    const before = BlockNode.parse({
      topology: createBoxBlockTopology(1, 1, 1),
      position: [2, 0, 3],
      rotation: 0,
    })
    const patch = rigidRotation(before, axis, 30)
    const after = BlockNode.parse({ ...before, ...patch })
    const bounds = new Box3().setFromPoints(
      after.topology.vertices.map((vertex) =>
        new Vector3(...vertex.position).add(new Vector3(...after.position)),
      ),
    )
    expect(after.position).toEqual(before.position)
    expect(bounds.getCenter(new Vector3()).distanceTo(new Vector3(2, 0.5, 3))).toBeCloseTo(0, 9)
    expect(bounds.min.y).toBeCloseTo(0.5 - (Math.sqrt(3) + 1) / 4, 9)
    expect(bounds.min.y).toBeLessThan(0)
  })

  test(`1m library item ${axis} tilt preserves the model centre without automatic floor correction`, () => {
    const asset = {
      ...SCENERY_LIBRARY[0]!.asset,
      dimensions: [1, 1, 1] as [number, number, number],
      boundsCenter: [0, 0.5, 0] as [number, number, number],
    }
    const before = ItemNode.parse({
      asset,
      position: [2, 0, 3],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    })
    const after = ItemNode.parse({ ...before, ...rigidRotation(before, axis, 30) })
    const orientation = new Quaternion().setFromEuler(new Euler(...after.rotation))
    const center = new Vector3(0, 0.5, 0)
      .applyQuaternion(orientation)
      .add(new Vector3(...after.position))
    expect(center.distanceTo(new Vector3(2, 0.5, 3))).toBeCloseTo(0, 9)
    const corners = [-0.5, 0.5].flatMap((x) =>
      [0, 1].flatMap((y) =>
        [-0.5, 0.5].map((z) =>
          new Vector3(x, y, z).applyQuaternion(orientation).add(new Vector3(...after.position)),
        ),
      ),
    )
    expect(Math.min(...corners.map((point) => point.y))).toBeCloseTo(
      0.5 - (Math.sqrt(3) + 1) / 4,
      9,
    )
    expect(after.asset).toEqual(before.asset)
    expect(after.scale).toEqual(before.scale)
  })
}
