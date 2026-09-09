import {
  type AnyNode,
  type AnyNodeId,
  type BlockNode,
  calculateLevelMiters,
  GROUND_SUPPORT_ID,
  getFloorPlacedElevation,
  getLevelElevations,
  getScaledDimensions,
  getSceneHistoryPauseDepth,
  getWallBaseElevationForNodes,
  getWallEffectiveHeightForNodes,
  getWallPlanFootprint,
  type ItemNode,
  nodeRegistry,
  useLiveNodeOverrides,
  useLiveTransforms,
  useScene,
  type WallMiterData,
  type WallNode,
} from '@pascal-app/core'
import {
  add,
  composeRotations,
  createDeploymentPlan,
  createStageFrame,
  type DeploymentPlan,
  DeploymentPlanSchema,
  inverseRotatePoint,
  type ProductionLayout,
  ProductionLayoutSchema,
  type RemountObject,
  RemountObjectSchema,
  relativeRotation,
  rotatePoint,
  subtract,
  type Vec3,
  type VenueProfile,
  VenueProfileSchema,
} from '@pascal-app/core/remount'
import { z } from 'zod'
import { create } from 'zustand'

const SourceSnapshotSchema = RemountObjectSchema.extend({ fingerprint: z.string() })
type SourceSnapshot = z.infer<typeof SourceSnapshotSchema>

export const RemountMetadataSchema = z.object({
  version: z.literal(1),
  sourceVenue: VenueProfileSchema,
  targetVenue: VenueProfileSchema,
  layout: ProductionLayoutSchema.nullable(),
  sourceSnapshots: z.array(SourceSnapshotSchema),
  clearance: z.number().finite().nonnegative(),
  tolerance: z.number().finite().nonnegative(),
  lastPlan: DeploymentPlanSchema.nullable(),
})

type RemountMetadata = z.infer<typeof RemountMetadataSchema>
type SceneState = ReturnType<typeof useScene.getState>
type SceneNodes = SceneState['nodes']
type MovableNode = ItemNode | BlockNode
type Pose = { position: Vec3; rotation: Vec3 }
type RemountDraft = RemountMetadata & {
  sceneKey: string
  loadedMetadataSignature: string
  plan: DeploymentPlan | null
  previewNodes: SceneNodes | null
  previewDocument: Pick<SceneState, 'materials' | 'collections' | 'installedPlugins'> | null
  undoNodes: SceneNodes | null
  undoEntry: object | null
  obstacleWarnings: string[]
}

function defaultVenue(id: string, name: string, x: number): VenueProfile {
  const anchors: VenueProfile['anchors'] = [
    { id: 'origin', name: '台口中点', position: [x, 0, 2.5] },
    { id: 'right', name: '舞台右向', position: [x + 1, 0, 2.5] },
    { id: 'upstage', name: '舞台后向', position: [x, 0, 1.5] },
  ]
  return {
    id,
    name,
    anchors,
    frame: createStageFrame(anchors),
    bounds: { width: 8, depth: 5, height: 4 },
  }
}

function defaults(): RemountMetadata {
  return {
    version: 1,
    sourceVenue: defaultVenue('source', '原场地', 0),
    targetVenue: defaultVenue('target', '目标场地', 10),
    layout: null,
    sourceSnapshots: [],
    clearance: 0.15,
    tolerance: 0.02,
    lastPlan: null,
  }
}

export const useRemountDraft = create<RemountDraft>(() => ({
  ...defaults(),
  sceneKey: '',
  loadedMetadataSignature: 'null',
  plan: null,
  previewNodes: null,
  previewDocument: null,
  undoNodes: null,
  undoEntry: null,
  obstacleWarnings: [],
}))

function currentSite() {
  const state = useScene.getState()
  const site = state.rootNodeIds.map((id) => state.nodes[id]).find((node) => node?.type === 'site')
  if (!site) throw new Error('场景尚未加载，或缺少场地根节点。')
  return site
}

