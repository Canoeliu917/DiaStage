import { useScene } from '@pascal-app/core'
import { useEditor, useInteractionScope } from '@pascal-app/editor'
import { useCameraStudio } from '../camera-studio/store'
import { isValidLightPose } from './model'
import { useLighting } from './store'

export type Light = ReturnType<typeof useLighting.getState>['project']['lights'][number]
export type LightPose = Pick<Light, 'position' | 'target'>
export const lightOwner = (sceneId: string, id: string) => `light:${sceneId}:${id}`

export function lightingEditorView(
  editor: ReturnType<typeof useEditor.getState>,
  view: '2d' | '3d',
) {
  return (
    editor.workspaceMode === 'edit' &&
    editor.activeSidebarPanel === 'picture' &&
    editor.mode === 'select' &&
    editor.viewMode !== (view === '2d' ? '3d' : '2d') &&
    !editor.isPreviewMode &&
    !editor.isCaptureMode &&
    !editor.isFirstPersonMode
  )
}

export function lightingEditAllowed(sceneId: string, view: '2d' | '3d') {
  const editor = useEditor.getState()
  const camera = useCameraStudio.getState()
  const lighting = useLighting.getState()
  const scope = useInteractionScope.getState().scope
  return (
    lighting.loadedSceneId === sceneId &&
    lighting.showHelpers &&
    !useScene.getState().readOnly &&
    lightingEditorView(editor, view) &&
    !camera.playing &&
    !camera.previewing &&
    !camera.recording &&
    (scope.kind === 'idle' || (scope.kind === 'handle-drag' && scope.handle === 'lighting'))
  )
}

export function validLightPose(pose: LightPose) {
  return isValidLightPose(pose.position, pose.target)
}
