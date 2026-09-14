import { afterEach, beforeAll, beforeEach, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  clearSceneHistory,
  ItemNode,
  sceneRegistry,
  useLiveNodeOverrides,
  useScene,
} from '@pascal-app/core'
import { useInteractionScope } from '@pascal-app/editor'
import { applyItemFoldControls } from '@pascal-app/nodes'
import { useViewer } from '@pascal-app/viewer'
import { Group, Vector3 } from 'three'
import { ItemGLTFLoader } from '../../../../packages/nodes/src/item/model-loader'
import { createTheatreSceneGraph } from '../theatre/new-production'
import { connectStageCommandExecutor } from './command-executor'
import {
  beginFoldCornerDrag,
  beginFoldDrag,
  enterStageFolding,
  exitStageFolding,
  finishFoldDrag,
  foldCornerGeometry,
  previewFoldAngle,
  previewFoldCornerAngle,
  setFoldAngle,
} from './folding'
import { AVAILABLE_STAGE_SCENERY } from './prop-assets'
import { resetStageObjectShape } from './reset-shape'

globalThis.requestAnimationFrame ??= () => 0
globalThis.cancelAnimationFrame ??= () => {}
let model: Group
let node: ItemNode
let disconnect: () => void
beforeAll(async () => {
  const bytes = readFileSync(
    resolve(import.meta.dir, '../../public/stage-library/models/SCN-FOLD-03.glb'),
  )
  model = (
    await new ItemGLTFLoader().parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      '',
    )
  ).scene
})
beforeEach(() => {
  const graph = createTheatreSceneGraph()
  const level = Object.values(graph.nodes).find((entry) => entry.type === 'level')!
  node = ItemNode.parse({
    name: '折叠验证',
    parentId: level.id,
    asset: AVAILABLE_STAGE_SCENERY.find((entry) => entry.asset.id === 'SCN-FOLD-03')!.asset,
  })
  graph.nodes[node.id] = node
  level.children.push(node.id)
  useScene.getState().setScene(graph.nodes, graph.rootNodeIds, graph)
  useScene.setState({ readOnly: false })
  clearSceneHistory()
  const root = new Group()
  root.add(model.clone(true))
  sceneRegistry.nodes.set(node.id, root)
  disconnect = connectStageCommandExecutor()
})
afterEach(() => {
  exitStageFolding()
  disconnect()
  sceneRegistry.nodes.delete(node.id)
  useLiveNodeOverrides.getState().clearAll()
  useScene.getState().unloadScene()
  clearSceneHistory()
})

test('fold preview stays ephemeral, cancel restores it and release commits controls plus bounds in one undo step', () => {
  enterStageFolding(node.id)
  expect(beginFoldDrag(node.id, 0)).toBe(true)
  previewFoldAngle(135)
  expect(useScene.getState().nodes[node.id]).toEqual(node)
  expect(useLiveNodeOverrides.getState().get(node.id)?.controls).toEqual({
    fold_angle_1_deg: 135,
    fold_angle_2_deg: 90,
  })
  expect(useScene.temporal.getState().pastStates).toHaveLength(0)
  expect(useViewer.getState().inputDragging).toBe(true)
  finishFoldDrag(false)
  expect(useLiveNodeOverrides.getState().get(node.id)).toBeUndefined()
  expect(useViewer.getState().inputDragging).toBe(false)
  expect(useInteractionScope.getState().scope.kind).toBe('idle')
  expect(beginFoldDrag(node.id, 0)).toBe(true)
  previewFoldAngle(120)
  previewFoldAngle(150)
  finishFoldDrag(true)
  const after = useScene.getState().nodes[node.id] as ItemNode
  expect(after.controls).toEqual({ fold_angle_1_deg: 150, fold_angle_2_deg: 90 })
  expect(after.asset.dimensions).not.toEqual(node.asset.dimensions)
  expect(after.asset.boundsCenter).not.toEqual(node.asset.boundsCenter)
  expect([after.position, after.rotation, after.scale, after.parentId]).toEqual([
    node.position,
    node.rotation,
    node.scale,
    node.parentId,
  ])
  expect(useScene.temporal.getState().pastStates).toHaveLength(1)
  useScene.temporal.getState().undo()
  expect(useScene.getState().nodes[node.id]).toEqual(node)
  useScene.temporal.getState().redo()
  expect(useScene.getState().nodes[node.id]).toEqual(after)
})

