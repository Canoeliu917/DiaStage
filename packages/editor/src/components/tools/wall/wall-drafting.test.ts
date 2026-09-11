import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  type AnyNode,
  type AnyNodeId,
  BlockNode,
  DoorNode as DoorSchema,
  GROUND_SUPPORT_ID,
  getFloorPlacedElevation,
  nodeRegistry,
  registerNode,
  runAsSingleSceneHistoryStep,
  SlabNode,
  spatialGridManager,
  useScene,
  type WallNode,
  WallNode as WallSchema,
} from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import useEditor from '../../../store/use-editor'
import useInteractionScope from '../../../store/use-interaction-scope'
import {
  createWallOnCurrentLevel,
  resolveEndpointWallSplit,
  snapWallDraftPointDetailed,
} from './wall-drafting'
import type { WallPlanPoint } from './wall-snap-geometry'

// `updateNodes` batches its dirty-marking through requestAnimationFrame,
// which bun's test runtime doesn't provide.
if (typeof globalThis.requestAnimationFrame === 'undefined') {
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) =>
    setTimeout(() => callback(0), 0)) as unknown as typeof requestAnimationFrame
  globalThis.cancelAnimationFrame = ((id: number) =>
    clearTimeout(id)) as typeof cancelAnimationFrame
}

const LEVEL_ID = 'level_test' as AnyNodeId

function makeWall(start: WallPlanPoint, end: WallPlanPoint, id: string): WallNode {
  return {
    ...WallSchema.parse({ start, end, name: id }),
    id: id as WallNode['id'],
    parentId: LEVEL_ID,
  }
}

function seedLevel(walls: WallNode[], extraNodes: AnyNode[] = []) {
  useScene.setState({
    nodes: Object.fromEntries([
      [
        LEVEL_ID,
        {
          id: LEVEL_ID,
          type: 'level',
          object: 'node',
          parentId: null,
          visible: true,
          metadata: {},
          children: [...walls.map((wall) => wall.id), ...extraNodes.map((node) => node.id)],
          level: 0,
        } as AnyNode,
      ],
      ...walls.map((wall) => [wall.id, wall] as const),
      ...extraNodes.map((node) => [node.id, node] as const),
    ]),
    rootNodeIds: [LEVEL_ID],
    dirtyNodes: new Set(),
    collections: {},
  } as never)
}

function levelWalls(): WallNode[] {
  return Object.values(useScene.getState().nodes).filter(
    (node): node is WallNode => node?.type === 'wall',
  )
}

