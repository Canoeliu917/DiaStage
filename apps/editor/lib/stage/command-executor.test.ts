import { afterEach, beforeEach, expect, test } from 'bun:test'
import { clearSceneHistory, useScene } from '@pascal-app/core'
import {
  compileStagePlan,
  parseStageText,
  type StageCommand,
  type StagePlan,
} from '@pascal-app/core/stage'
import { createTheatreSceneGraph } from '../theatre/new-production'
import { readStageDocument } from '../theatre/simulation-store'
import { commandMeta, connectStageCommandExecutor, executeStageCommands } from './command-executor'
import { cameraProject, currentStageContext } from './context'

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
function add(meta = commandMeta()): StageCommand {
  return {
    type: 'AddScenery',
    meta,
    nodeId: 'proposal-chair',
    name: '椅子',
    kind: 'chair',
    libraryAssetId: null,
    dimensionsMeters: { width: 0.5, height: 0.9, depth: 0.5 },
    transform: { position: { x: 0, y: 0, z: 3 }, rotationDegrees: { x: 0, y: 0, z: 0 } },
  }
}
test('manual placement and movement share the scene and one-step undo', () => {
  const before = JSON.stringify(useScene.getState().nodes)
  const added = executeStageCommands([add()])
  expect(added.error).toBeUndefined()
  expect(added.ok).toBe(true)
  expect(
    currentStageContext().objects.find((n) => n.id === added.nodeIds[0])?.transform.position,
  ).toEqual({ x: 0, y: 0, z: 3 })
  expect(useScene.temporal.getState().pastStates).toHaveLength(1)
  useScene.temporal.getState().undo()
  expect(JSON.stringify(useScene.getState().nodes)).toBe(before)
})
test('bad later command and out-of-bounds input never partially apply', () => {
  const before = useScene.getState().nodes,
    meta = commandMeta()
  expect(
    executeStageCommands([
      add(meta),
      {
        type: 'MoveObject',
        meta: { ...meta, commandId: 'second' },
        nodeId: 'missing',
        position: { x: 1, y: 0, z: 3 },
      },
    ]).ok,
  ).toBe(false)
  expect(useScene.getState().nodes).toBe(before)
  expect(
    executeStageCommands([
      {
        ...add(),
        transform: { position: { x: 99, y: 0, z: 3 }, rotationDegrees: { x: 0, y: 0, z: 0 } },
      },
    ]).ok,
  ).toBe(false)
  expect(useScene.getState().nodes).toBe(before)
})
test('replayed transactions are idempotent and stale previews cannot overwrite manual edits', () => {
  const command = add(),
    first = executeStageCommands([command]),
    after = useScene.getState().nodes
  expect(first.ok).toBe(true)
  expect(executeStageCommands([command]).alreadyApplied).toBe(true)
  expect(useScene.getState().nodes).toBe(after)
  expect(
    executeStageCommands([{ ...command, meta: { ...command.meta, transactionId: 'stale' } }]).ok,
  ).toBe(false)
})
test('native numeric transforms on new scenery use the same validation gate', () => {
  const result = executeStageCommands([add()]),
    id = result.nodeIds[0]!
  const before = useScene.getState().nodes[id]!
  useScene.getState().updateNode(id, { position: [100, 0, 0] })
  expect(useScene.getState().nodes[id]).toBe(before)
  useScene.getState().updateNode(id, { position: [-1, 0, 0] })
  expect(currentStageContext().objects.find((n) => n.id === id)?.transform.position.x).toBe(1)
})
test('venue proposal changes the existing document without replacing legacy metadata', () => {
  const meta = commandMeta()
  expect(
    executeStageCommands([
      {
        type: 'CreateStage',
        meta,
        venue: { type: 'proscenium', widthMeters: 10, depthMeters: 8, heightMeters: null },
      },
    ]).ok,
  ).toBe(true)
  expect(readStageDocument()?.venue.width).toBe(10)
  expect(readStageDocument()?.venue.height).toBe(4)
})
test('hidden scenery can be revealed and locked objects reject native edits', () => {
  const result = executeStageCommands([add()]),
    nodeId = result.nodeIds[0]!
  const run = (command: object) =>
    executeStageCommands([{ ...command, nodeId, meta: commandMeta() }])
  expect(run({ type: 'SetObjectVisibility', visible: false }).ok).toBe(true)
  expect(run({ type: 'SetObjectVisibility', visible: true }).ok).toBe(true)
  expect(run({ type: 'SetObjectLock', locked: true }).ok).toBe(true)
  const before = useScene.getState().nodes[nodeId]
  useScene.getState().updateNode(nodeId, { position: [-1, 0, 0] })
  useScene.getState().deleteNode(nodeId)
  expect(useScene.getState().nodes[nodeId]).toBe(before)
  expect(run({ type: 'SetObjectLock', locked: false }).ok).toBe(true)
  expect(run({ type: 'RenameObject', name: '排练椅' }).ok).toBe(true)
})