function sceneKey(sceneId: string): string {
  currentSite()
  return JSON.stringify([sceneId, useScene.getState().rootNodeIds])
}

function metadataSignature(): string {
  return JSON.stringify(currentSite().metadata.remount ?? null)
}

function draftFor(sceneId: string): RemountDraft {
  const draft = useRemountDraft.getState()
  if (draft.sceneKey !== sceneKey(sceneId)) throw new Error('场景已切换，请重新初始化复台。')
  if (draft.loadedMetadataSignature !== metadataSignature()) {
    useRemountDraft.setState({ plan: null, previewNodes: null })
    throw new Error('场景中的复台配置已变化，请重新载入配置后再操作。')
  }
  return draft
}

export function initializeRemount(sceneId: string): void {
  if (useRemountDraft.getState().sceneKey === sceneKey(sceneId)) {
    draftFor(sceneId)
    return
  }
  reloadRemount(sceneId)
}

export function reloadRemount(sceneId: string): void {
  const key = sceneKey(sceneId)
  const raw = currentSite().metadata.remount
  const saved = raw === undefined ? defaults() : RemountMetadataSchema.parse(raw)
  useRemountDraft.setState({
    ...saved,
    sceneKey: key,
    loadedMetadataSignature: metadataSignature(),
    plan: null,
    previewNodes: null,
    previewDocument: null,
    undoNodes: null,
    undoEntry: null,
    obstacleWarnings: [],
  })
}

function assertWritable(guardBlocked = false): void {
  if (guardBlocked || useScene.getState().readOnly)
    throw new Error('当前场景为只读或正在播放，不能修改复台。')
  if (
    !useScene.temporal.getState().isTracking ||
    getSceneHistoryPauseDepth() > 0 ||
    useLiveTransforms.getState().transforms.size > 0 ||
    useLiveNodeOverrides.getState().overrides.size > 0 ||
    Object.values(useScene.getState().nodes).some((node) => node.metadata.isNew === true)
  ) {
    throw new Error('请先结束当前放置、拖动或编辑操作。')
  }
}

function movable(node: AnyNode | undefined): MovableNode {
  if (!node || (node.type !== 'item' && node.type !== 'block'))
    throw new Error('第一阶段只支持物件和块体。')
  if (node.metadata.isNew === true) throw new Error('请先完成物件放置。')
  if (
    node.type === 'item' &&
    (node.asset.attachTo || node.wallId || node.roofSegmentId || node.blockFaceId)
  ) {
    throw new Error('墙面、屋顶、顶棚或块体面挂接物件暂不支持复台。')
  }
  return node
}

const ZERO: Vec3 = [0, 0, 0]
function yawOf(rotation: Vec3): number {
  if (Math.hypot(...subtract(rotatePoint([0, 1, 0], rotation), [0, 1, 0])) > 1e-7) {
    throw new Error('倾斜父节点下的块体暂不支持复台。')
  }
  const forward = rotatePoint([0, 0, 1], rotation)
  return Math.atan2(forward[0], forward[2])
}

function stableVector(next: Vec3, current: Vec3): Vec3 {
  return next.map((value, axis) =>
    Math.abs(value - current[axis]!) < 1e-12 ? current[axis]! : value,
  ) as Vec3
}

function worldPose(id: string | null, nodes: SceneNodes, path = new Set<string>()): Pose {
  if (id === null) return { position: ZERO, rotation: ZERO }
  if (path.has(id)) throw new Error('场景父子关系存在循环。')
  const node = nodes[id as AnyNodeId]
  if (!node) throw new Error('物件父节点已不存在。')
  path.add(id)
  const parent = worldPose(node.parentId, nodes, path)
  let position: Vec3
  let rotation: Vec3
  if (node.type === 'site') {
    if (node.parentId !== null) throw new Error('场地根节点不能有父节点。')
    return { position: ZERO, rotation: ZERO }
  }
  if (node.type === 'level') {
    position = [0, getLevelElevations(nodes).get(id)?.baseY ?? 0, 0]
    rotation = ZERO
  } else if (node.type === 'building') {
    position = node.position
    rotation = node.rotation
  } else {
    const object = movable(node)
    position = [...object.position]
    rotation = object.type === 'block' ? [0, object.rotation, 0] : object.rotation
    position[1] += getFloorPlacedElevation({ node: object, nodes, position, rotation })
  }
  return {
    position: add(parent.position, rotatePoint(position, parent.rotation)),
    rotation: composeRotations(parent.rotation, rotation),
  }
}