describe('createWallOnCurrentLevel', () => {
  // Set by tests that mutate the process-wide node registry; restored here
  // so the mutation can't leak into later test files (order-dependent flakes).
  let restoreRegistry: (() => void) | undefined

  afterEach(() => {
    restoreRegistry?.()
    restoreRegistry = undefined
  })

  beforeEach(() => {
    useViewer.setState({
      selection: {
        buildingId: 'building_test',
        levelId: LEVEL_ID,
        zoneId: null,
        selectedIds: [],
      },
    } as never)
    // 'lines' keeps the generous commit-time join radius; the other modes
    // still resolve + split within the tight connect radius (covered by the
    // grid-mode cases below). A reshaping-endpoint scope resolves to the
    // 'wall' context without needing the node registry (which isn't loaded in
    // this package's tests).
    useEditor.getState().setSnappingMode('wall', 'lines')
    useInteractionScope
      .getState()
      .begin({ kind: 'reshaping', nodeId: 'wall_a', reshape: 'endpoint', driver: 'tool' })
    seedLevel([makeWall([0, 0], [4, 0], 'wall_a')])
    useScene.temporal.getState().clear()
    useScene.temporal.getState().resume()
  })

  test('endpoint near an existing corner attaches to the corner instead of splitting', () => {
    const created = createWallOnCurrentLevel([2, 2], [3.99, 0])

    expect(created?.end).toEqual([4, 0])
    const hostWall = useScene.getState().nodes['wall_a' as AnyNodeId] as WallNode | undefined
    expect(hostWall?.start).toEqual([0, 0])
    expect(hostWall?.end).toEqual([4, 0])
    expect(levelWalls()).toHaveLength(2)
  })

  test('pins an existing construction source before a generated room slab can lift it', () => {
    // The reset + throwaway `block` registration is scoped to this test —
    // the registry is a process-wide singleton, so leaking it would leave
    // later test FILES with a stripped registry (order-dependent flakes).
    restoreRegistry = nodeRegistry._snapshot()
    nodeRegistry._reset()
    spatialGridManager.clear()
    registerNode({
      kind: 'block',
      schemaVersion: 2,
      schema: BlockNode,
      category: 'structure',
      defaults: () => BlockNode.parse({ name: 'Block' }),
      capabilities: {
        floorPlaced: {
          footprint: () => ({ dimensions: [4, 2.4, 4], rotation: [0, 0, 0] }),
        },
      },
    } as never)

    const slope = BlockNode.parse({
      name: 'Existing slope',
      parentId: LEVEL_ID,
      position: [0, 0, 0],
    })
    seedLevel([makeWall([0, 0], [4, 0], 'wall_a')], [slope as AnyNode])

    createWallOnCurrentLevel([0, 1], [1, 1], {
      constructionElevation: 2.4,
      constructionHeight: 2.5,
      constructionSourceNodeId: slope.id,
      flatConstructionBase: true,
      supportCap: 2.4,
    })

    const pinnedSlope = useScene.getState().nodes[slope.id] as BlockNode
    expect(pinnedSlope.supportSlabId).toBe(GROUND_SUPPORT_ID)

    const generatedSlab = SlabNode.parse({
      polygon: [
        [-2, -2],
        [2, -2],
        [2, 2],
        [-2, 2],
      ],
      elevation: 2.45,
      autoFromWalls: true,
      parentId: LEVEL_ID,
    })
    spatialGridManager.handleNodeCreated(generatedSlab as AnyNode, LEVEL_ID)

    expect(
      getFloorPlacedElevation({
        node: pinnedSlope,
        nodes: {
          ...useScene.getState().nodes,
          [generatedSlab.id]: generatedSlab as AnyNode,
        },
        position: pinnedSlope.position,
        rotation: [0, pinnedSlope.rotation, 0],
      }),
    ).toBe(0)
  })

  test('a flat-ground draft commits plane-bound', () => {
    // Pointing at bare ground freezes a GROUND construction plane at 0. With
    // The ground plane remains the explicit support while height and offset
    // stay derived.
    const created = createWallOnCurrentLevel([2, 2], [3, 2], {
      supportCap: 0,
      preferredSupportSlabId: GROUND_SUPPORT_ID,
      constructionElevation: 0,
      constructionHeight: 2.5,
    })

    expect(created).not.toBeNull()
    expect(created?.height).toBeUndefined()
    expect(created?.supportOffset).toBeUndefined()
    expect(created?.supportSlabId).toBe(GROUND_SUPPORT_ID)
  })

  test('a wall started on a slab stays plane-bound (no stamped height or offset)', () => {
    const slab = SlabNode.parse({
      id: 'slab_floor',
      parentId: LEVEL_ID,
      polygon: [
        [-1, -1],
        [5, -1],
        [5, 5],
        [-1, 5],
      ],
      elevation: 0.05,
      thickness: 0.05,
    })
    seedLevel([makeWall([0, 0], [4, 0], 'wall_a')], [slab])

    // Mirrors the 3D tool's first click on the slab top: frozen plane at the
    // slab elevation, ghost drawn at the level height. None of it may reach
    // the committed node — plane-bound is the default.
    const created = createWallOnCurrentLevel([2, 2], [3, 2], {
      supportCap: 0.05,
      preferredSupportSlabId: slab.id,
      constructionElevation: 0.05,
      constructionHeight: 2.55,
    })

    expect(created).not.toBeNull()
    expect(created?.height).toBeUndefined()
    expect(created?.supportOffset).toBeUndefined()
    expect(created?.supportSlabId).not.toBe(GROUND_SUPPORT_ID)
  })

  test('a fresh-scene wall started on a slab node-top elects that slab plane-bound', () => {
    const slab = SlabNode.parse({
      id: 'slab_fresh_floor',
      parentId: LEVEL_ID,
      polygon: [
        [-1, -1],
        [5, -1],
        [5, 5],
        [-1, 5],
      ],
      elevation: 0.05,
      thickness: 0.05,
    })
    seedLevel([], [slab])
    spatialGridManager.clear()
    spatialGridManager.handleNodeCreated(slab as AnyNode, LEVEL_ID)

    const created = createWallOnCurrentLevel([2, 2], [3, 2], {
      supportCap: 0.05,
      preferredSupportSlabId: null,
      constructionElevation: 0.05,
      constructionHeight: 2.5,
      constructionSourceNodeId: slab.id,
      flatConstructionBase: true,
    })

    expect(created).not.toBeNull()
    expect(created?.supportSlabId).toBeUndefined()
    expect(created?.height).toBeUndefined()
    expect(created?.supportOffset).toBeUndefined()
    const support = spatialGridManager.getSlabSupportForWall(
      LEVEL_ID,
      created!.start,
      created!.end,
      created!.curveOffset,
      created!.thickness,
      created!.supportSlabId,
    )
    expect(support.electedSlabId).toBe(slab.id)
    expect(support.elevation).toBeCloseTo(0.05)
  })

  test('a direct slab source does not pin a cross-slab wall away from the higher majority support', () => {
    const sourceSlab = SlabNode.parse({
      id: 'slab_source_low',
      parentId: LEVEL_ID,
      polygon: [
        [-0.1, -1],
        [0.1, -1],
        [0.1, 1],
        [-0.1, 1],
      ],
      elevation: 0.1,
      thickness: 0.05,
    })
    const majoritySlab = SlabNode.parse({
      id: 'slab_majority_high',
      parentId: LEVEL_ID,
      polygon: [
        [0.1, -1],
        [4.1, -1],
        [4.1, 1],
        [0.1, 1],
      ],
      elevation: 0.6,
      thickness: 0.1,
    })
    seedLevel([], [sourceSlab, majoritySlab])
    spatialGridManager.clear()
    spatialGridManager.handleNodeCreated(sourceSlab as AnyNode, LEVEL_ID)
    spatialGridManager.handleNodeCreated(majoritySlab as AnyNode, LEVEL_ID)

    const created = createWallOnCurrentLevel([0, 0], [4, 0], {
      supportCap: 0.6,
      preferredSupportSlabId: null,
      constructionElevation: 0.1,
      constructionHeight: 2.5,
      constructionSourceNodeId: sourceSlab.id,
      flatConstructionBase: true,
    })

    expect(created?.supportSlabId).toBe(majoritySlab.id)
    expect(created?.height).toBeUndefined()
    expect(created?.supportOffset).toBeUndefined()
  })

  test('a grazing direct slab source does not override the commit elevation cap', () => {
    const sourceSlab = SlabNode.parse({
      id: 'slab_source_high',
      parentId: LEVEL_ID,
      polygon: [
        [-0.1, -1],
        [0.1, -1],
        [0.1, 1],
        [-0.1, 1],
      ],
      elevation: 0.6,
      thickness: 0.1,
    })
    const cappedSlab = SlabNode.parse({
      id: 'slab_capped_low',
      parentId: LEVEL_ID,
      polygon: [
        [-0.1, -1],
        [4.1, -1],
        [4.1, 1],
        [-0.1, 1],
      ],
      elevation: 0.1,
      thickness: 0.05,
    })
    seedLevel([], [sourceSlab, cappedSlab])
    spatialGridManager.clear()
    spatialGridManager.handleNodeCreated(sourceSlab as AnyNode, LEVEL_ID)
    spatialGridManager.handleNodeCreated(cappedSlab as AnyNode, LEVEL_ID)

    const created = createWallOnCurrentLevel([0, 0], [4, 0], {
      supportCap: 0.1,
      preferredSupportSlabId: null,
      constructionElevation: 0.6,
      constructionHeight: 2.5,
      constructionSourceNodeId: sourceSlab.id,
      flatConstructionBase: true,
    })

    expect(created?.supportSlabId).toBe(cappedSlab.id)
    expect(created?.height).toBeUndefined()
    expect(created?.supportOffset).toBeUndefined()
  })

  test('a non-ground draft never freezes the ghost height, even at a raised plane', () => {
    const created = createWallOnCurrentLevel([2, 2], [3, 2], {
      supportCap: 1.2,
      preferredSupportSlabId: null,
      constructionElevation: 1.2,
      constructionHeight: 2.5,
    })

    expect(created).not.toBeNull()
    expect(created?.height).toBeUndefined()
    expect(created?.supportOffset).toBeUndefined()
  })

  test('endpoint near the host start corner snaps there without splitting', () => {
    const created = createWallOnCurrentLevel([2, 2], [0.015, 0])

    expect(created?.end).toEqual([0, 0])
    expect(useScene.getState().nodes['wall_a' as AnyNodeId]).toBeDefined()
    expect(levelWalls()).toHaveLength(2)
  })

  test('genuine mid-wall endpoint still splits the host (T junction)', () => {
    const created = createWallOnCurrentLevel([2, 2], [2, 0])

    expect(created?.end).toEqual([2, 0])
    expect(useScene.getState().nodes['wall_a' as AnyNodeId]).toBeUndefined()
    const walls = levelWalls()
    expect(walls).toHaveLength(3)
    expect(
      walls.some((wall) => wall.start[0] === 0 && wall.end[0] === 2 && wall.end[1] === 0),
    ).toBe(true)
    expect(
      walls.some((wall) => wall.start[0] === 2 && wall.start[1] === 0 && wall.end[0] === 4),
    ).toBe(true)
  })

  test('exact duplicate segment is rejected', () => {
    expect(createWallOnCurrentLevel([0, 0], [4, 0])).toBeNull()
    expect(levelWalls()).toHaveLength(1)
  })

  test('grid mode: endpoint resolved onto a wall body still splits the host', () => {
    useEditor.getState().setSnappingMode('wall', 'grid')

    const created = createWallOnCurrentLevel([2, 2], [2, 0])

    expect(created?.end).toEqual([2, 0])
    expect(useScene.getState().nodes['wall_a' as AnyNodeId]).toBeUndefined()
    expect(levelWalls()).toHaveLength(3)
  })

  test('grid mode: endpoint beyond the connect radius is left alone (no residual snap)', () => {
    useEditor.getState().setSnappingMode('wall', 'grid')

    const created = createWallOnCurrentLevel([2, 2], [2, 0.2])

    expect(created?.end).toEqual([2, 0.2])
    expect(useScene.getState().nodes['wall_a' as AnyNodeId]).toBeDefined()
    expect(levelWalls()).toHaveLength(2)
  })

  test('mid-span split migrates the host attachments to the covering half', () => {
    const door = DoorSchema.parse({
      position: [1, 1.05, 0],
      parentId: 'wall_a',
      wallId: 'wall_a',
    })
    seedLevel([{ ...makeWall([0, 0], [4, 0], 'wall_a'), children: [door.id] }], [door as AnyNode])

    const created = createWallOnCurrentLevel([2, 2], [2, 0])

    expect(created?.end).toEqual([2, 0])
    const walls = levelWalls()
    const firstHalf = walls.find((wall) => wall.start[0] === 0 && wall.end[0] === 2)
    expect(firstHalf).toBeDefined()
    const migratedDoor = useScene.getState().nodes[door.id as AnyNodeId]
    expect(migratedDoor?.parentId).toBe(firstHalf?.id)
    expect(firstHalf?.children).toContain(door.id)
  })

  test('a splitting commit lands as a single undo step', () => {
    const before = useScene.temporal.getState().pastStates.length

    const created = createWallOnCurrentLevel([2, 2], [2, 0])

    expect(created).not.toBeNull()
    expect(useScene.temporal.getState().pastStates.length - before).toBe(1)
  })

  test('a crossing splits both the host and the inserted wall in one undo step', () => {
    const before = useScene.temporal.getState().pastStates.length

    const created = createWallOnCurrentLevel([2, -2], [2, 2])

    expect(created?.start).toEqual([2, 0])
    expect(created?.end).toEqual([2, 2])
    expect(useScene.getState().nodes['wall_a' as AnyNodeId]).toBeUndefined()
    expect(levelWalls()).toHaveLength(4)
    expect(useScene.temporal.getState().pastStates.length - before).toBe(1)
  })

  test('close crossings reject the whole insertion without mutating the scene', () => {
    seedLevel([
      makeWall([2, -2], [2, 2], 'wall_close_a'),
      makeWall([2.0055, -2], [2.0055, 2], 'wall_close_b'),
    ])
    useScene.temporal.getState().clear()
    const beforeNodes = useScene.getState().nodes

    const created = createWallOnCurrentLevel([0, 0], [4, 0])

    expect(created).toBeNull()
    expect(useScene.getState().nodes).toBe(beforeNodes)
    expect(levelWalls()).toHaveLength(2)
    expect(useScene.temporal.getState().pastStates).toHaveLength(0)
  })
})

