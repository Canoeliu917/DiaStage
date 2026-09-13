import { afterEach, beforeEach, expect, test } from 'bun:test'
import { type AnyNodeId, clearSceneHistory, useScene } from '@pascal-app/core'
import { compileStagePlan, parseStageText, type StageCommand } from '@pascal-app/core/stage'
import { useViewer } from '@pascal-app/viewer'
import { createTheatreSceneGraph } from '../theatre/new-production'
import {
  deleteRecentlyAdded,
  localControl,
  localSceneryOperation,
  rememberAiTransaction,
  undoLastAiTransaction,
} from './ai-controls'
import { commandMeta, connectStageCommandExecutor, executeStageCommands } from './command-executor'
import { currentStageContext } from './context'
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

function legacyAddition(
  kind: 'window-flat' | 'door-flat' | 'chair',
  name: string,
): Extract<StageCommand, { type: 'AddScenery' }> {
  return {
    type: 'AddScenery',
    meta: commandMeta(),
    nodeId: crypto.randomUUID(),
    name,
    kind,
    libraryAssetId: null,
    dimensionsMeters:
      kind === 'chair'
        ? { width: 0.5, height: 0.85, depth: 0.5 }
        : { width: 1, height: 2.1, depth: 0.15 },
    transform: { position: { x: 0, y: 0, z: 3 }, rotationDegrees: { x: 0, y: 0, z: 0 } },
  }
}

function apply(input: string | StageCommand) {
  const context = currentStageContext()
  const compiled =
    typeof input === 'string'
      ? compileStagePlan(parseStageText(input, context), context, commandMeta())
      : { ok: true, commands: [input] }
  expect(compiled.ok).toBe(true)
  const result = executeStageCommands(compiled.commands)
  expect(result.ok).toBe(true)
  rememberAiTransaction(
    result,
    context.objects.map((object) => object.id),
    '测试操作',
  )
  return result
}

test('local controls do not interpret quoted or compound requests as authorization', () => {
  expect(localControl(' 请停止！ ')).toBe('stop')
  expect(localControl('取消')).toBe('cancel')
  expect(localControl('撤销上一步。')).toBe('undo')
  expect(localControl('开启连续制景')).toBeNull()
  expect(localControl('停止并删除所有对象')).toBeNull()
})

test('AI transaction is one undo step; deletion preview writes nothing and requires execution', () => {
  const before = useScene.getState().nodes
  apply(legacyAddition('window-flat', '窗景片'))
  const after = useScene.getState().nodes
  const deletion = deleteRecentlyAdded('删除刚才添加的窗景片。')
  expect(deletion).toHaveLength(1)
  expect(useScene.getState().nodes).toBe(after)
  expect(deleteRecentlyAdded('添加窗景片')).toBeNull()
  undoLastAiTransaction()
  expect(useScene.getState().nodes).toEqual(before)
})

test('AI undo refuses to undo later unrelated edits or a different project', () => {
  apply(legacyAddition('window-flat', '窗景片'))
  const graph = createTheatreSceneGraph()
  useScene.getState().setScene(graph.nodes, graph.rootNodeIds, graph)
  const before = useScene.getState().nodes
  expect(() => undoLastAiTransaction()).toThrow()
  expect(useScene.getState().nodes).toBe(before)
})
test('grouping uses existing scene collections and is one reversible transaction', () => {
  const first = apply(legacyAddition('window-flat', '窗景片'))
  apply('把窗景片向台右移两米')
  const second = apply(legacyAddition('chair', '椅子'))
  const before = useScene.getState()
  const result = executeStageCommands([
    {
      type: 'GroupObjects',
      meta: {
        commandId: 'group-command',
        transactionId: 'group-transaction',
        source: 'typed-command',
        issuedAt: new Date().toISOString(),
        expectedDocumentVersion: currentStageContext().documentVersion,
      },
      nodeIds: [first.nodeIds[0]!, second.nodeIds[0]!],
      name: '门前一组',
    },
  ])
  expect(result.ok).toBe(true)
  rememberAiTransaction(result, before ? Object.keys(before.nodes) : [], '组合')
  expect(
    Object.values(useScene.getState().collections).some((group) => group.name === '门前一组'),
  ).toBe(true)
  undoLastAiTransaction()
  expect(useScene.getState().collections).toEqual(before.collections)
  expect(useScene.getState().nodes).toEqual(before.nodes)
})