test('camera plans preserve their observation direction and tilt across apply and context reload', () => {
  const context = currentStageContext()
  const plan: StagePlan = {
    schemaVersion: 1,
    source: 'typed-command',
    venue: null,
    items: [
      {
        proposalId: 'new-camera',
        existingNodeId: null,
        kind: 'camera',
        displayName: '观察镜头',
        libraryAssetId: null,
        dimensionsMeters: { width: 0.35, height: 0.25, depth: 0.5 },
        transform: { position: { x: 0, y: 1.5, z: 2 }, rotationDegrees: { x: 15, y: 30, z: 0 } },
        certainty: 'stated',
        assumptionIds: [],
        evidenceIds: [],
      },
    ],
    relations: [],
    assumptions: [],
    questions: [],
    evidence: [],
    warnings: [],
  }
  const compiled = compileStagePlan(plan, context, {
    transactionId: crypto.randomUUID(),
    issuedAt: new Date().toISOString(),
  })
  expect(compiled.ok).toBe(true)
  const applied = executeStageCommands(compiled.commands)
  expect(applied.error).toBeUndefined()
  const camera = currentStageContext().objects.find((object) => object.id === applied.nodeIds[0])
  expect(camera?.transform.rotationDegrees.x).toBeCloseTo(15, 7)
  expect(camera?.transform.rotationDegrees.y).toBeCloseTo(30, 7)
  const second = compileStagePlan(
    {
      ...plan,
      items: [{ ...plan.items[0]!, existingNodeId: camera!.id, transform: camera!.transform }],
    },
    currentStageContext(),
    { transactionId: crypto.randomUUID(), issuedAt: new Date().toISOString() },
  )
  expect(second.ok).toBe(true)
  const before = structuredClone(camera?.transform)
  expect(executeStageCommands(second.commands).ok).toBe(true)
  expect(
    currentStageContext().objects.find((object) => object.id === camera!.id)?.transform,
  ).toEqual(before)
})

test('direct camera and performer commands cannot bypass spatial bounds or partly commit', () => {
  const before = useScene.getState().nodes
  for (const type of ['AddCamera', 'AddPerformerMarker'] as const) {
    const meta = commandMeta()
    const command =
      type === 'AddCamera'
        ? {
            type,
            meta,
            nodeId: 'invalid-camera',
            name: '越界镜头',
            transform: { position: { x: 99, y: 1, z: 3 }, rotationDegrees: { x: 0, y: 0, z: 0 } },
            target: { x: 0, y: 1, z: 3 },
            fieldOfViewDegrees: 50,
          }
        : {
            type,
            meta,
            nodeId: 'invalid-performer',
            name: '越界人物',
            position: { x: 99, y: 0, z: 3 },
            facingDegrees: 0,
            color: '#777777',
          }
    const result = executeStageCommands([command])
    expect(result.ok).toBe(false)
    expect(result.error).toContain('超出台面')
    expect(useScene.getState().nodes).toBe(before)
  }
})