describe('resolveEndpointWallSplit', () => {
  beforeEach(() => {
    seedLevel([makeWall([0, 0], [4, 0], 'wall_host'), makeWall([2, 2], [2, 1], 'wall_moved')])
    useScene.temporal.getState().clear()
    useScene.temporal.getState().resume()
  })

  test('endpoint dropped mid-span splits the host and returns the projection', () => {
    const resolved = resolveEndpointWallSplit({
      point: [2, 0.02],
      levelId: LEVEL_ID,
      ignoreWallIds: ['wall_moved'],
    })

    expect(resolved).toEqual([2, 0])
    expect(useScene.getState().nodes['wall_host' as AnyNodeId]).toBeUndefined()
    const walls = levelWalls()
    expect(walls).toHaveLength(3)
    expect(
      walls.some((wall) => wall.start[0] === 0 && wall.end[0] === 2 && wall.end[1] === 0),
    ).toBe(true)
    expect(
      walls.some((wall) => wall.start[0] === 2 && wall.start[1] === 0 && wall.end[0] === 4),
    ).toBe(true)
  })

  test('mid-span split migrates host attachments to the covering half', () => {
    const door = DoorSchema.parse({
      position: [1, 1.05, 0],
      parentId: 'wall_host',
      wallId: 'wall_host',
    })
    seedLevel(
      [
        { ...makeWall([0, 0], [4, 0], 'wall_host'), children: [door.id] },
        makeWall([2, 2], [2, 1], 'wall_moved'),
      ],
      [door as AnyNode],
    )

    const resolved = resolveEndpointWallSplit({
      point: [2, 0],
      levelId: LEVEL_ID,
      ignoreWallIds: ['wall_moved'],
    })

    expect(resolved).toEqual([2, 0])
    const firstHalf = levelWalls().find((wall) => wall.start[0] === 0 && wall.end[0] === 2)
    expect(firstHalf).toBeDefined()
    const migratedDoor = useScene.getState().nodes[door.id as AnyNodeId]
    expect(migratedDoor?.parentId).toBe(firstHalf?.id)
    expect(firstHalf?.children).toContain(door.id)
  })

  test('a drop near an existing corner resolves to the corner without splitting', () => {
    const resolved = resolveEndpointWallSplit({
      point: [3.99, 0],
      levelId: LEVEL_ID,
      ignoreWallIds: ['wall_moved'],
    })

    expect(resolved).toEqual([4, 0])
    expect(useScene.getState().nodes['wall_host' as AnyNodeId]).toBeDefined()
    expect(levelWalls()).toHaveLength(2)
  })

  test('an opening straddling the drop point skips the split but still resolves the point', () => {
    const door = DoorSchema.parse({
      position: [2, 1.05, 0],
      parentId: 'wall_host',
      wallId: 'wall_host',
    })
    seedLevel(
      [
        { ...makeWall([0, 0], [4, 0], 'wall_host'), children: [door.id] },
        makeWall([2, 2], [2, 1], 'wall_moved'),
      ],
      [door as AnyNode],
    )

    const resolved = resolveEndpointWallSplit({
      point: [2, 0.02],
      levelId: LEVEL_ID,
      ignoreWallIds: ['wall_moved'],
    })

    expect(resolved).toEqual([2, 0])
    expect(useScene.getState().nodes['wall_host' as AnyNodeId]).toBeDefined()
    expect(levelWalls()).toHaveLength(2)
  })

  test('a drop beyond the connect radius resolves nothing and splits nothing', () => {
    const resolved = resolveEndpointWallSplit({
      point: [2, 0.2],
      levelId: LEVEL_ID,
      ignoreWallIds: ['wall_moved'],
    })

    expect(resolved).toBeNull()
    expect(levelWalls()).toHaveLength(2)
  })

  test('ignored walls (the moved wall and its commit siblings) are never split', () => {
    const resolved = resolveEndpointWallSplit({
      point: [2, 0],
      levelId: LEVEL_ID,
      ignoreWallIds: ['wall_moved', 'wall_host'],
    })

    expect(resolved).toBeNull()
    expect(levelWalls()).toHaveLength(2)
  })

  test('split + endpoint write compose into a single history step', () => {
    const before = useScene.temporal.getState().pastStates.length

    runAsSingleSceneHistoryStep(useScene, () => {
      const resolved = resolveEndpointWallSplit({
        point: [2, 0],
        levelId: LEVEL_ID,
        ignoreWallIds: ['wall_moved'],
      })
      useScene
        .getState()
        .updateNodes([{ id: 'wall_moved' as AnyNodeId, data: { end: resolved ?? [2, 0] } }])
    })

    expect(useScene.temporal.getState().pastStates.length - before).toBe(1)
    expect(levelWalls()).toHaveLength(3)
    const moved = useScene.getState().nodes['wall_moved' as AnyNodeId] as WallNode
    expect(moved.end).toEqual([2, 0])
  })
})