function fingerprint(node: MovableNode): string {
  const { position: _position, rotation: _rotation, supportSlabId: _support, ...rest } = node
  return JSON.stringify(rest)
}

function objectSnapshot(node: MovableNode, nodes: SceneNodes): SourceSnapshot {
  const pose = worldPose(node.id, nodes)
  let dimensions: Vec3
  let boundsCenter: Vec3
  if (node.type === 'item') {
    dimensions = getScaledDimensions(node)
    boundsCenter = [0, dimensions[1] / 2, 0]
  } else {
    const vertices = node.topology.vertices
    if (vertices.length === 0) throw new Error('块体没有可用的几何顶点。')
    const min: Vec3 = [...vertices[0]!.position]
    const max: Vec3 = [...min]
    for (const { position } of vertices)
      for (let axis = 0; axis < 3; axis += 1) {
        min[axis] = Math.min(min[axis]!, position[axis]!)
        max[axis] = Math.max(max[axis]!, position[axis]!)
      }
    dimensions = subtract(max, min)
    boundsCenter = [(max[0] + min[0]) / 2, (max[1] + min[1]) / 2, (max[2] + min[2]) / 2]
    const parent = worldPose(node.parentId, nodes)
    yawOf(parent.rotation)
  }
  return SourceSnapshotSchema.parse({
    nodeId: node.id,
    name: node.name || (node.type === 'item' ? node.asset.name : '块体'),
    representation: node.metadata.representation ?? 'physical',
    ...pose,
    dimensions,
    boundsCenter,
    fingerprint: fingerprint(node),
  })
}

function expandSelection(nodeIds: string[], nodes: SceneNodes): string[] {
  const result = new Set<string>()
  const visit = (id: string) => {
    if (result.has(id)) return
    const node = movable(nodes[id as AnyNodeId])
    result.add(id)
    for (const child of node.children) visit(child)
    for (const child of Object.values(nodes)) if (child.parentId === id) visit(child.id)
  }
  for (const id of nodeIds) visit(id)
  return [...result].sort()
}

export function getRemountCandidates(): {
  nodeId: string
  name: string
  eligible: boolean
  reason?: string
}[] {
  const nodes = useScene.getState().nodes
  return Object.values(nodes)
    .filter((node) => node.type === 'item' || node.type === 'block')
    .map((node) => {
      const name = node.name || (node.type === 'item' ? node.asset.name : '块体')
      try {
        for (const id of expandSelection([node.id], nodes))
          objectSnapshot(movable(nodes[id as AnyNodeId]), nodes)
        return { nodeId: node.id, name, eligible: true }
      } catch (error) {
        return {
          nodeId: node.id,
          name,
          eligible: false,
          reason: error instanceof Error ? error.message : '不支持的物件',
        }
      }
    })
}

