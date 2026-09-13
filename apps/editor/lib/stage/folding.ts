'use client'

import {
  type AnyNode,
  type AnyNodeId,
  getNodeLock,
  type ItemFoldControls,
  type ItemNode,
  runAsSingleSceneHistoryStep,
  sceneRegistry,
  useLiveNodeOverrides,
  useScene,
} from '@pascal-app/core'
import { useInteractionScope } from '@pascal-app/editor'
import { computeItemFoldBounds, limitItemFoldControls } from '@pascal-app/nodes'
import { useViewer } from '@pascal-app/viewer'
import type { Object3D } from 'three'
import { create } from 'zustand'
import { useStageCommandNotice } from './command-executor'

export const foldKeys = ['fold_angle_1_deg', 'fold_angle_2_deg'] as const
export const foldHandle = 'stage-fold'
export function foldPositionCount(node: AnyNode | undefined): number {
  if (node?.type !== 'item') return 0
  return node.asset.id === 'SCN-FOLD-02' ? 1 : node.asset.id === 'SCN-FOLD-03' ? 2 : 0
}
export function foldControls(node: ItemNode): ItemFoldControls {
  return { fold_angle_1_deg: 90, fold_angle_2_deg: 90, ...node.controls }
}

export const useStageFolding = create<{
  nodeId: string | null
  position: number
  dragging: boolean
  notice: string
}>(() => ({ nodeId: null, position: 0, dragging: false, notice: '' }))

type FoldSession = {
  node: ItemNode
  root: Object3D
  position: number
  controls: ItemFoldControls
  patch: Pick<ItemNode, 'controls' | 'asset'> | null
  inputDragging: boolean
}
let session: FoldSession | null = null

function editableNode(id: string): ItemNode | null {
  const state = useScene.getState()
  const node = state.nodes[id as AnyNodeId]
  return !state.readOnly &&
    node?.type === 'item' &&
    foldPositionCount(node) &&
    !getNodeLock(state.nodes, id, true)
    ? node
    : null
}

export function enterStageFolding(id: string) {
  finishFoldDrag(false)
  if (!editableNode(id) || useInteractionScope.getState().scope.kind !== 'idle') return
  useStageFolding.setState({ nodeId: id, position: 0, notice: '' })
}

export function exitStageFolding() {
  finishFoldDrag(false)
  useStageFolding.setState({ nodeId: null, position: 0, notice: '' })
}

export function beginFoldDrag(id: string, position: number): boolean {
  const node = editableNode(id)
  const root = sceneRegistry.nodes.get(id)
  if (
    !node ||
    position >= foldPositionCount(node) ||
    position < 0 ||
    session ||
    useInteractionScope.getState().scope.kind !== 'idle'
  )
    return false
  if (!root?.getObjectByName(`Hinge_0${position + 2}`)) {
    useStageFolding.setState({ notice: '模型正在载入，请稍候。' })
    return false
  }
  if (useLiveNodeOverrides.getState().get(id)) return false
  session = {
    node,
    root: root.clone(true),
    position,
    controls: foldControls(node),
    patch: null,
    inputDragging: useViewer.getState().inputDragging,
  }
  useInteractionScope.getState().begin({ kind: 'handle-drag', nodeId: id, handle: foldHandle })
  useViewer.getState().setInputDragging(true)
  useStageFolding.setState({ nodeId: id, position, dragging: true, notice: '' })
  return true
}

export function previewFoldAngle(angle: number) {
  const active = session
  if (!active || !Number.isFinite(angle)) return
  if (editableNode(active.node.id) !== active.node) {
    finishFoldDrag(false)
    return
  }
  const key = foldKeys[active.position]!
  if (Math.abs(angle - active.controls[key]) < 1e-7) return
  const result = limitItemFoldControls(active.root, active.controls, {
    ...active.controls,
    [key]: angle,
  })
  const bounds = computeItemFoldBounds(active.root, active.node.scale)
  if (!bounds) return
  active.controls = result.controls
  active.patch = { controls: result.controls, asset: { ...active.node.asset, ...bounds } }
  useLiveNodeOverrides.getState().set(active.node.id, active.patch)
  useStageFolding.setState({ notice: result.limited ? '景片已到可折叠位置。' : '' })
}

export function finishFoldDrag(commit: boolean) {
  const active = session
  if (!active) return
  session = null
  useLiveNodeOverrides.getState().clearFields(active.node.id, ['controls', 'asset'])
  useViewer.getState().setInputDragging(active.inputDragging)
  useInteractionScope
    .getState()
    .endIf(
      (scope) =>
        scope.kind === 'handle-drag' &&
        scope.handle === foldHandle &&
        scope.nodeId === active.node.id,
    )
  useStageFolding.setState({ dragging: false })
  if (
    !commit ||
    !active.patch ||
    editableNode(active.node.id) !== active.node ||
    foldKeys.every((key) => Math.abs(active.controls[key] - foldControls(active.node)[key]) < 1e-7)
  )
    return
  runAsSingleSceneHistoryStep(useScene, () => {
    useScene.getState().updateNode(active.node.id, active.patch!)
  })
  if (useScene.getState().nodes[active.node.id] === active.node)
    useStageFolding.setState({
      notice: useStageCommandNotice.getState().error || '本次折叠未保存。',
    })
}

export function setFoldAngle(id: string, position: number, angle: number) {
  if (beginFoldDrag(id, position)) {
    previewFoldAngle(angle)
    finishFoldDrag(true)
  }
}
