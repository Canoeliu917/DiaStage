import {
  type AnyNodeId,
  getNodeLock,
  runAsSingleSceneHistoryStep,
  useScene,
} from '@pascal-app/core'
import { useInteractionScope } from '@pascal-app/editor'
import { useStageCommandNotice } from './command-executor'
import { exitStageFolding, foldPositionCount } from './folding'
import { AVAILABLE_STAGE_SCENERY } from './prop-assets'

export function resetStageObjectShape(id: string): { ok: boolean; message: string } {
  const state = useScene.getState()
  const node = state.nodes[id as AnyNodeId]
  if (state.readOnly || getNodeLock(state.nodes, id, true))
    return { ok: false, message: '该物品已固定或场景只读，请先解除固定。' }
  if (!node || !['item', 'block', 'stair'].includes(node.type))
    return { ok: false, message: '请先选中一件置景道具。' }
  exitStageFolding()
  if (useInteractionScope.getState().scope.kind !== 'idle')
    return { ok: false, message: '请先完成或取消当前操作。' }
  useStageCommandNotice.setState({ error: '' })
  runAsSingleSceneHistoryStep(useScene, () => {
    if (node.type === 'item') {
      const original = AVAILABLE_STAGE_SCENERY.find(
        (entry) => entry.asset.id === node.asset.id,
      )?.asset
      state.updateNode(node.id, {
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        ...(original
          ? {
              asset: {
                ...node.asset,
                dimensions: original.dimensions!,
                boundsCenter: original.boundsCenter,
              },
            }
          : {}),
        ...(foldPositionCount(node)
          ? { controls: { fold_angle_1_deg: 90, fold_angle_2_deg: 90 } }
          : {}),
      })
    } else if (node.type === 'block' || node.type === 'stair') {
      state.updateNode(node.id, { rotation: 0 })
    }
  })
  if (useStageCommandNotice.getState().error)
    return { ok: false, message: useStageCommandNotice.getState().error }
  return { ok: true, message: '形状已初始化，台位保持不变；可撤销。' }
}
