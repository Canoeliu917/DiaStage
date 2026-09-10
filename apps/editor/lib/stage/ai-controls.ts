import { useScene } from '@pascal-app/core'
import type { StageCommand } from '@pascal-app/core/stage'
import { commandMeta, type StageExecutionResult } from './command-executor'
import { currentStageContext, stageSite } from './context'

export function localControl(text: string) {
  const normalized = text
    .normalize('NFKC')
    .replace(/[\s。！!]/g, '')
    .replace(/^请/, '')
  if (/^(停止|停止生成|停止制景|停止连续制景)$/.test(normalized)) return 'stop'
  if (/^(取消|取消处理|取消生成)$/.test(normalized)) return 'cancel'
  if (/^(撤销|撤销上一步|撤销刚才|撤销刚才的操作)$/.test(normalized)) return 'undo'
  return null
}

let lastAiTransaction: {
  siteId: string
  nodeIds: string[]
  addedNodeIds: string[]
  summary: string
  after: ReturnType<typeof useScene.getState>
  historyLength: number
} | null = null

export function rememberAiTransaction(
  result: StageExecutionResult,
  previousIds: string[],
  summary: string,
) {
  if (!result.ok || result.alreadyApplied) return
  lastAiTransaction = {
    siteId: stageSite().id,
    nodeIds: result.nodeIds,
    addedNodeIds: result.nodeIds.filter((id) => !previousIds.includes(id)),
    summary,
    after: useScene.getState(),
    historyLength: useScene.temporal.getState().pastStates.length,
  }
}

export function recentAiTransaction() {
  if (!lastAiTransaction || lastAiTransaction.siteId !== stageSite().id) return null
  return lastAiTransaction
}

export function undoLastAiTransaction() {
  const last = recentAiTransaction()
  const state = useScene.getState()
  const history = useScene.temporal.getState()
  if (!last || state.readOnly) throw new Error('没有可撤销的 AI 操作。')
  if (
    last.after.nodes !== state.nodes ||
    last.after.materials !== state.materials ||
    history.pastStates.length !== last.historyLength ||
    last.historyLength === 0
  )
    throw new Error('此后舞台已有其他修改，请使用舞台历史逐步撤销。')
  history.undo()
  lastAiTransaction = null
}

export function deleteRecentlyAdded(text: string): StageCommand[] | null {
  const match = text
    .normalize('NFKC')
    .trim()
    .match(/^(?:请)?删除刚才添加的(.+?)[。！!]?$/)
  if (!match) return null
  const last = recentAiTransaction()
  const matches = currentStageContext().objects.filter(
    (object) => last?.addedNodeIds.includes(object.id) && object.name === match[1],
  )
  if (matches.length !== 1) throw new Error('无法唯一确定刚才添加的对象，请选中对象后手动删除。')
  return [{ type: 'RemoveObject', meta: commandMeta('typed-command'), nodeId: matches[0]!.id }]
}