test('fixed/read-only props reject folding and a lock arriving mid-drag cancels the preview', () => {
  useScene.setState({ readOnly: true })
  expect(beginFoldDrag(node.id, 0)).toBe(false)
  useScene.setState({ readOnly: false })
  expect(beginFoldDrag(node.id, 0)).toBe(true)
  previewFoldAngle(120)
  useScene.getState().updateNode(node.id, { metadata: { ...node.metadata, stageLocked: true } })
  previewFoldAngle(135)
  expect(useLiveNodeOverrides.getState().get(node.id)).toBeUndefined()
  expect(beginFoldDrag(node.id, 0)).toBe(false)
  expect((useScene.getState().nodes[node.id] as ItemNode).controls).toBeUndefined()
})

test('each hinge keeps the whole pose and pivot and writes one undo step', () => {
  const root = sceneRegistry.nodes.get(node.id)!
  const point = (name: string) => root.getObjectByName(name)!.getWorldPosition(new Vector3())
  for (const corner of [2, 3]) {
    const before = useScene.getState().nodes[node.id] as ItemNode
    const pivot = foldCornerGeometry(before, corner)!.pivot.clone()
    expect(beginFoldCornerDrag(node.id, corner)).toBe(true)
    previewFoldCornerAngle(120)
    const patch = useLiveNodeOverrides.getState().get(node.id)!
    expect(useScene.getState().nodes[node.id]).toEqual(before)
    const next = { ...before, ...patch } as ItemNode
    root.position.fromArray(next.position)
    root.rotation.set(...next.rotation)
    applyItemFoldControls(root, next.controls)
    root.updateWorldMatrix(true, true)
    expect(foldCornerGeometry(next, corner)!.pivot.distanceTo(pivot)).toBeLessThan(1e-6)
    expect(point('Hinge_01').distanceTo(point('Hinge_02'))).toBeCloseTo(0.9, 6)
    expect(point('Hinge_02').distanceTo(point('Hinge_03'))).toBeCloseTo(0.9, 6)
    expect(next.scale).toEqual(before.scale)
    expect(next.asset.dimensions[1]).toBeCloseTo(before.asset.dimensions[1], 6)
    expect([next.position, next.rotation]).toEqual([before.position, before.rotation])
    finishFoldDrag(true)
    expect(useScene.temporal.getState().pastStates).toHaveLength(1)
    useScene.temporal.getState().undo()
    expect(useScene.getState().nodes[node.id]).toEqual(before)
    clearSceneHistory()
    root.position.fromArray(before.position)
    root.rotation.set(...before.rotation)
    applyItemFoldControls(root, before.controls)
  }
  expect(beginFoldCornerDrag(node.id, -1)).toBe(false)
  expect(beginFoldCornerDrag(node.id, 4)).toBe(false)
})

test('cancel restores all corner positions even before the 3D renderer has reconciled its old pose', () => {
  const root = sceneRegistry.nodes.get(node.id)!
  const before = [0, 1, 2, 3].map((corner) => foldCornerGeometry(node, corner)!.point)
  expect(beginFoldCornerDrag(node.id, 2)).toBe(true)
  previewFoldCornerAngle(135)
  const patch = useLiveNodeOverrides.getState().get(node.id) as Partial<ItemNode>
  applyItemFoldControls(root, patch.controls)
  expect(foldCornerGeometry(node, 2)!.point.distanceTo(before[2]!)).toBeGreaterThan(0.1)
  finishFoldDrag(false)
  for (const corner of [0, 1, 2, 3])
    expect(foldCornerGeometry(node, corner)!.point.distanceTo(before[corner]!)).toBeLessThan(1e-6)
  expect(useScene.temporal.getState().pastStates).toHaveLength(0)
})

