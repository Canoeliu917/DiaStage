import { afterEach, beforeEach, expect, test } from 'bun:test'
import { clearSceneHistory, useScene } from '@pascal-app/core'
import { createTheatreSceneGraph } from '../theatre/new-production'
import { commandMeta, connectStageCommandExecutor, executeStageCommands } from './command-executor'
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

test('editable scenery surface uses an existing body slot and undoes as one operation', () => {
  const result = executeStageCommands([
    {
      type: 'AddScenery',
      meta: commandMeta(),
      nodeId: 'block',
      kind: 'neutral-block',
      name: '台块',
      libraryAssetId: null,
      dimensionsMeters: { width: 1, height: 1, depth: 1 },
      transform: { position: { x: 0, y: 0, z: 3 }, rotationDegrees: { x: 0, y: 0, z: 0 } },
    },
  ])
  expect(result.ok).toBe(true)
  const nodeId = result.nodeIds[0]!,
    before = useScene.getState().nodes[nodeId]
  clearSceneHistory()
  expect(
    executeStageCommands([
      { type: 'SetScenicFinish', nodeId, finish: 'white', meta: commandMeta() },
    ]).ok,
  ).toBe(true)
  const painted = useScene.getState().nodes[nodeId]
  expect(painted?.type === 'block' && painted.slots.body).toBe('library:preset-white')
  expect(useScene.temporal.getState().pastStates).toHaveLength(1)
  useScene.temporal.getState().undo()
  expect(useScene.getState().nodes[nodeId]).toEqual(before)
})

test('real model cannot report success for a material slot it does not own', () => {
  const model = SCENERY_LIBRARY.find((entry) => entry.asset.dimensions)
  if (!model?.asset.dimensions) throw new Error('测试需要一个带有效尺寸的真实素材')
  const dimensions = model.asset.dimensions
  const result = executeStageCommands([
    {
      type: 'AddScenery',
      meta: commandMeta(),
      nodeId: 'model',
      kind: model.kind,
      name: '舞台模型',
      libraryAssetId: model.asset.id,
      dimensionsMeters: { width: dimensions[0], height: dimensions[1], depth: dimensions[2] },
      transform: { position: { x: 0, y: 0, z: 3 }, rotationDegrees: { x: 0, y: 0, z: 0 } },
    },
  ])
  expect(result.ok).toBe(true)
  const before = useScene.getState().nodes
  const response = executeStageCommands([
    { type: 'SetScenicFinish', nodeId: result.nodeIds[0], finish: 'dark', meta: commandMeta() },
  ])
  expect(response.ok).toBe(false)
  expect(response.error).toContain('真实模型保留原有表面')
  expect(useScene.getState().nodes).toBe(before)
})
