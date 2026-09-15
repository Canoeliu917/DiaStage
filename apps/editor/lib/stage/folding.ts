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
import {
  applyItemFoldControls,
  computeItemFoldBounds,
  itemFoldJointFrame,
  limitItemFoldControls,
} from '@pascal-app/nodes/item-fold'
import { useViewer } from '@pascal-app/viewer'
import { Euler, Matrix4, type Object3D, Quaternion, Vector3 } from 'three'
import { create } from 'zustand'
import { useStageCommandNotice } from './command-executor'
import { prepareFoldObstacleCheck } from './model-contact'
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

export const foldCornerPosition = (corner: number) => (corner < 2 ? corner : corner - 2)
export const foldCornerCode = (corner: number) =>
  `${foldCornerPosition(corner) + 1}${corner < 2 ? 'L' : 'R'}`
export const foldCorners = (node: AnyNode | undefined) =>
  Array.from({ length: foldPositionCount(node) }, (_, i) => [i, i + 2]).flat()

export const useStageFolding = create<{
  nodeId: string | null
  position: number
  side: 'left' | 'right'
  dragging: boolean
  notice: string
}>(() => ({ nodeId: null, position: 0, side: 'right', dragging: false, notice: '' }))

type FoldSession = {
  node: ItemNode
  root: Object3D
  position: number
  controls: ItemFoldControls
  patch: Partial<Pick<ItemNode, 'controls' | 'asset' | 'position' | 'rotation'>> | null
  inputDragging: boolean
  nodes: ReturnType<typeof useScene.getState>['nodes']
  parent: Matrix4
  world: Matrix4
  fixedJoint: Object3D | null
  fixedWorld: Matrix4 | null
  clearOfObstacles: () => boolean
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

export function beginFoldDrag(
  id: string,
  position: number,
  side: 'left' | 'right' = 'right',
): boolean {
  const node = editableNode(id)
  const root = sceneRegistry.nodes.get(id)
  if (
    !node ||
    position >= foldPositionCount(node) ||
    position < 0 ||
    !Number.isInteger(position) ||
    session ||
    useInteractionScope.getState().scope.kind !== 'idle'
  )
    return false
  if (!root?.getObjectByName(`Hinge_0${position + 2}`)) {
    useStageFolding.setState({ notice: '模型正在载入，请稍候。' })
    return false
  }
  if (useLiveNodeOverrides.getState().get(id)) return false
  if (node.children.length || node.asset.attachTo || node.wallId || node.blockFaceId) {
    useStageFolding.setState({ notice: '带有附着对象的景片暂不支持双侧折叠。' })
    return false
  }
  if (side === 'left' && Math.abs(node.scale[0] - node.scale[2]) > 1e-7) {
    useStageFolding.setState({ notice: '非等比缩放会使反向折叠产生剪切，请先恢复水平等比缩放。' })
    return false
  }
  const nodes = useScene.getState().nodes
  const obstacles: Object3D[] = []
  for (const other of Object.values(nodes)) {
    if (
      other.id === id ||
      other.visible === false ||
      !['item', 'block', 'stair', 'slab', 'wall'].includes(other.type)
    )
      continue
    const model = sceneRegistry.nodes.get(other.id)
    if (!model || (other.type === 'item' && model.userData.itemModelSettled !== true)) {
      useStageFolding.setState({ notice: '场景模型尚未就绪，无法验证折叠碰撞。' })
      return false
    }
    obstacles.push(model)
  }
  root.updateWorldMatrix(true, true)
  const clone = root.clone(true)
  clone.matrixAutoUpdate = false
  clone.matrix.copy(root.matrixWorld)
  applyItemFoldControls(clone, node.controls)
  clone.updateWorldMatrix(false, true)
  const fixedJoint = side === 'left' ? clone.getObjectByName(`Hinge_0${position + 2}`)! : null
  session = {
    node,
    root: clone,
    position,
    controls: foldControls(node),
    patch: null,
    inputDragging: useViewer.getState().inputDragging,
    nodes,
    parent: root.parent?.matrixWorld.clone() ?? new Matrix4(),
    world: clone.matrix.clone(),
    fixedJoint,
    fixedWorld: fixedJoint?.matrixWorld.clone() ?? null,
    clearOfObstacles: prepareFoldObstacleCheck(clone, obstacles),
  }
  useInteractionScope.getState().begin({ kind: 'handle-drag', nodeId: id, handle: foldHandle })
  useViewer.getState().setInputDragging(true)
  useStageFolding.setState({ nodeId: id, position, side, dragging: true, notice: '' })
  return true
}

export function previewFoldAngle(angle: number) {
  const active = session
  if (!active || !Number.isFinite(angle)) return
  if (editableNode(active.node.id) !== active.node || useScene.getState().nodes !== active.nodes) {
    finishFoldDrag(false)
    return
  }
  const key = foldKeys[active.position]!
  if (Math.abs(angle - active.controls[key]) < 1e-7) return
  const [min, max] = foldAngleRange(active.node, active.position)
  const requested = { ...active.controls, [key]: Math.max(min!, Math.min(max!, angle)) }
  const applyPose = () => {
    active.root.matrix.copy(active.world)
    active.root.updateWorldMatrix(false, true)
    if (active.fixedJoint && active.fixedWorld) {
      const relative = active.world.clone().invert().multiply(active.fixedJoint.matrixWorld)
      active.root.matrix.copy(active.fixedWorld).multiply(relative.invert())
      active.root.updateWorldMatrix(false, true)
    }
    return active.clearOfObstacles()
  }
  const result = limitItemFoldControls(active.root, active.controls, requested, applyPose)
  const controls = result.controls
  applyPose()
  const bounds = computeItemFoldBounds(active.root, active.node.scale)
  if (!bounds) return
  const pose: Partial<Pick<ItemNode, 'position' | 'rotation'>> = {}
  if (active.fixedJoint) {
    const position = new Vector3(),
      quaternion = new Quaternion(),
      scale = new Vector3()
    active.parent
      .clone()
      .invert()
      .multiply(active.root.matrix)
      .decompose(position, quaternion, scale)
    pose.position = position.toArray()
    pose.rotation = new Euler()
      .setFromQuaternion(quaternion)
      .toArray()
      .slice(0, 3) as ItemNode['rotation']
  }
  active.controls = controls
  active.patch = { ...pose, controls, asset: { ...active.node.asset, ...bounds } }
  useLiveNodeOverrides.getState().set(active.node.id, active.patch)
  useStageFolding.setState({
    notice: result.limited
      ? '已到接触位置，继续折叠会穿模。'
      : controls[key] !== angle
        ? `打开角度范围：${min}°–${max}°。`
        : '',
  })
}

export const foldCornerLabel = (corner: number) =>
  `铰链${foldCornerPosition(corner) + 1}${corner < 2 ? '左侧' : '右侧'}折叠`

export function foldCornerGeometry(node: ItemNode, corner: number, height = 0) {
  const root = sceneRegistry.nodes.get(node.id)
  const index = foldCornerPosition(corner)
  if (!foldCorners(node).includes(corner)) return null
  const joint = root?.getObjectByName(`Hinge_0${index + 2}`)
  if (!root || !joint?.parent) return null
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
    const frame = index === -1 ? null : itemFoldJointFrame(object, controls[foldKeys[index]!])
    return matrixFor(object.parent!)
      .clone()
      .multiply(
        new Matrix4().compose(
          frame?.position ?? object.position,
          frame?.quaternion ?? object.quaternion,
          object.scale,
        ),
      )
  }
  // Read the effective pose, not last frame's renderer matrices: cancellation must restore handles immediately.
  const matrix = matrixFor(joint)
  const frame = itemFoldJointFrame(joint, controls[foldKeys[index]!])
  const pivot = frame.pivot
    .clone()
    .add(new Vector3(0, height, 0))
    .applyMatrix4(matrixFor(joint.parent))
  const first = root.getObjectByName('Hinge_02')!
  const width = (first.userData.foldAuthoredOrigin ?? first.position.toArray())[0] as number
  const point =
    corner < 2
      ? new Vector3(width * 0.75, height, 0).applyMatrix4(matrixFor(joint.parent))
      : new Vector3(width * 0.25, height, 0).applyMatrix4(matrix)
  return {
    point,
    pivot,
    parentMatrix: matrixFor(joint.parent),
  }
}

export function beginFoldCornerDrag(id: string, corner: number) {
  const node = editableNode(id)
  return (
    !!node &&
    foldCorners(node).includes(corner) &&
    beginFoldDrag(id, foldCornerPosition(corner), corner < 2 ? 'left' : 'right')
  )
}

export function previewFoldCornerAngle(angle: number) {
  const active = session
  previewFoldAngle(
    active?.fixedJoint ? 2 * foldControls(active.node)[foldKeys[active.position]!] - angle : angle,
  )
}

export function finishFoldDrag(commit: boolean) {
  const active = session
  if (!active) return
  session = null
  useLiveNodeOverrides
    .getState()
    .clearFields(active.node.id, ['controls', 'asset', 'position', 'rotation'])
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
    useScene.getState().nodes !== active.nodes ||
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

export function setFoldAngle(
  id: string,
  position: number,
  angle: number,
  side: 'left' | 'right' = 'right',
) {
  if (beginFoldDrag(id, position, side)) {
    previewFoldAngle(angle)
    finishFoldDrag(true)
  }
}
