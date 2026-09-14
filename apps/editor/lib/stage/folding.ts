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
  useLiveTransforms,
  useScene,
} from '@pascal-app/core'
import { useInteractionScope } from '@pascal-app/editor'
import { applyItemFoldControls, computeItemFoldBounds } from '@pascal-app/nodes/item-fold'
import { useViewer } from '@pascal-app/viewer'
import { Euler, Matrix4, type Object3D, Quaternion, Vector3 } from 'three'
import { create } from 'zustand'
import { useStageCommandNotice } from './command-executor'
import { STAGE_PROP_MENU } from './prop-assets'

export const foldKeys = ['fold_angle_1_deg', 'fold_angle_2_deg'] as const
export const foldHandle = 'stage-fold'
export function foldPositionCount(node: AnyNode | undefined): number {
  if (node?.type !== 'item') return 0
  return node.asset.id === 'SCN-FOLD-02' ? 1 : node.asset.id === 'SCN-FOLD-03' ? 2 : 0
}
export function foldAngleRange(node: ItemNode, position: number): readonly number[] {
  return STAGE_PROP_MENU.assets.find((asset) => asset.id === node.asset.id)!.articulation!.joints[
    position
  ]!.included_angle_range_deg
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
  patch: Partial<Pick<ItemNode, 'controls' | 'asset'>> | null
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
  const [min, max] = foldAngleRange(active.node, active.position)
  const controls = { ...active.controls, [key]: Math.max(min!, Math.min(max!, angle)) }
  applyItemFoldControls(active.root, controls)
  const bounds = computeItemFoldBounds(active.root, active.node.scale)
  if (!bounds) return
  active.controls = controls
  active.patch = { controls, asset: { ...active.node.asset, ...bounds } }
  useLiveNodeOverrides.getState().set(active.node.id, active.patch)
  useStageFolding.setState({
    notice: controls[key] !== angle ? `打开角度范围：${min}°–${max}°。` : '',
  })
}

export const foldCornerLabel = (corner: number) => `折叠位置${corner - 1}打开角度`

export function foldCornerGeometry(node: ItemNode, corner: number, height = 0) {
  const root = sceneRegistry.nodes.get(node.id)
  const joint = root?.getObjectByName(`Hinge_0${corner < 2 ? 1 : corner}`)
  if (!root || !joint?.parent) return null
  const next = root.getObjectByName(`Hinge_0${corner < 2 ? 2 : corner + 1}`)
  const effective = { ...node, ...useLiveNodeOverrides.getState().get(node.id) } as ItemNode
  const live = useLiveTransforms.getState().get(node.id)
  const rotation = live
    ? ([effective.rotation[0], live.rotation, effective.rotation[2]] as const)
    : effective.rotation
  root.parent?.updateWorldMatrix(true, false)
  const base = (root.parent?.matrixWorld.clone() ?? new Matrix4()).multiply(
    new Matrix4().compose(
      new Vector3(...(live?.position ?? effective.position)),
      new Quaternion().setFromEuler(new Euler(...rotation)),
      root.scale,
    ),
  )
  const controls = foldControls(effective)
  const matrixFor = (object: Object3D): Matrix4 => {
    if (object === root) return base
    const index = object.name === 'Hinge_02' ? 0 : object.name === 'Hinge_03' ? 1 : -1
    const quaternion =
      index === -1
        ? object.quaternion
        : new Quaternion().setFromAxisAngle(
            new Vector3(0, 1, 0),
            ((180 - controls[foldKeys[index]!]) * Math.PI) / 180,
          )
    return matrixFor(object.parent!)
      .clone()
      .multiply(new Matrix4().compose(object.position, quaternion, object.scale))
  }
  // Read the effective pose, not last frame's renderer matrices: cancellation must restore handles immediately.
  const matrix = matrixFor(joint)
  const origin = new Vector3(0, height, 0).applyMatrix4(matrix)
  // The authored hinge spacing is the fixed panel width, including after a fold.
  const first = root.getObjectByName('Hinge_02')!
  const end = next
    ? new Vector3(0, height, 0).applyMatrix4(matrixFor(next))
    : new Vector3(first.position.x, height, 0).applyMatrix4(matrix)
  return {
    point: corner === 0 ? origin : end,
    pivot: corner === 0 ? end : origin,
    parentMatrix: matrixFor(joint.parent),
  }
}

export function beginFoldCornerDrag(id: string, corner: number) {
  return Number.isInteger(corner) && corner >= 2 && beginFoldDrag(id, corner - 2)
}

export function previewFoldCornerAngle(angle: number) {
  previewFoldAngle(angle)
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