describe('snapWallDraftPointDetailed', () => {
  test('bypassSnap returns the raw point without endpoint or angle snap', () => {
    const wall = makeWall([0, 0], [4, 0], 'wall_a')
    const result = snapWallDraftPointDetailed({
      point: [3.99, 0.03],
      walls: [wall],
      start: [2, 2],
      angleSnap: true,
      bypassSnap: true,
    })

    expect(result.point).toEqual([3.99, 0.03])
    expect(result.snap).toBeNull()
    expect(result.targetWallIds).toEqual([])
  })

  // Endpoint-move regression: walls attached to the moving corner keep their
  // pre-drag coordinates in the scene during the drag, so their stale corner
  // recreates the old junction inside the connect radius. The move tools must
  // pass those walls in `ignoreWallIds` (attached mode) or a sub-5cm corner
  // correction — e.g. squaring a scan-imported 91° junction — can never land.
  test('a stale linked-wall corner swallows a sub-connect-radius correction unless ignored', () => {
    // `wall_d` shares the dragged corner of `wall_c` at [2, 0.03]; the user
    // drops 3cm away at [2, 0] to square the junction.
    const linked = makeWall([2, 0.03], [2, 2], 'wall_d')

    const captured = snapWallDraftPointDetailed({
      point: [2, 0],
      walls: [linked],
      ignoreWallIds: ['wall_c'],
      magnetic: false,
      step: 0,
    })
    expect(captured.point).toEqual([2, 0.03])
    expect(captured.snap).toBe('endpoint')
    expect(captured.targetWallIds).toEqual(['wall_d'])

    const freed = snapWallDraftPointDetailed({
      point: [2, 0],
      walls: [linked],
      ignoreWallIds: ['wall_c', 'wall_d'],
      magnetic: false,
      step: 0,
    })
    expect(freed.point).toEqual([2, 0])
    expect(freed.snap).toBeNull()
  })
})