export function captureProductionLayout(sceneId: string, nodeIds: string[]): void {
  assertWritable()
  const draft = draftFor(sceneId)
  const nodes = useScene.getState().nodes
  const ids = expandSelection(nodeIds, nodes)
  if (ids.length === 0) throw new Error('请至少选择一个可搬运物件。')
  const included = new Set(ids)
  const sourceSnapshots = ids.map((id) => {
    const node = movable(nodes[id as AnyNodeId])
    let assemblyId = id
    let parentId = node.parentId
    while (parentId && included.has(parentId)) {
      assemblyId = parentId
      parentId = nodes[parentId as AnyNodeId]?.parentId ?? null
    }
    return SourceSnapshotSchema.parse({ ...objectSnapshot(node, nodes), assemblyId })
  })
  const layout = ProductionLayoutSchema.parse({
    id: 'production',
    name: '演出布置',
    sourceVenueId: draft.sourceVenue.id,
    objectNodeIds: ids,
  })
  useRemountDraft.setState({ layout, sourceSnapshots, plan: null, previewNodes: null })
}

export function updateRemountInput(
  sceneId: string,
  patch: Partial<
    Pick<RemountMetadata, 'sourceVenue' | 'targetVenue' | 'clearance' | 'tolerance'>
  > & {
    paths?: ProductionLayout['paths']
    representations?: Record<string, RemountObject['representation']>
  },
): void {
  const draft = draftFor(sceneId)
  const { paths, representations, ...fields } = patch
  if (paths && !draft.layout) throw new Error('请先记录演出布置，再添加走位线。')
  const next = RemountMetadataSchema.parse({
    ...draft,
    ...fields,
    layout: draft.layout && paths ? { ...draft.layout, paths } : draft.layout,
    sourceSnapshots: draft.sourceSnapshots.map((snapshot) => ({
      ...snapshot,
      representation: representations?.[snapshot.nodeId] ?? snapshot.representation,
    })),
  })
  if (next.layout) next.layout = { ...next.layout, sourceVenueId: next.sourceVenue.id }
  useRemountDraft.setState({ ...next, plan: null, previewNodes: null })
}

function validatedSources(draft: RemountDraft, nodes: SceneNodes): SourceSnapshot[] {
  if (!draft.layout || draft.sourceSnapshots.length === 0) throw new Error('请先记录演出布置。')
  const ids = draft.sourceSnapshots.map((entry) => entry.nodeId)
  if (JSON.stringify(ids) !== JSON.stringify(draft.layout.objectNodeIds))
    throw new Error('保存的演出布置与原始快照不匹配。')
  for (const source of draft.sourceSnapshots) {
    if (fingerprint(movable(nodes[source.nodeId as AnyNodeId])) !== source.fingerprint) {
      throw new Error('物件尺寸、挂接或子树已变化，请重新记录演出布置。')
    }
  }
  return draft.sourceSnapshots
}

function obstacleSnapshot(
  node: AnyNode,
  nodes: SceneNodes,
  miters: Map<string | null, WallMiterData>,
): RemountObject | null {
  if (node.type === 'item' || node.type === 'block') return objectSnapshot(movable(node), nodes)
  if (node.type !== 'wall' && node.type !== 'column') return null
  const parent = worldPose(node.parentId, nodes)
  let position: Vec3
  let rotation: Vec3
  let dimensions: Vec3
  if (node.type === 'wall') {
    let miter = miters.get(node.parentId)
    if (!miter) {
      miter = calculateLevelMiters(
        Object.values(nodes).filter(
          (other): other is WallNode => other.type === 'wall' && other.parentId === node.parentId,
        ),
      )
      miters.set(node.parentId, miter)
    }
    rotation = [0, -Math.atan2(node.end[1] - node.start[1], node.end[0] - node.start[0]), 0]
    const polygon = getWallPlanFootprint(node, miter).map((point) =>
      inverseRotatePoint([point.x, 0, point.y], rotation),
    )
    if (polygon.length === 0) throw new Error('墙体没有有效轮廓。')
    const minX = Math.min(...polygon.map((point) => point[0])),
      maxX = Math.max(...polygon.map((point) => point[0]))
    const minZ = Math.min(...polygon.map((point) => point[2])),
      maxZ = Math.max(...polygon.map((point) => point[2]))
    position = rotatePoint(
      [(minX + maxX) / 2, getWallBaseElevationForNodes(node, nodes), (minZ + maxZ) / 2],
      rotation,
    )
    dimensions = [maxX - minX, getWallEffectiveHeightForNodes(node, nodes), maxZ - minZ]
  } else {
    rotation = [0, node.rotation, 0]
    position = [...node.position]
    position[1] += getFloorPlacedElevation({ node, nodes, position, rotation })
    const footprint = nodeRegistry
      .get('column')
      ?.capabilities.floorPlaced?.footprint?.(node, { nodes })
    dimensions = footprint
      ? [...footprint.dimensions]
      : [Math.max(node.width, node.radius * 2), node.height, Math.max(node.depth, node.radius * 2)]
  }
  return RemountObjectSchema.parse({
    nodeId: node.id,
    name: node.name || (node.type === 'wall' ? '墙体' : '柱体'),
    representation: 'proxy',
    position: add(parent.position, rotatePoint(position, parent.rotation)),
    rotation: composeRotations(parent.rotation, rotation),
    dimensions,
    boundsCenter: [0, dimensions[1] / 2, 0],
  })
}

