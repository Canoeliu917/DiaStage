import { afterEach, beforeEach, expect, test } from 'bun:test'
import {
  clearSceneHistory,
  type GridEvent,
  type ItemEvent,
  ItemNode,
  type NodeEvent,
  type ShelfEvent,
  sceneRegistry,
  useScene,
} from '@pascal-app/core'
import { useDraftNode } from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import { renderToString } from 'react-dom/server'
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Vector3 } from 'three'
import { getGridAlignedDimensions } from '../../../../packages/editor/src/components/tools/item/placement-math'
import {
  checkCanPlace,
  faceHostStrategy,
  floorStrategy,
  itemSurfaceStrategy,
  shelfSurfaceStrategy,
} from '../../../../packages/editor/src/components/tools/item/placement-strategies'
import { createTheatreSceneGraph } from '../theatre/new-production'
import { connectStageCommandExecutor } from './command-executor'
import { currentStageContext } from './context'
import { installNativeStagePlacement, nativeStagePlacementFeedback } from './native-placement'

globalThis.requestAnimationFrame ??= () => 0
globalThis.cancelAnimationFrame ??= () => {}
let cleanup: () => void
beforeEach(() => {
  const graph = createTheatreSceneGraph()
  useScene.getState().setReadOnly(false)
  useScene.getState().setScene(graph.nodes, graph.rootNodeIds, graph)
  const level = Object.values(graph.nodes).find((node) => node.type === 'level')!
  useViewer.getState().setSelection({ levelId: level.id as `level_${string}` })
  const policy = installNativeStagePlacement(() => null)
  const executor = connectStageCommandExecutor()
  cleanup = () => {
    policy()
    executor()
  }
})
afterEach(() => {
  cleanup()
  useScene.temporal.getState().resume()
  useScene.getState().unloadScene()
  clearSceneHistory()
})

test('native item drag uses visible mesh contact, permits every contact drop, and commits one undo', () => {
  const levelId = useViewer.getState().selection.levelId!
  const asset = {
    id: 'contact-table',
    name: '接触测试桌',
    category: 'props',
    thumbnail: '/test.png',
    src: '/test.glb',
    dimensions: [1.6, 1.3, 1.3] as [number, number, number],
  }
  const table = ItemNode.parse({ asset, parentId: levelId, metadata: { stageKind: 'table' } })
  const probe = ItemNode.parse({
    asset: { ...asset, id: 'contact-probe', name: '凳子', dimensions: [0.1, 0.1, 0.1] },
    parentId: levelId,
    position: [1.2, 0.3, 0.5],
  })
  useScene.getState().createNode(table, levelId)
  useScene.getState().createNode(probe, levelId)
  const root = new Group()
  root.userData.itemModelSettled = true
  const material = new MeshBasicMaterial()
  root.add(new Mesh(new BoxGeometry(1.6, 0.1, 1.3).translate(0, 1.25, 0), material))
  for (const x of [-0.7, 0.7])
    for (const z of [-0.5, 0.5])
      root.add(new Mesh(new BoxGeometry(0.1, 1.2, 0.1).translate(x, 0.6, z), material))
  sceneRegistry.nodes.set(table.id, root)
  let draft!: ReturnType<typeof useDraftNode>
  function Harness() {
    draft = useDraftNode()
    return null
  }
  renderToString(<Harness />)
  clearSceneHistory()
  const before = JSON.stringify(useScene.getState().nodes)
  useScene.temporal.getState().pause()
  draft.adopt(useScene.getState().nodes[probe.id] as ItemNode)
  try {
    expect(currentStageContext().objects.some((item) => item.id === probe.id)).toBe(false)
    expect(currentStageContext([], true).objects.some((item) => item.id === probe.id)).toBe(true)
    expect(getGridAlignedDimensions([0.1, 0.1, 0.1], undefined, 0.5)).toEqual([0.1, 0.1, 0.1])
    const validators = {
      canPlaceOnFloor: () => ({ valid: false }),
      canPlaceOnWall: () => ({ valid: false }),
    }
    const freeFloorContext = {
      asset: probe.asset,
      levelId,
      draftItem: draft.current,
      gridPosition: new Vector3(...probe.position),
      state: { surface: 'floor' as const, wallId: null, surfaceItemId: null, shelfId: null },
      currentCursorRotationY: 0,
    }
    expect(faceHostStrategy.enter(freeFloorContext, {} as NodeEvent)).toBeNull()
    expect(itemSurfaceStrategy.enter(freeFloorContext, {} as ItemEvent)).toBeNull()
    expect(shelfSurfaceStrategy.enter(freeFloorContext, {} as ShelfEvent)).toBeNull()
    expect(draft.current?.parentId).toBe(levelId)
    expect(draft.current?.position[1]).toBe(0.3)
    expect(
      nativeStagePlacementFeedback({ ...draft.current!, blockFaceId: 'legacy-face' }),
    ).toBeNull()
    for (const [x, z, contact] of [
      [0, 0, false],
      [0.801, 0.5, false],
      [0.8, 0.5, true],
      [0.7, 0.5, true],
    ] as const) {
      const gridPosition = new Vector3(x, 0.3, z)
      const ctx = {
        asset: probe.asset,
        levelId,
        draftItem: draft.current,
        gridPosition,
        state: { surface: 'floor' as const, wallId: null, surfaceItemId: null, shelfId: null },
        currentCursorRotationY: 0,
      }
      const feedback = nativeStagePlacementFeedback({ ...draft.current!, position: [x, 0.3, z] })
      expect(feedback).toEqual({ valid: true, contact })
      expect(checkCanPlace(ctx, validators)).toBe(true)
      expect(floorStrategy.click(ctx, {} as GridEvent, validators)?.nodeUpdate.position).toEqual([
        x,
        0.3,
        z,
      ])
    }
    expect(
      nativeStagePlacementFeedback({ ...draft.current!, position: [100, 0.3, 0] })?.valid,
    ).toBe(false)
    const finalPosition: [number, number, number] = [0.7, 0.3, 0.5]
    expect(draft.commit({ position: finalPosition })).toBe(probe.id)
    expect((useScene.getState().nodes[probe.id] as ItemNode).position).toEqual(finalPosition)
    expect(useScene.temporal.getState().pastStates).toHaveLength(1)
    useScene.temporal.getState().resume()
    useScene.temporal.getState().undo()
    expect(JSON.stringify(useScene.getState().nodes)).toBe(before)
  } finally {
    sceneRegistry.nodes.delete(table.id)
    root.traverse((object) => {
      if (object instanceof Mesh) object.geometry.dispose()
    })
    material.dispose()
  }
})
