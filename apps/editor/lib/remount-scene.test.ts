import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  type AnyNode,
  type AnyNodeId,
  BlockNode,
  BuildingNode,
  clearSceneHistory,
  getFloorPlacedElevation,
  getScaledDimensions,
  ItemNode,
  LevelNode,
  nodeRegistry,
  type SceneCommit,
  SiteNode,
  SlabNode,
  spatialGridManager,
  subscribeSceneCommits,
  useLiveTransforms,
  useScene,
  WallNode,
} from '@pascal-app/core'
import { createStageFrame, rotatePoint, type Vec3 } from '@pascal-app/core/remount'
import {
  applyRemount,
  canUndoLastRemount,
  captureProductionLayout,
  getRemountCandidates,
  initializeRemount,
  isRemountPreviewCurrent,
  previewRemount,
  RemountMetadataSchema,
  reloadRemount,
  saveRemountConfig,
  undoLastRemount,
  updateRemountInput,
  useRemountDraft,
} from './remount-scene'

const SCENE = 'remount-test'
globalThis.requestAnimationFrame ??= () => 0
globalThis.cancelAnimationFrame ??= () => {}
let restoreRegistry = () => {}
let stop = () => {}

function item(index: number, parentId = 'level_test', overrides: Partial<ItemNode> = {}): ItemNode {
  return ItemNode.parse({
    id: `item_test_${index}`,
    parentId,
    position: [-3 + (index % 5) * 1.5, 0, -1 + Math.floor(index / 5) * 2],
    asset: {
      id: 'asset_test',
      name: `物件 ${index}`,
      category: 'stage',
      thumbnail: '',
      src: 'asset://test',
      dimensions: [0.5, 0.5, 0.5],
    },
    ...overrides,
  })
}

function fixture(
  objects: AnyNode[],
  buildingPose: { position: Vec3; rotation: Vec3 } = { position: [0, 0, 0], rotation: [0, 0, 0] },
) {
  const site = SiteNode.parse({ id: 'site_test', children: ['building_test'] })
  const building = BuildingNode.parse({
    id: 'building_test',
    parentId: site.id,
    children: ['level_test'],
    ...buildingPose,
  })
  const level = LevelNode.parse({
    id: 'level_test',
    parentId: building.id,
    height: 3,
    children: objects.filter((node) => node.parentId === 'level_test').map((node) => node.id),
  })
  useScene.setState({
    nodes: Object.fromEntries([site, building, level, ...objects].map((node) => [node.id, node])),
    rootNodeIds: [site.id],
    collections: {},
    materials: {},
    installedPlugins: [],
    dirtyNodes: new Set<AnyNodeId>(),
    readOnly: false,
  })
  clearSceneHistory()
  useRemountDraft.setState({ sceneKey: '' })
  initializeRemount(SCENE)
}

function position(id: string): Vec3 {
  const node = useScene.getState().nodes[id as AnyNodeId]
  if (node?.type !== 'item' && node?.type !== 'block') throw new Error('Missing movable node')
  return node.position
}

