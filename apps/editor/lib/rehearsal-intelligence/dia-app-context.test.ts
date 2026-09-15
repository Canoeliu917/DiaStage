import { expect, test } from 'bun:test'
import { useScene } from '@pascal-app/core'
import { useEditor } from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import { useStageTransform } from '@/components/stage-entry/transform-mode'
import { currentDiaAppContext, DIASTAGE_CAPABILITIES } from './dia-app-context'

test('Dia reads the current client settings without gaining scene authority', () => {
  const editorBefore = useEditor.getState()
  const viewerBefore = useViewer.getState()
  const transformBefore = useStageTransform.getState()
  const readOnlyBefore = useScene.getState().readOnly
  useEditor.setState({
    viewMode: 'split',
    activeSidebarPanel: 'build',
    workspaceMode: 'edit',
    rotationAxis: 'z',
    gridSnapStep: 0.1,
    snappingModeByContext: { ...useEditor.getState().snappingModeByContext, item: 'lines' },
    isPreviewMode: false,
    isCaptureMode: false,
    isFirstPersonMode: false,
  })
  useViewer.setState({ showGrid: false, showGuides: true, textures: false, sceneTheme: 'night' })
  useStageTransform.setState({ mode: 'rotate', cameraLocked: true })
  useScene.setState({ readOnly: true })

  const context = currentDiaAppContext()
  expect(context.settings).toMatchObject({
    viewMode: 'split',
    activePanel: 'build',
    transformMode: 'rotate',
    rotationAxis: 'z',
    cameraLocked: true,
    placementMode: 'edge_and_support',
    gridStepCentimeters: 10,
    gridVisible: false,
    guidesVisible: true,
    displayMode: 'black_box',
    readOnly: true,
  })
  expect(DIASTAGE_CAPABILITIES.find((item) => item.id === 'dia-proposal')?.authority).toBe(
    'proposal_only',
  )
  expect(DIASTAGE_CAPABILITIES.some((item) => item.authority === 'manual_only')).toBe(true)

  useEditor.setState(editorBefore)
  useViewer.setState(viewerBefore)
  useStageTransform.setState(transformBefore)
  useScene.setState({ readOnly: readOnlyBefore })
})
