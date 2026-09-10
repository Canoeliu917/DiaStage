import { afterEach, beforeEach, expect, test } from 'bun:test'
import { clearSceneHistory, useScene } from '@pascal-app/core'
import { compileStagePlan, parseStageText } from '@pascal-app/core/stage'
import { createTheatreSceneGraph } from '../theatre/new-production'
import {
  deleteRecentlyAdded,
  localControl,
  rememberAiTransaction,
  undoLastAiTransaction,
} from './ai-controls'
import { connectStageCommandExecutor, executeStageCommands } from './command-executor'
import { currentStageContext } from './context'

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

function apply(text: string) {
  const context = currentStageContext()
  const plan = parseStageText(text, context)
  const compiled = compileStagePlan(plan, context, {
    transactionId: crypto.randomUUID(),
    issuedAt: new Date().toISOString(),
  })
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
  apply('添加窗景片')
  const after = useScene.getState().nodes
  const deletion = deleteRecentlyAdded('删除刚才添加的窗景片。')
  expect(deletion).toHaveLength(1)
  expect(useScene.getState().nodes).toBe(after)
  expect(deleteRecentlyAdded('添加窗景片')).toBeNull()
  undoLastAiTransaction()
  expect(useScene.getState().nodes).toEqual(before)
})

test('AI undo refuses to undo later unrelated edits or a different project', () => {
  apply('添加窗景片')
  const graph = createTheatreSceneGraph()
  useScene.getState().setScene(graph.nodes, graph.rootNodeIds, graph)
  const before = useScene.getState().nodes
  expect(() => undoLastAiTransaction()).toThrow()
  expect(useScene.getState().nodes).toBe(before)
})