describe('remount scene boundary', () => {
  beforeEach(() => {
    restoreRegistry = nodeRegistry._snapshot()
    nodeRegistry._reset()
    nodeRegistry._register({
      kind: 'item',
      schemaVersion: 1,
      schema: ItemNode,
      category: 'furnish',
      defaults: () => ({}),
      capabilities: {
        floorPlaced: {
          footprint: (node) => ({
            dimensions: getScaledDimensions(node as ItemNode),
            rotation: (node as ItemNode).rotation,
          }),
        },
      },
    })
    spatialGridManager.clear()
    useLiveTransforms.getState().clearAll()
    fixture(Array.from({ length: 10 }, (_, index) => item(index)))
  })
  afterEach(() => {
    stop()
    stop = () => {}
    restoreRegistry()
    spatialGridManager.clear()
    useScene.getState().setReadOnly(false)
    useLiveTransforms.getState().clearAll()
  })

  test('preview is ephemeral; ten transforms plus metadata commit once and undo together', () => {
    const before = useScene.getState().nodes
    const commits: SceneCommit[] = []
    stop = subscribeSceneCommits((commit) => commits.push(commit))
    captureProductionLayout(
      SCENE,
      Array.from({ length: 10 }, (_, i) => `item_test_${i}`),
    )
    const plan = previewRemount(SCENE)
    expect(plan.placements).toHaveLength(10)
    expect(plan.conflicts).toHaveLength(0)
    expect(useScene.getState().nodes).toBe(before)
    expect(commits).toHaveLength(0)
    applyRemount(SCENE)
    expect(commits).toHaveLength(1)
    expect(commits[0]?.origin).toBe('local')
    expect(useScene.temporal.getState().pastStates).toHaveLength(1)
    for (let i = 0; i < 10; i += 1)
      expect(position(`item_test_${i}`)[0]).toBeCloseTo(item(i).position[0] + 10)
    expect(
      RemountMetadataSchema.safeParse(useScene.getState().nodes.site_test?.metadata.remount)
        .success,
    ).toBe(true)
    expect(canUndoLastRemount(SCENE)).toBe(true)
    expect(undoLastRemount(SCENE)).toBe(true)
    expect(useScene.getState().nodes).toEqual(before)
  })

  test('scene content mutations invalidate a preview and a foreign edit cannot be undone by remount', () => {
    captureProductionLayout(SCENE, ['item_test_0'])
    previewRemount(SCENE)
    useScene.getState().updateNode('item_test_9', { name: 'changed obstacle' })
    const before = useScene.getState().nodes
    expect(() => applyRemount(SCENE)).toThrow('预览已过期')
    expect(useScene.getState().nodes).toBe(before)
    previewRemount(SCENE)
    applyRemount(SCENE)
    useScene.getState().updateNode('item_test_9', { name: 'later operation' })
    expect(canUndoLastRemount(SCENE)).toBe(false)
    expect(undoLastRemount(SCENE)).toBe(false)
  })

  test('saving only a level camera keeps the preview current and Apply preserves the camera', () => {
    captureProductionLayout(SCENE, ['item_test_0'])
    previewRemount(SCENE)
    expect(isRemountPreviewCurrent(SCENE)).toBe(true)
    const camera = { position: [20, 15, 20], target: [10, 0, 0], mode: 'perspective' } as const
    useScene.getState().updateNode('level_test', {
      camera: { position: [...camera.position], target: [...camera.target], mode: camera.mode },
    })
    expect(useScene.getState().nodes).not.toBe(useRemountDraft.getState().previewNodes)
    expect(isRemountPreviewCurrent(SCENE)).toBe(true)
    applyRemount(SCENE)
    expect(position('item_test_0')[0]).toBe(7)
    expect(useScene.getState().nodes.level_test?.camera).toEqual(camera)
  })

  test('position, level metadata and scene material changes still invalidate the preview', () => {
    captureProductionLayout(SCENE, ['item_test_0'])
    previewRemount(SCENE)
    useScene.getState().updateNode('item_test_9', { position: [2, 0, 2] })
    expect(isRemountPreviewCurrent(SCENE)).toBe(false)
    expect(() => applyRemount(SCENE)).toThrow('预览已过期')
    previewRemount(SCENE)
    useScene.getState().updateNode('level_test', { metadata: { changed: true } })
    expect(isRemountPreviewCurrent(SCENE)).toBe(false)
    expect(() => applyRemount(SCENE)).toThrow('预览已过期')
    previewRemount(SCENE)
    useScene.setState({ materials: { ...useScene.getState().materials } })
    expect(isRemountPreviewCurrent(SCENE)).toBe(false)
    expect(() => applyRemount(SCENE)).toThrow('预览已过期')
  })

  test('input edits clear preview; malformed numbers are rejected before mutation', () => {
    captureProductionLayout(SCENE, ['item_test_0'])
    previewRemount(SCENE)
    updateRemountInput(SCENE, { tolerance: 0.04 })
    expect(useRemountDraft.getState().plan).toBeNull()
    const draft = useRemountDraft.getState()
    expect(() => updateRemountInput(SCENE, { clearance: Number.NaN })).toThrow()
    expect(useRemountDraft.getState()).toBe(draft)
    expect(() =>
      updateRemountInput(SCENE, {
        targetVenue: { ...draft.targetVenue, bounds: { width: Infinity, depth: 5, height: 4 } },
      }),
    ).toThrow()
  })

  test('read-only, playback and live edit locks protect every scene write', () => {
    captureProductionLayout(SCENE, ['item_test_0'])
    previewRemount(SCENE)
    const before = useScene.getState().nodes
    useScene.getState().setReadOnly(true)
    expect(() => applyRemount(SCENE)).toThrow('只读')
    expect(() => saveRemountConfig(SCENE)).toThrow('只读')
    useScene.getState().setReadOnly(false)
    expect(() => applyRemount(SCENE, true)).toThrow('播放')
    useLiveTransforms.getState().set('item_test_1', { position: [0, 0, 0], rotation: 0 })
    expect(() => applyRemount(SCENE)).toThrow('结束当前')
    expect(useScene.getState().nodes).toBe(before)
  })

  test('parent and child are included once, share assembly and never inherit parent mesh scale', () => {
    const parent = item(0, 'level_test', {
      position: [0, 0, 0],
      scale: [2, 2, 2],
      children: ['item_test_1'],
    })
    const child = item(1, parent.id, { position: [0, 1, 0] })
    fixture([parent, child])
    captureProductionLayout(SCENE, [parent.id, child.id])
    const draft = useRemountDraft.getState()
    const target = {
      ...draft.targetVenue,
      anchors: draft.targetVenue.anchors.map((anchor) => ({
        ...anchor,
        position: rotatePoint(anchor.position, [0, Math.PI / 2, 0]),
      })) as typeof draft.targetVenue.anchors,
    }
    target.frame = createStageFrame(target.anchors)
    updateRemountInput(SCENE, { targetVenue: target })
    const plan = previewRemount(SCENE)
    expect(plan.placements).toHaveLength(2)
    expect(plan.placements[0]?.assemblyId).toBe(plan.placements[1]?.assemblyId)
    expect(plan.placements.find((entry) => entry.nodeId === child.id)?.sourcePosition[1]).toBe(1)
    applyRemount(SCENE)
    expect(position(child.id)).toEqual([0, 1, 0])
    expect((useScene.getState().nodes[parent.id] as ItemNode).scale).toEqual([2, 2, 2])
  })

  test('world snapshots include building rotation, stacked level height and slab support; Apply preserves visual height', () => {
    const object = item(0, 'level_upper', { position: [0, 0.25, 0], supportSlabId: 'slab_support' })
    const upper = LevelNode.parse({
      id: 'level_upper',
      parentId: 'building_test',
      level: 1,
      baseElevation: 0.5,
      height: 3,
      children: [object.id, 'slab_support'],
    })
    const slab = SlabNode.parse({
      id: 'slab_support',
      parentId: upper.id,
      polygon: [
        [-2, -2],
        [2, -2],
        [2, 2],
        [-2, 2],
      ],
      elevation: 0.6,
      autoFromWalls: false,
    })
    fixture([upper, object, slab], { position: [2, 1, -1], rotation: [0, Math.PI / 2, 0] })
    spatialGridManager.handleNodeCreated(slab, upper.id)
    useScene.getState().updateNode('building_test', { children: ['level_test', upper.id] })
    clearSceneHistory()
    const draft = useRemountDraft.getState()
    updateRemountInput(SCENE, {
      targetVenue: { ...draft.targetVenue, bounds: { width: 30, depth: 30, height: 20 } },
    })
    captureProductionLayout(SCENE, [object.id])
    const plan = previewRemount(SCENE)
    expect(plan.placements[0]?.sourcePosition[1]).toBeCloseTo(5.35)
    expect(plan.placements[0]?.sourcePosition[0]).toBeCloseTo(2)
    applyRemount(SCENE)
    const moved = useScene.getState().nodes[object.id] as ItemNode
    expect(moved.supportSlabId).toBe('ground')
    expect(
      moved.position[1] +
        getFloorPlacedElevation({
          node: moved,
          nodes: useScene.getState().nodes,
          position: moved.position,
        }),
    ).toBeCloseTo(0.85)
    expect(moved.position[2]).toBeCloseTo(10)
  })

  test('metadata JSON roundtrip and reload retain original source snapshots; repeated Apply does not accumulate', () => {
    captureProductionLayout(SCENE, ['item_test_0'])
    updateRemountInput(SCENE, {
      paths: [
        {
          id: 'walk',
          name: '走位',
          points: [
            [0, 0, 0],
            [1, 0, 0],
          ],
        },
      ],
      representations: { item_test_0: 'proxy' },
    })
    previewRemount(SCENE)
    applyRemount(SCENE)
    const firstPosition = [...position('item_test_0')]
    const state = useScene.getState()
    const graph = JSON.parse(
      JSON.stringify({ nodes: state.nodes, rootNodeIds: state.rootNodeIds }),
    ) as { nodes: typeof state.nodes; rootNodeIds: typeof state.rootNodeIds }
    useScene.getState().setScene(graph.nodes, graph.rootNodeIds)
    clearSceneHistory()
    useRemountDraft.setState({ sceneKey: '' })
    initializeRemount(SCENE)
    expect(useRemountDraft.getState().layout?.paths).toHaveLength(1)
    expect(useRemountDraft.getState().sourceSnapshots[0]?.representation).toBe('proxy')
    const secondPlan = previewRemount(SCENE)
    expect(secondPlan.paths[0]?.targetPoints[0]).toEqual([10, 0, 0])
    expect(secondPlan.placements[0]?.sourcePosition[0]).toBe(-3)
    applyRemount(SCENE)
    expect(position('item_test_0')).toEqual(firstPosition)
    expect(useScene.temporal.getState().pastStates).toHaveLength(0)
    expect(canUndoLastRemount(SCENE)).toBe(false)
  })

  test('unsupported hosts and non-finite geometry are reported as ineligible; scene switches invalidate access', () => {
    const hosted = item(0, 'level_test', { wallId: 'wall_host' })
    const invalidBlock = BlockNode.parse({ id: 'block_bad', parentId: 'level_test' })
    invalidBlock.position[0] = Number.NaN
    fixture([hosted, invalidBlock])
    expect(
      getRemountCandidates().every((candidate) => !candidate.eligible && candidate.reason),
    ).toBe(true)
    expect(() => captureProductionLayout(SCENE, [hosted.id])).toThrow('挂接')
    expect(() => saveRemountConfig('another-scene')).toThrow('场景已切换')
  })

  test('existing target walls and stage blocks become collision proxies and block Apply', () => {
    const wall = WallNode.parse({
      id: 'wall_target',
      parentId: 'level_test',
      start: [7, -2],
      end: [7, 0],
      thickness: 0.4,
      height: 3,
    })
    const targetBlock = BlockNode.parse({
      id: 'block_target',
      parentId: 'level_test',
      position: [8.5, 0, -1],
    })
    fixture([item(0), item(1), wall, targetBlock])
    captureProductionLayout(SCENE, ['item_test_0', 'item_test_1'])
    const plan = previewRemount(SCENE)
    expect(
      plan.conflicts.some(
        (conflict) => conflict.type === 'collision' && conflict.otherNodeId === wall.id,
      ),
    ).toBe(true)
    expect(
      plan.conflicts.some(
        (conflict) => conflict.type === 'collision' && conflict.otherNodeId === targetBlock.id,
      ),
    ).toBe(true)
    expect(() => applyRemount(SCENE)).toThrow('物理冲突')
    expect(useScene.temporal.getState().pastStates).toHaveLength(0)
  })

  test('a 180 degree block yaw survives the Euler representation without being mistaken for a tilt', () => {
    const block = BlockNode.parse({ id: 'block_test', parentId: 'level_test' })
    fixture([block])
    captureProductionLayout(SCENE, [block.id])
    const draft = useRemountDraft.getState()
    const anchors = draft.sourceVenue.anchors.map((anchor) => {
      const rotated = rotatePoint(anchor.position, [0, Math.PI, 0])
      return { ...anchor, position: [rotated[0] + 10, rotated[1], rotated[2]] }
    }) as typeof draft.targetVenue.anchors
    updateRemountInput(SCENE, {
      targetVenue: { ...draft.targetVenue, anchors, frame: createStageFrame(anchors) },
    })
    previewRemount(SCENE)
    applyRemount(SCENE)
    const moved = useScene.getState().nodes[block.id] as BlockNode
    expect(Math.abs(moved.rotation)).toBeCloseTo(Math.PI)
    expect(moved.topology).toEqual(block.topology)
    expect(moved.position[0]).toBeCloseTo(10)
  })

  test('remote metadata changes cannot be overwritten by an old draft; explicit reload adopts them', () => {
    captureProductionLayout(SCENE, ['item_test_0'])
    saveRemountConfig(SCENE)
    updateRemountInput(SCENE, { tolerance: 0.05 })
    previewRemount(SCENE)
    const site = useScene.getState().nodes.site_test!
    const remote = RemountMetadataSchema.parse(site.metadata.remount)
    remote.targetVenue.name = '远端更新的目标场地'
    remote.clearance = 0.4
    useScene.getState().updateNode(site.id, { metadata: { ...site.metadata, remount: remote } })
    const afterRemote = useScene.getState().nodes
    expect(() => initializeRemount(SCENE)).toThrow('重新载入')
    expect(useRemountDraft.getState().plan).toBeNull()
    expect(useRemountDraft.getState().tolerance).toBe(0.05)
    expect(() => applyRemount(SCENE)).toThrow('重新载入')
    expect(() => saveRemountConfig(SCENE)).toThrow('重新载入')
    expect(useScene.getState().nodes).toBe(afterRemote)
    reloadRemount(SCENE)
    expect(useRemountDraft.getState().targetVenue.name).toBe(remote.targetVenue.name)
    expect(useRemountDraft.getState().clearance).toBe(0.4)
    expect(useRemountDraft.getState().tolerance).toBe(remote.tolerance)
    previewRemount(SCENE)
    applyRemount(SCENE)
    expect(undoLastRemount(SCENE)).toBe(true)
    expect(() => initializeRemount(SCENE)).not.toThrow()
    expect(() => saveRemountConfig(SCENE)).not.toThrow()
  })

  test('ordinary undo of saved configuration requires reloading before another save', () => {
    saveRemountConfig(SCENE)
    useScene.temporal.getState().undo()
    expect(() => saveRemountConfig(SCENE)).toThrow('重新载入')
    reloadRemount(SCENE)
    expect(useRemountDraft.getState().layout).toBeNull()
    expect(() => saveRemountConfig(SCENE)).not.toThrow()
  })
})

test('native stage stairs remount as one physical assembly and undo without changing treads', async () => {
  const { createStageStair } = await import('@pascal-app/core/stage')
  const { stair, segment } = createStageStair(
    { position: [-2, 0, -1], rotation: Math.PI / 2, stepCount: 3 },
    'level_test',
  )
  fixture([stair, segment])
  const before = useScene.getState().nodes
  captureProductionLayout(SCENE, [stair.id])
  const plan = previewRemount(SCENE)
  expect(plan.placements).toHaveLength(1)
  expect(plan.scale).toBe(1)
  expect(plan.conflicts.filter((c) => c.severity === 'error')).toEqual([])
  applyRemount(SCENE)
  expect(useScene.getState().nodes[stair.id]).toMatchObject({
    position: [8, 0, -1],
    rotation: Math.PI / 2,
  })
  expect(useScene.getState().nodes[segment.id]).toEqual(segment)
  expect(useScene.temporal.getState().pastStates).toHaveLength(1)
  expect(undoLastRemount(SCENE)).toBe(true)
  expect(useScene.getState().nodes).toEqual(before)
})