test('selected duplicates are one transaction and out-of-bounds or locked objects reject the entire batch', () => {
  const first = apply(legacyAddition('chair', '椅子'))
  useViewer.getState().setSelection({ selectedIds: first.nodeIds as AnyNodeId[] })
  const before = useScene.getState().nodes
  const commands = localSceneryOperation('复制选中布景两个沿横向按30厘米净距排列')!
  expect(commands).toHaveLength(2)
  const result = executeStageCommands(commands)
  expect(result.ok).toBe(true)
  rememberAiTransaction(result, Object.keys(before), '复制')
  undoLastAiTransaction()
  expect(useScene.getState().nodes).toEqual(before)
  const tooMany = localSceneryOperation('复制选中布景20个沿横向按30厘米净距排列')!
  expect(executeStageCommands(tooMany).ok).toBe(false)
  expect(useScene.getState().nodes).toEqual(before)
  expect(executeStageCommands(localSceneryOperation('选中布景锁定')).ok).toBe(true)
  const locked = useScene.getState().nodes
  const retry = localSceneryOperation('复制选中布景两个沿横向按30厘米净距排列')!
  expect(executeStageCommands(retry).ok).toBe(false)
  expect(useScene.getState().nodes).toBe(locked)
})

test('registered same-kind asset replacement preserves node ID, dimensions and undo; proxy conversion rejects', () => {
  const chairs = SCENERY_LIBRARY.filter((entry) => entry.kind === 'chair')
  expect(chairs.length).toBeGreaterThan(1)
  const added = executeStageCommands([
    { ...legacyAddition('chair', '椅子'), libraryAssetId: chairs[0]!.asset.id },
  ])
  expect(added.ok).toBe(true)
  const id = added.nodeIds[0]!
  const dimensions = currentStageContext().objects.find(
    (object) => object.id === id,
  )!.dimensionsMeters
  const replaced = executeStageCommands([
    {
      type: 'ReplaceScenery',
      meta: commandMeta(),
      nodeId: id,
      libraryAssetId: chairs[1]!.asset.id,
    },
  ])
  expect(replaced.ok).toBe(true)
  expect(
    currentStageContext().objects.find((object) => object.id === id)!.dimensionsMeters,
  ).toEqual(dimensions)
  const before = useScene.getState().nodes
  expect(
    executeStageCommands([
      { type: 'ReplaceScenery', meta: commandMeta(), nodeId: id, libraryAssetId: 'not-registered' },
    ]).ok,
  ).toBe(false)
  expect(useScene.getState().nodes).toBe(before)
})

test('saved legacy door clearance cannot prevent later close placement', () => {
  expect(currentStageContext().doorClearanceMeters).toBe(0)
  expect(localSceneryOperation('保持0米通道')?.[0]).toMatchObject({
    type: 'SetDoorClearance',
    meters: 0,
  })
  const door = apply(legacyAddition('door-flat', '门景片'))
  const old = useScene.getState().nodes
  const result = executeStageCommands(localSceneryOperation('保持1.2米通道'))
  expect(result.ok).toBe(true)
  expect(currentStageContext().doorClearanceMeters).toBe(1.2)
  const context = currentStageContext()
  const doorPosition = context.objects.find((object) => object.id === door.nodeIds[0])!.transform
    .position
  const chair = legacyAddition('chair', '椅子')
  chair.transform.position = { ...doorPosition, z: doorPosition.z + 1 }
  expect(executeStageCommands([chair]).ok).toBe(true)
  useScene.temporal.getState().undo()
  rememberAiTransaction(result, Object.keys(old), '锁定通道')
  undoLastAiTransaction()
  expect(useScene.getState().nodes).toEqual(old)
})