export function previewRemount(sceneId: string): DeploymentPlan {
  assertWritable()
  const draft = draftFor(sceneId)
  const nodes = useScene.getState().nodes
  const objects = validatedSources(draft, nodes)
  const selected = new Set(objects.map((entry) => entry.nodeId))
  const obstacles: RemountObject[] = []
  const obstacleWarnings: string[] = []
  const miters = new Map<string | null, WallMiterData>()
  for (const node of Object.values(nodes)) {
    if (selected.has(node.id) || node.visible === false) continue
    try {
      const obstacle = obstacleSnapshot(node, nodes, miters)
      if (obstacle) obstacles.push(obstacle)
    } catch (error) {
      obstacleWarnings.push(
        `${node.name || node.id} 未参与碰撞检查：${error instanceof Error ? error.message : '无法解析几何。'}`,
      )
    }
  }
  const plan = createDeploymentPlan({
    sourceVenue: draft.sourceVenue,
    targetVenue: draft.targetVenue,
    layout: draft.layout!,
    objects,
    obstacles,
    clearance: draft.clearance,
    tolerance: draft.tolerance,
  })
  const { materials, collections, installedPlugins } = useScene.getState()
  useRemountDraft.setState({
    plan,
    previewNodes: nodes,
    previewDocument: { materials, collections, installedPlugins },
    obstacleWarnings,
  })
  return plan
}

/** Camera framing may save LevelNode.camera without changing the deployment. */
export function isRemountPreviewCurrent(sceneId: string): boolean {
  const draft = useRemountDraft.getState()
  const state = useScene.getState()
  if (!draft.plan || !draft.previewNodes || !draft.previewDocument) return false
  try {
    if (
      draft.sceneKey !== sceneKey(sceneId) ||
      draft.loadedMetadataSignature !== metadataSignature()
    )
      return false
  } catch {
    return false
  }
  const document = draft.previewDocument
  if (
    document.materials !== state.materials ||
    document.collections !== state.collections ||
    document.installedPlugins !== state.installedPlugins
  )
    return false
  if (draft.previewNodes === state.nodes) return true
  if (Object.keys(draft.previewNodes).length !== Object.keys(state.nodes).length) return false
  return Object.values(draft.previewNodes).every((before) => {
    const after = state.nodes[before.id]
    if (before === after) return true
    if (before.type !== 'level' || after?.type !== 'level') return false
    const { camera: _beforeCamera, ...beforeData } = before
    const { camera: _afterCamera, ...afterData } = after
    return JSON.stringify(beforeData) === JSON.stringify(afterData)
  })
}

function metadataUpdate(draft: RemountDraft, lastPlan = draft.lastPlan) {
  const site = currentSite()
  const remount = RemountMetadataSchema.parse(
    JSON.parse(JSON.stringify(RemountMetadataSchema.parse({ ...draft, lastPlan }))),
  )
  return { id: site.id, data: { metadata: { ...site.metadata, remount } } }
}

