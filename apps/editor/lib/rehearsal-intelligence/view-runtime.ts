import { type AnyNodeId, type CameraPose, emitter, sceneRegistry, useScene } from '@pascal-app/core'
import { STAGE_OBJECT_REGISTRY } from '@pascal-app/core/stage'
import { subscribeCameraPose, useEditor } from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import { Box3, Vector3 } from 'three'
import { applyCameraRuntimeActions, mapCameraIntent } from './camera-runtime-actions'
import {
  cameraIntentAction,
  cameraIntentNotice,
  executeViewCommand,
  type ViewCommand,
} from './view-commands'

export function runViewCommand(sceneId: string, command: ViewCommand) {
  const editor = useEditor.getState()
  if (editor.isFirstPersonMode || editor.isCaptureMode)
    return '请先退出第一人称或截图状态，再调整或保存观察视角。'
  let pose: CameraPose | null = null
  subscribeCameraPose((current) => {
    pose = current
  })()
  if (command.type === 'CAMERA_INTENT') {
    const actions = mapCameraIntent(command)
    if (actions) {
      if (!pose) return '观察视图还未准备好，请稍后再试。'
      let target
      if (command.target) {
        const nodes = Object.values(useScene.getState().nodes)
        const selected = useViewer.getState().selection.selectedIds
        const tables = nodes.filter(
          (node) =>
            node.type === 'item' &&
            STAGE_OBJECT_REGISTRY.some(
              (spec) => spec.canonicalId === node.asset.id && spec.kind === 'table',
            ),
        )
        const selectedTables = tables.filter((node) => selected.includes(node.id))
        const candidates =
          command.target === 'stage'
            ? nodes.filter((node) => node.type === 'slab' || node.type === 'item')
            : command.target === 'selection'
              ? nodes.filter((node) => selected.includes(node.id))
              : selectedTables.length
                ? selectedTables
                : tables
        if (!candidates.length || (command.target !== 'stage' && candidates.length !== 1))
          return '请先选中一个要观察的物品；当前观察目标不唯一或不存在。'
        const box = new Box3()
        for (const node of candidates) {
          const object = sceneRegistry.nodes.get(node.id)
          if (!object) return '观察目标尚未加载完成，请稍后再试。'
          object.updateWorldMatrix(true, true)
          box.union(new Box3().setFromObject(object))
        }
        if (box.isEmpty()) return '观察目标尚未加载完成，请稍后再试。'
        const viewport = document.querySelector('canvas')?.getBoundingClientRect()
        target = {
          center: box.getCenter(new Vector3()).toArray() as CameraPose['target'],
          radius: box.getSize(new Vector3()).length() / 2,
          aspect: viewport?.width && viewport.height ? viewport.width / viewport.height : 1,
        }
      }
      if (editor.viewMode === '2d') editor.setViewMode('3d')
      emitter.emit('camera-controls:apply-pose', applyCameraRuntimeActions(pose, actions, target))
      return '已调整观察视角，舞台物品保持原位。'
    }
    const action = cameraIntentAction(command)
    if (!action) return cameraIntentNotice(command)
    command = action
  }
  if (command.type !== 'SAVE_VIEW' && editor.viewMode === '2d') editor.setViewMode('3d')
  return executeViewCommand(command, {
    sceneId,
    pose,
    selectedIds: useViewer.getState().selection.selectedIds,
    storage: localStorage,
    applyPose: (next) => emitter.emit('camera-controls:apply-pose', next),
    focus: (nodeId) => emitter.emit('camera-controls:focus', { nodeId: nodeId as AnyNodeId }),
    reset: () => emitter.emit('camera-controls:fit-scene', {}),
  })
}
