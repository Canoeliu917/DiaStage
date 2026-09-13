import { type AnyNodeId, useScene } from '@pascal-app/core'
import {
  parseStageLength,
  parseStageNumber,
  type StageCommand,
  stageObjectBounds,
} from '@pascal-app/core/stage'
import { useViewer } from '@pascal-app/viewer'
import { commandMeta, type StageExecutionResult } from './command-executor'
import { currentStageContext, stageSite } from './context'
import { SCENERY_LIBRARY } from './scenery'

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

export function aiCommandContext(input: string) {
  const context = currentStageContext()
  const last = recentAiTransaction()
  if (!context.selectedObjectIds.length && last && /(它|这组|刚才)/.test(input))
    context.selectedObjectIds = last.nodeIds.filter((id) =>
      context.objects.some((object) => object.id === id),
    )
  return context
}

export function undoLastAiTransaction() {
  const last = recentAiTransaction()
  const state = useScene.getState()
  const history = useScene.temporal.getState()
  if (!last || state.readOnly) throw new Error('没有可撤销的 AI 操作。')
  if (
    last.after.nodes !== state.nodes ||
    last.after.materials !== state.materials ||
    last.after.collections !== state.collections ||
    history.pastStates.length !== last.historyLength ||
    last.historyLength === 0
  )
    throw new Error('此后舞台已有其他修改，请使用舞台历史逐步撤销。')
  history.undo()
  useViewer.getState().setSelection({
    selectedIds: last.nodeIds.filter(
      (id) => useScene.getState().nodes[id as AnyNodeId],
    ) as AnyNodeId[],
  })
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

export function localSceneryOperation(text: string): StageCommand[] | null {
  const input = text
    .normalize('NFKC')
    .replace(/[。！!]$/, '')
    .trim()
  const group = input.match(/^(?:把|将)?(?:选中(?:的)?(?:布景|对象)|这组)(?:组合为|保存为)(.+)$/)
  const replace = input.match(/^(?:把|将)?选中(?:的)?(?:布景|对象)替换为(.+)$/)
  const lock = /^(?:把|将)?选中(?:的)?(?:布景|对象)(?:锁定|位置锁定|的位置不能动)$/.test(input)
  const namedLock = input.match(/^(.+?)的位置不能动$/)
  const clearance = input.match(/^保持(.+?)通道$/)
  const copies = input.match(/^复制选中(?:的)?(?:布景|对象)(.+?)个沿(横向|纵向)按(.+?)净距排列$/)
  if (!group && !replace && !lock && !namedLock && !clearance && !copies) return null
  const context = aiCommandContext(input)
  if (clearance) {
    const meters = parseStageLength(clearance[1]!)
    if (meters === null || meters < 0 || meters > 10)
      throw new Error('请输入0至10米的通道记录值；该记录不会限制布景落位。')
    return [{ type: 'SetDoorClearance', meta: commandMeta('typed-command'), meters }]
  }
  if (namedLock && !lock) {
    const matches = context.objects.filter((object) => object.name === namedLock[1])
    if (matches.length !== 1) throw new Error('无法唯一确定要锁定的布景，请先选中。')
    context.selectedObjectIds = [matches[0]!.id]
  }
  const ids = context.selectedObjectIds
  if (!ids.length || (replace && ids.length !== 1) || (group && ids.length < 2))
    throw new Error(
      group ? '请至少选中两个布景。' : '请先选中要处理的布景；资产替换一次只处理一个对象。',
    )
  const meta = commandMeta('typed-command')
  if (copies) {
    const count = parseStageNumber(copies[1]!),
      gap = parseStageLength(copies[3]!)
    if (
      ids.length !== 1 ||
      count === null ||
      !Number.isInteger(count) ||
      count < 1 ||
      count > 200 ||
      gap === null ||
      gap < 0
    )
      throw new Error('请选择一个布景，副本数量1至200个，并明确非负净距。')
    const original = context.objects.find((object) => object.id === ids[0])!
    const bounds = stageObjectBounds(original)
    const axis = copies[2] === '横向' ? 'x' : 'z'
    const step = (axis === 'x' ? bounds.maxX - bounds.minX : bounds.maxZ - bounds.minZ) + gap
    return Array.from({ length: count }, (_, index) => ({
      type: 'DuplicateObject',
      meta: { ...meta, commandId: `${meta.commandId}:${index}` },
      sourceNodeId: original.id,
      newNodeId: `${meta.transactionId}:${index}`,
      name: `${original.name}副本${index + 1}`,
      position: {
        ...original.transform.position,
        [axis]: original.transform.position[axis] + step * (index + 1),
      },
    }))
  }
  if (group) return [{ type: 'GroupObjects', meta, nodeIds: ids, name: group[1]!.trim() }]
  if (replace) {
    const candidates = SCENERY_LIBRARY.filter(
      (entry) => entry.asset.name === replace[1] || entry.asset.id === replace[1],
    )
    if (candidates.length !== 1) throw new Error('未找到唯一的登记库资产，请从舞台库查看准确名称。')
    return [
      { type: 'ReplaceScenery', meta, nodeId: ids[0]!, libraryAssetId: candidates[0]!.asset.id },
    ]
  }
  return ids.map((nodeId, index) => ({
    type: 'SetObjectLock',
    meta: { ...meta, commandId: `${meta.commandId}:${index}` },
    nodeId,
    locked: true,
  }))
}
