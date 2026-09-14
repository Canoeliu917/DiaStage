import { type AnyNodeId, type CameraPose, emitter } from '@pascal-app/core'
import { subscribeCameraPose, useEditor } from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import {
  cameraIntentAction,
  cameraIntentNotice,
  executeViewCommand,
  type ViewCommand,
} from './view-commands'

export function runViewCommand(sceneId: string, command: ViewCommand) {
  if (command.type === 'CAMERA_INTENT') {
    const action = cameraIntentAction(command)
    if (!action) return cameraIntentNotice(command)
    command = action
  }
  const editor = useEditor.getState()
  if (editor.isFirstPersonMode || editor.isCaptureMode)
    return '请先退出第一人称或截图状态，再调整或保存观察视角。'
  if (command.type !== 'SAVE_VIEW' && editor.viewMode === '2d') editor.setViewMode('3d')
  let pose: CameraPose | null = null
  subscribeCameraPose((current) => {
    pose = current
  })()
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