test('a camera movement command preserves lens and look-at distance and remains undoable', () => {
  expect(
    executeStageCommands([
      {
        type: 'AddCamera',
        meta: commandMeta(),
        nodeId: 'move-camera',
        name: '观察镜头',
        transform: { position: { x: 0, y: 1.5, z: 2 }, rotationDegrees: { x: 0, y: 0, z: 0 } },
        target: { x: 0, y: 1.5, z: 0 },
        fieldOfViewDegrees: 75,
      },
    ]).ok,
  ).toBe(true)
  const before = cameraProject()
  const context = currentStageContext(['move-camera'])
  const input = parseStageText('把它向台后移半米', context)
  const compiled = compileStagePlan(input, context, commandMeta('typed-command'))
  expect(compiled.commands.map((command) => command.type)).toEqual(['MoveObject'])
  clearSceneHistory()
  expect(executeStageCommands(compiled.commands).ok).toBe(true)
  const old = before.shots.find((shot) => shot.id === 'move-camera')!.keyframes[0]!
  const moved = cameraProject().shots.find((shot) => shot.id === 'move-camera')!.keyframes[0]!
  expect(moved.fov).toBe(75)
  expect(moved.position).toEqual([old.position[0], old.position[1], old.position[2] - 0.5])
  expect(moved.lookAt).toEqual([old.lookAt[0], old.lookAt[1], old.lookAt[2] - 0.5])
  expect(useScene.temporal.getState().pastStates).toHaveLength(1)
  useScene.temporal.getState().undo()
  expect(cameraProject()).toEqual(before)
})

test('rotating an existing camera preserves its lens, position and focus distance', () => {
  expect(
    executeStageCommands([
      {
        type: 'AddCamera',
        meta: commandMeta(),
        nodeId: 'rotate-camera',
        name: '观察镜头',
        transform: { position: { x: 0, y: 1.5, z: 2 }, rotationDegrees: { x: 0, y: 0, z: 0 } },
        target: { x: 0, y: 1.5, z: 0 },
        fieldOfViewDegrees: 75,
      },
    ]).ok,
  ).toBe(true)
  const context = currentStageContext(['rotate-camera'])
  const plan = parseStageText('把它旋转30度', context)
  const compiled = compileStagePlan(plan, context, commandMeta('typed-command'))
  expect(compiled.commands.map((command) => command.type)).toEqual(['RotateObject'])
  const before = cameraProject().shots.find((shot) => shot.id === 'rotate-camera')!.keyframes[0]!
  expect(executeStageCommands(compiled.commands).ok).toBe(true)
  const after = cameraProject().shots.find((shot) => shot.id === 'rotate-camera')!.keyframes[0]!
  expect(after.fov).toBe(75)
  expect(after.position).toEqual(before.position)
  expect(
    Math.hypot(...after.lookAt.map((value, axis) => value - after.position[axis]!)),
  ).toBeCloseTo(2, 8)
  expect(
    currentStageContext().objects.find((object) => object.id === 'rotate-camera')?.transform
      .rotationDegrees.y,
  ).toBeCloseTo(30, 8)
})

test('changing stage depth checks old world positions against the new proscenium origin', () => {
  const added = executeStageCommands([
    {
      ...add(),
      transform: { position: { x: 0, y: 0, z: 4.5 }, rotationDegrees: { x: 0, y: 0, z: 0 } },
    },
  ])
  expect(added.ok).toBe(true)
  const node = useScene.getState().nodes[added.nodeIds[0]!]
  const result = executeStageCommands([
    {
      type: 'CreateStage',
      meta: commandMeta(),
      venue: { type: 'proscenium', widthMeters: 8, depthMeters: 4, heightMeters: 4 },
    },
  ])
  expect(result.error).toBeUndefined()
  expect(useScene.getState().nodes[added.nodeIds[0]!]).toBe(node)
  expect(
    currentStageContext().objects.find((object) => object.id === added.nodeIds[0])?.transform
      .position.z,
  ).toBeCloseTo(3.5, 8)
})