test('manifest closure is exact and retains the other relative angle', () => {
  setFoldAngle(node.id, 1, 180)
  setFoldAngle(node.id, 0, 180)
  const open = useScene.getState().nodes[node.id] as ItemNode
  expect(open.controls).toEqual({ fold_angle_1_deg: 180, fold_angle_2_deg: 180 })
  expect(open.asset.dimensions[0]).toBeCloseTo(2.7, 5)
  setFoldAngle(node.id, 0, 0)
  const closed = useScene.getState().nodes[node.id] as ItemNode
  expect(closed.controls!.fold_angle_1_deg).toBe(0)
  expect(closed.controls!.fold_angle_2_deg).toBe(180)
  expect(useScene.temporal.getState().pastStates).toHaveLength(3)
})

test('edited angles clamp to manifest maximum and commit as one undo step', () => {
  expect(beginFoldDrag(node.id, 0)).toBe(true)
  previewFoldAngle(180)
  previewFoldAngle(270)
  expect(useScene.getState().nodes[node.id]).toEqual(node)
  finishFoldDrag(true)
  const after = useScene.getState().nodes[node.id] as ItemNode
  expect(after.controls).toEqual({ fold_angle_1_deg: 180, fold_angle_2_deg: 90 })
  expect(after.asset.dimensions[1]).toBeCloseTo(2.4, 6)
  expect([after.position, after.rotation, after.scale]).toEqual([
    node.position,
    node.rotation,
    node.scale,
  ])
  expect(useScene.temporal.getState().pastStates).toHaveLength(1)
  useScene.temporal.getState().undo()
  expect(useScene.getState().nodes[node.id]).toEqual(node)
})

test('shape initialization restores official dimensions, tilt, scale and fold while retaining position, identity and undo', () => {
  const changed = ItemNode.parse({
    ...node,
    position: [1.23456, 0.08765, -2.34567],
    rotation: [0.2, 0.4, -0.3],
    scale: [1.2, 0.8, 1.5],
    controls: { fold_angle_1_deg: 270, fold_angle_2_deg: 150 },
    asset: { ...node.asset, dimensions: [2.1, 2.4, 0.6], boundsCenter: [1.05, 1.2, -0.3] },
  })
  useScene.setState({ nodes: { ...useScene.getState().nodes, [node.id]: changed } })
  clearSceneHistory()
  expect(resetStageObjectShape(node.id).ok).toBe(true)
  const after = useScene.getState().nodes[node.id] as ItemNode
  expect([after.id, after.position, after.parentId, after.name]).toEqual([
    changed.id,
    changed.position,
    changed.parentId,
    changed.name,
  ])
  expect(after.asset.dimensions).toEqual(node.asset.dimensions)
  expect(after.asset.boundsCenter).toEqual(node.asset.boundsCenter)
  expect(after.rotation).toEqual([0, 0, 0])
  expect(after.scale).toEqual([1, 1, 1])
  expect(after.controls).toEqual({ fold_angle_1_deg: 90, fold_angle_2_deg: 90 })
  expect(useScene.temporal.getState().pastStates).toHaveLength(1)
  useScene.temporal.getState().undo()
  expect(useScene.getState().nodes[node.id]).toEqual(changed)
  useScene.getState().updateNode(node.id, { metadata: { ...node.metadata, stageLocked: true } })
  const locked = useScene.getState().nodes[node.id]
  expect(resetStageObjectShape(node.id).ok).toBe(false)
  expect(useScene.getState().nodes[node.id]).toBe(locked)
})
