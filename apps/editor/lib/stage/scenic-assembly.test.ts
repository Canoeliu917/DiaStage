import { afterEach, beforeAll, beforeEach, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { clearSceneHistory, ItemNode, sceneRegistry, useScene } from '@pascal-app/core'
import {
  canStageStack,
  type SceneContextObject,
  type SceneContextSummary,
  stageFootprintGap,
} from '@pascal-app/core/stage'
import { applyItemFoldControls } from '@pascal-app/nodes/item-fold'
import { useViewer } from '@pascal-app/viewer'
import { Group } from 'three'
import { ItemGLTFLoader } from '../../../../packages/nodes/src/item/model-loader'
import { createTheatreSceneGraph } from '../theatre/new-production'
import { connectStageCommandExecutor } from './command-executor'
import { exitStageFolding, setFoldAngle } from './folding'
import { stageModelBottom, stageVisibleFootprints } from './model-contact'
import { snapStageObject } from './placement-snap'
import { AVAILABLE_STAGE_SCENERY } from './prop-assets'

globalThis.requestAnimationFrame ??= () => 0
globalThis.cancelAnimationFrame ??= () => {}
const models = new Map<string, Group>()
let nodes: ItemNode[] = []
let disconnect: () => void
const options = { grid: 0 as const, guides: true }
const context = (objects: SceneContextObject[]): SceneContextSummary => ({
  documentVersion: 1,
  selectedObjectIds: [],
  venue: { type: 'black-box', widthMeters: 8, depthMeters: 6, heightMeters: 3 },
  objects,
})
beforeAll(async () => {
  for (const id of ['SCN-FLAT-090', 'SCN-DOOR-130', 'SCN-WIN-130', 'SCN-FOLD-02', 'SCN-FOLD-03']) {
    const bytes = readFileSync(
      new URL(`../../public/stage-library/models/${id}.glb`, import.meta.url),
    )
    models.set(
      id,
      (
        await new ItemGLTFLoader().parseAsync(
          bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
          '',
        )
      ).scene,
    )
  }
})
beforeEach(() => {
  const graph = createTheatreSceneGraph()
  useScene.getState().setScene(graph.nodes, graph.rootNodeIds, graph)
  useScene.setState({ readOnly: false })
  clearSceneHistory()
  disconnect = connectStageCommandExecutor()
})
afterEach(() => {
  exitStageFolding()
  disconnect()
  for (const node of nodes) sceneRegistry.nodes.delete(node.id)
  nodes = []
  useScene.getState().unloadScene()
  clearSceneHistory()
})
function add(assetId: string): SceneContextObject {
  const source = AVAILABLE_STAGE_SCENERY.find(({ asset }) => asset.id === assetId)!
  const level = Object.values(useScene.getState().nodes).find((node) => node.type === 'level')!
  const node = ItemNode.parse({ asset: source.asset, parentId: level.id })
  useScene.getState().createNode(node)
  nodes.push(node)
  const root = new Group()
  root.userData.itemModelSettled = true
  root.add(models.get(assetId)!.clone(true))
  sceneRegistry.nodes.set(node.id, root)
  return {
    id: node.id,
    name: source.asset.name,
    kind: source.kind,
    dimensionsMeters: {
      width: node.asset.dimensions[0],
      height: node.asset.dimensions[1],
      depth: node.asset.dimensions[2],
    },
    transform: { position: { x: 0, y: 0, z: 0 }, rotationDegrees: { x: 0, y: 0, z: 0 } },
  }
}
const extent = (item: SceneContextObject, axis: number) => {
  const values = stageVisibleFootprints(item)
    .flat()
    .map((point) => point[axis]!)
  return [Math.min(...values), Math.max(...values)]
}
const gap = (a: SceneContextObject, b: SceneContextObject) =>
  Math.min(
    ...stageVisibleFootprints(a).flatMap((left) =>
      stageVisibleFootprints(b).map((right) => stageFootprintGap(left, right).meters),
    ),
  )
function connect(moving: SceneContextObject, target: SceneContextObject) {
  const x = extent(target, 0)[1]! - extent(moving, 0)[0]! + 0.06
  const result = snapStageObject({ x, y: 1, z: 0 }, moving, context([target]), options)
  const placed = { ...moving, transform: { ...moving.transform, position: result.position } }
  expect(result.labels).toContain(`贴合 ${target.name}`)
  expect(gap(placed, target)).toBeLessThan(1e-10)
  expect(result.position.y + stageModelBottom(placed)!).toBe(0)
  return placed
}

test('A/C: actual flat, door and window GLBs join without a clearance offset', () => {
  const target = add('SCN-FLAT-090')
  for (const id of ['SCN-FLAT-090', 'SCN-DOOR-130', 'SCN-WIN-130']) {
    const moving = add(id)
    const placed = connect(moving, target)
    expect(extent(placed, 0)[0]).toBeCloseTo(extent(target, 0)[1]!, 10)
    expect(canStageStack(moving)).toBe(false)
  }
})

test('B: a rotated actual flat makes a 90 degree surface junction', () => {
  const target = add('SCN-FLAT-090'),
    moving = add('SCN-FLAT-090')
  moving.transform.rotationDegrees.y = 90
  const placed = connect(moving, target)
  expect(placed.transform.rotationDegrees).toEqual({ x: 0, y: 90, z: 0 })
})

test('D: bi-flat accepts exact manifest angles 0/45/90/135/180 without changing whole XYZ', () => {
  const item = add('SCN-FOLD-02')
  const original = useScene.getState().nodes[item.id as ItemNode['id']] as ItemNode
  for (const angle of [0, 45, 90, 135, 180]) {
    setFoldAngle(item.id, 0, angle)
    const after = useScene.getState().nodes[original.id] as ItemNode
    expect(after.controls!.fold_angle_1_deg).toBe(angle)
    expect([after.position, after.rotation, after.scale]).toEqual([
      original.position,
      original.rotation,
      original.scale,
    ])
  }
})

test('E/F/G: independent tri-flat joints invalidate bounds and real snap geometry after articulation', () => {
  const item = add('SCN-FOLD-03'),
    target = add('SCN-FLAT-090')
  const before = stageVisibleFootprints(item)
  const original = useScene.getState().nodes[item.id as ItemNode['id']] as ItemNode
  setFoldAngle(item.id, 0, 135)
  setFoldAngle(item.id, 1, 45)
  const after = useScene.getState().nodes[original.id] as ItemNode
  expect(after.controls).toEqual({ fold_angle_1_deg: 135, fold_angle_2_deg: 45 })
  expect(after.asset.dimensions).not.toEqual(original.asset.dimensions)
  expect(after.asset.boundsCenter).not.toEqual(original.asset.boundsCenter)
  // Reproduce the renderer's pose effect and revision invalidation with the actual GLB.
  applyItemFoldControls(sceneRegistry.nodes.get(item.id)!, after.controls)
  useViewer.getState().bumpGeometryRevision()
  expect(stageVisibleFootprints(item)).not.toEqual(before)
  connect(item, target)
})

test('grounding uses transformed GLB bottom including tilt, with no saved epsilon', () => {
  const item = add('SCN-FLAT-090')
  item.transform.rotationDegrees = { x: 20, y: 35, z: -10 }
  const result = snapStageObject({ x: 2, y: 5, z: 1 }, item, context([]), options)
  expect(result.position.y).toBe(-stageModelBottom(item)!)
})