export function saveRemountConfig(sceneId: string, guardBlocked = false): void {
  assertWritable(guardBlocked)
  const draft = draftFor(sceneId)
  useScene.getState().applyNodeChanges({ update: [metadataUpdate(draft)] })
  useRemountDraft.setState({
    plan: null,
    previewNodes: null,
    loadedMetadataSignature: metadataSignature(),
  })
}

export function applyRemount(sceneId: string, guardBlocked = false): void {
  assertWritable(guardBlocked)
  const draft = draftFor(sceneId)
  const nodes = useScene.getState().nodes
  if (!draft.plan || !isRemountPreviewCurrent(sceneId))
    throw new Error('预览已过期，请重新生成预览。')
  validatedSources(draft, nodes)
  const plan = DeploymentPlanSchema.parse(draft.plan)
  if (!plan.calibration.valid || plan.conflicts.some((conflict) => conflict.severity === 'error'))
    throw new Error('请先解决标定误差或物理冲突。')
  const placed = new Map(plan.placements.map((placement) => [placement.nodeId, placement]))
  const updates: { id: AnyNodeId; data: Partial<AnyNode> }[] = []
  for (const placement of plan.placements) {
    const node = movable(nodes[placement.nodeId as AnyNodeId])
    const parentPlacement = node.parentId ? placed.get(node.parentId) : undefined
    const parent = parentPlacement
      ? { position: parentPlacement.targetPosition, rotation: parentPlacement.targetRotation }
      : worldPose(node.parentId, nodes)
    const position = inverseRotatePoint(
      subtract(placement.targetPosition, parent.position),
      parent.rotation,
    )
    const rotation = relativeRotation(placement.targetRotation, parent.rotation)
    const storedRotation =
      node.type === 'block' ? yawOf(rotation) : stableVector(rotation, node.rotation)
    // Pin to the ground and subtract its lift; overlapping target slabs must not add a second translation.
    const supported = { ...node, supportSlabId: GROUND_SUPPORT_ID }
    position[1] -= getFloorPlacedElevation({
      node: supported,
      nodes,
      position,
      rotation: storedRotation,
    })
    updates.push({
      id: node.id,
      data: {
        position: stableVector(position, node.position),
        rotation: storedRotation,
        supportSlabId: GROUND_SUPPORT_ID,
      },
    })
  }
  updates.push(metadataUpdate(draft, plan))
  const previousEntry = useScene.temporal.getState().pastStates.at(-1)
  useScene.getState().applyNodeChanges({ update: updates })
  const entry = useScene.temporal.getState().pastStates.at(-1)
  useRemountDraft.setState({
    loadedMetadataSignature: metadataSignature(),
    lastPlan: plan,
    plan: null,
    previewNodes: null,
    undoNodes: entry !== previousEntry ? useScene.getState().nodes : null,
    undoEntry: entry !== previousEntry ? (entry ?? null) : null,
  })
}

export function canUndoLastRemount(sceneId: string): boolean {
  const draft = useRemountDraft.getState()
  return (
    draft.sceneKey === sceneKey(sceneId) &&
    draft.undoNodes === useScene.getState().nodes &&
    draft.undoEntry !== null &&
    draft.undoEntry === useScene.temporal.getState().pastStates.at(-1)
  )
}

export function undoLastRemount(sceneId: string, guardBlocked = false): boolean {
  assertWritable(guardBlocked)
  if (!canUndoLastRemount(sceneId)) return false
  useScene.temporal.getState().undo()
  const lastPlan = RemountMetadataSchema.safeParse(currentSite().metadata.remount)
  useRemountDraft.setState({
    loadedMetadataSignature: metadataSignature(),
    plan: null,
    previewNodes: null,
    undoNodes: null,
    undoEntry: null,
    lastPlan: lastPlan.success ? lastPlan.data.lastPlan : null,
  })
  return true
}
