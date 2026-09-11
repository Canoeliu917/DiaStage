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
  type StairNode,
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
  getObjectCorners,
  inverseRotatePoint,
  type ProductionLayout,
  ProductionLayoutSchema,
  type RemountObject,
  RemountObjectSchema,
  relativeRotation,
  rotatePoint,
  subtract,
  toFrameCoordinates,
  transformDirection,
  transformPoint,
  type Vec3,
  type VenueProfile,
  VenueProfileSchema,
} from '@pascal-app/core/remount'
import { stageStairBounds } from '@pascal-app/core/stage'
import { z } from 'zod'
import { create } from 'zustand'
import {
  type CameraProject,
  type Shot,
  sampleShot,
  validateCameraProject,
} from '../components/camera-studio/model'
import { isLegacyLight } from './legacy-lighting'
import { THEATRE_METADATA_KEY } from './theatre/scene-adapter'
import { StageSceneDocumentSchema } from './theatre/simulation'
import { readStageDocument } from './theatre/simulation-store'

const CAMERA_METADATA_KEY = 'diastageCameraStudio'
const cameraSnapshotSchema = z.unknown().transform((input, context): Shot => {
  try {
    return validateCameraProject({ version: 1, shots: [input] }).shots[0]!
  } catch {
    context.addIssue({ code: 'custom', message: '复台机位快照无效，请重新记录演出布置。' })
    return z.NEVER
  }
})
const SourceSnapshotSchema = RemountObjectSchema.extend({
  fingerprint: z.string(),
  sourceKind: z.enum(['node', 'camera']).default('node'),
  camera: cameraSnapshotSchema.optional(),
})
type SourceSnapshot = z.infer<typeof SourceSnapshotSchema>

export const RemountMetadataSchema = z.object({
  version: z.literal(1),
  sourceVenue: VenueProfileSchema,
  sourceHeightMeasured: z.boolean().default(true),
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
type MovableNode = ItemNode | BlockNode | StairNode
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
    { id: 'right', name: '横向基准', position: [x + 1, 0, 2.5] },
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
  const document = readStageDocument()
  let sourceVenue = defaultVenue('source', '原场地', 0)
  if (document) {
    const { origin, width, depth, height, id, name } = document.venue
    const point: Vec3 = [origin[0], origin[1], origin[2] + depth / 2]
    // Preserve the existing calibration handedness; this axis is not actor stage-right.
    const anchors: VenueProfile['anchors'] = [
      { id: 'origin', name: '台口中点', position: point },
      { id: 'right', name: '横向基准', position: add(point, [1, 0, 0]) },
      { id: 'upstage', name: '舞台后向', position: add(point, [0, 0, -1]) },
    ]
    sourceVenue = {
      id,
      name,
      anchors,
      frame: createStageFrame(anchors),
      bounds: { width, depth, height },
    }
  }
  return {
    version: 1,
    sourceVenue,
    sourceHeightMeasured: !document || currentSite().metadata.stageHeightMeasured !== false,
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
  if (
    raw !== undefined &&
    typeof raw === 'object' &&
    raw !== null &&
    !Object.hasOwn(raw, 'sourceHeightMeasured') &&
    currentSite().metadata.stageHeightMeasured === false
  )
    saved.sourceHeightMeasured = false
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
  if (!node || (node.type !== 'item' && node.type !== 'block' && node.type !== 'stair'))
    throw new Error('请选择物件、体块或舞台台阶。')
  if (node.metadata.isNew === true) throw new Error('请先完成物件放置。')
  if (node.type === 'item' && (node.asset.attachTo || node.wallId || node.blockFaceId)) {
    throw new Error('墙面或体块面挂接物件暂不支持复台。')
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

export function worldPose(id: string | null, nodes: SceneNodes, path = new Set<string>()): Pose {
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
    rotation = object.type === 'item' ? object.rotation : [0, object.rotation, 0]
    position[1] += getFloorPlacedElevation({ node: object, nodes, position, rotation })
  }
  return {
    position: add(parent.position, rotatePoint(position, parent.rotation)),
    rotation: composeRotations(parent.rotation, rotation),
  }
}

function fingerprint(node: MovableNode, nodes: SceneNodes): string {
  const { position: _position, rotation: _rotation, supportSlabId: _support, ...rest } = node
  return JSON.stringify({
    ...rest,
    ...(node.type === 'stair' ? { segments: node.children.map((id) => nodes[id]) } : {}),
  })
}

function canonicalCameras(): CameraProject {
  const state = useScene.getState()
  const site = state.rootNodeIds.map((id) => state.nodes[id]).find((node) => node?.type === 'site')
  return validateCameraProject(site?.metadata[CAMERA_METADATA_KEY] ?? { version: 1, shots: [] })
}

function cameraFingerprint(shot: Shot): string {
  return JSON.stringify({
    ...shot,
    keyframes: shot.keyframes.map(({ id, time, fov }) => ({ id, time, fov })),
    follow: shot.follow && { nodeId: shot.follow.nodeId, mode: shot.follow.mode },
  })
}

function cameraSnapshot(id: string, nodes: SceneNodes): SourceSnapshot {
  const shot = canonicalCameras().shots.find((candidate) => `camera:${candidate.id}` === id)
  if (!shot) throw new Error('机位已删除或尚未保存，请重新记录演出布置。')
  if (shot.motion)
    throw new Error(
      `「${shot.name}」带有独立物件运动轨迹；请先在观察与记录中移除该轨迹，再复台，避免改写排演。`,
    )
  let target: Vec3 | undefined
  if (shot.follow) {
    try {
      target = worldPose(movable(nodes[shot.follow.nodeId as AnyNodeId]).id, nodes).position
    } catch {
      throw new Error(`「${shot.name}」的跟随对象不属于可搬运布景，请先解除跟随或选择支持的布景。`)
    }
  }
  const pose = sampleShot(shot, 0, target)
  const direction = subtract(pose.lookAt, pose.position)
  const length = Math.hypot(...direction)
  if (length < 1e-8) throw new Error(`「${shot.name}」的位置与注视点重合，请先调整机位。`)
  return SourceSnapshotSchema.parse({
    nodeId: id,
    sourceKind: 'camera',
    camera: shot,
    name: `${shot.name} · 机位`,
    representation: 'virtual',
    position: pose.position,
    rotation: [
      Math.hypot(direction[1], direction[2]) < 1e-10 ? 0 : Math.atan2(direction[1], -direction[2]),
      Math.asin(Math.max(-1, Math.min(1, -direction[0] / length))),
      0,
    ],
    dimensions: [0.35, 0.25, 0.5],
    boundsCenter: [0, 0, 0],
    fingerprint: cameraFingerprint(shot),
  })
}

function snapshotFor(id: string, nodes: SceneNodes): SourceSnapshot {
  return id.startsWith('camera:')
    ? cameraSnapshot(id, nodes)
    : objectSnapshot(movable(nodes[id as AnyNodeId]), nodes)
}

function validateCameraDependencies(snapshots: SourceSnapshot[]) {
  const included = new Set(snapshots.map((snapshot) => snapshot.nodeId))
  for (const snapshot of snapshots) {
    if (snapshot.sourceKind !== 'camera') continue
    if (!snapshot.camera || snapshot.nodeId !== `camera:${snapshot.camera.id}`)
      throw new Error('机位快照与布局不匹配，请重新记录。')
    if (snapshot.representation !== 'virtual')
      throw new Error('舞台机位使用虚拟参考，不作为实体设备的碰撞尺寸。')
    if (snapshot.camera.motion) throw new Error('独立物件运动轨迹暂不能安全复台，请先移除该轨迹。')
    if (snapshot.camera.follow && !included.has(snapshot.camera.follow.nodeId)) {
      throw new Error(`请同时选入「${snapshot.camera.name}」跟随的布景，或先解除跟随。`)
    }
  }
}

export function objectSnapshot(node: MovableNode, nodes: SceneNodes): SourceSnapshot {
  const pose = worldPose(node.id, nodes)
  let dimensions: Vec3
  let boundsCenter: Vec3
  if (node.type === 'item') {
    dimensions = getScaledDimensions(node)
    boundsCenter = [0, dimensions[1] / 2, 0]
  } else if (node.type === 'stair') {
    ;({ dimensions, boundsCenter } = stageStairBounds(node, nodes))
    yawOf(worldPose(node.parentId, nodes).rotation)
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
    fingerprint: fingerprint(node, nodes),
  })
}

function expandSelection(nodeIds: string[], nodes: SceneNodes): string[] {
  const result = new Set<string>()
  const visit = (id: string) => {
    if (result.has(id)) return
    if (id.startsWith('camera:')) {
      cameraSnapshot(id, nodes)
      result.add(id)
      return
    }
    const node = movable(nodes[id as AnyNodeId])
    result.add(id)
    if (node.type === 'stair') return
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
  const candidates: { nodeId: string; name: string; eligible: boolean; reason?: string }[] =
    Object.values(nodes)
      .filter(
        (node) =>
          (node.type === 'item' || node.type === 'block' || node.type === 'stair') &&
          !isLegacyLight(node),
      )
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
  let cameras: CameraProject
  try {
    cameras = canonicalCameras()
  } catch {
    return [
      ...candidates,
      {
        nodeId: 'camera:unreadable',
        name: '机位资料无法读取',
        eligible: false,
        reason: '原始机位资料已保留，请恢复有效备份后再复台机位。',
      },
    ]
  }
  for (const shot of cameras.shots) {
    const nodeId = `camera:${shot.id}`
    try {
      cameraSnapshot(nodeId, nodes)
      candidates.push({
        nodeId,
        name: `${shot.name} · 机位`,
        eligible: true,
        ...(shot.follow ? { reason: '跟随机位：请同时选入所跟随的布景。' } : {}),
      })
    } catch (error) {
      candidates.push({
        nodeId,
        name: `${shot.name} · 机位`,
        eligible: false,
        reason: error instanceof Error ? error.message : '机位快照无效',
      })
    }
  }
  return candidates
}

export function captureProductionLayout(sceneId: string, nodeIds: string[]): void {
  assertWritable()
  const draft = draftFor(sceneId)
  const nodes = useScene.getState().nodes
  const ids = expandSelection(nodeIds, nodes)
  if (ids.length === 0) throw new Error('请至少选择一个可搬运物件。')
  const included = new Set(ids)
  const sourceSnapshots = ids.map((id) => {
    if (id.startsWith('camera:')) return cameraSnapshot(id, nodes)
    const node = movable(nodes[id as AnyNodeId])
    let assemblyId = id
    let parentId = node.parentId
    while (parentId && included.has(parentId)) {
      assemblyId = parentId
      parentId = nodes[parentId as AnyNodeId]?.parentId ?? null
    }
    return SourceSnapshotSchema.parse({ ...objectSnapshot(node, nodes), assemblyId })
  })
  validateCameraDependencies(sourceSnapshots)
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
    Pick<
      RemountMetadata,
      'sourceVenue' | 'sourceHeightMeasured' | 'targetVenue' | 'clearance' | 'tolerance'
    >
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
    if (snapshotFor(source.nodeId, nodes).fingerprint !== source.fingerprint) {
      throw new Error('物件尺寸、挂接或子树已变化，请重新记录演出布置。')
    }
    if (source.sourceKind === 'node' && nodes[source.nodeId as AnyNodeId]?.metadata.stageLocked)
      throw new Error('复台包含已锁定布景，请先解锁。')
  }
  validateCameraDependencies(draft.sourceSnapshots)
  return draft.sourceSnapshots
}

function assertMeasuredHeight(draft: RemountDraft) {
  if (!draft.sourceHeightMeasured)
    throw new Error('源场地净高尚未测量。请在源场地填写实测净高，再生成预览或确认复台。')
}

function mappedCamera(shot: Shot, draft: RemountDraft): Shot {
  const point = (value: Vec3) =>
    transformPoint(value, draft.sourceVenue.frame, draft.targetVenue.frame)
  const direction = (value: Vec3) =>
    transformDirection(value, draft.sourceVenue.frame, draft.targetVenue.frame)
  return {
    ...shot,
    keyframes: shot.keyframes.map((frame) => ({
      ...frame,
      position: point(frame.position),
      lookAt: point(frame.lookAt),
    })),
    follow: shot.follow && {
      ...shot.follow,
      offset: direction(shot.follow.offset),
      lookAtOffset: direction(shot.follow.lookAtOffset),
    },
  }
}

function obstacleSnapshot(
  node: AnyNode,
  nodes: SceneNodes,
  miters: Map<string | null, WallMiterData>,
): RemountObject | null {
  if (node.type === 'item' || node.type === 'block' || node.type === 'stair')
    return objectSnapshot(movable(node), nodes)
  if (node.type !== 'wall') return null
  const parent = worldPose(node.parentId, nodes)
  let miter = miters.get(node.parentId)
  if (!miter) {
    miter = calculateLevelMiters(
      Object.values(nodes).filter(
        (other): other is WallNode => other.type === 'wall' && other.parentId === node.parentId,
      ),
    )
    miters.set(node.parentId, miter)
  }
  const rotation: Vec3 = [
    0,
    -Math.atan2(node.end[1] - node.start[1], node.end[0] - node.start[0]),
    0,
  ]
  const polygon = getWallPlanFootprint(node, miter).map((point) =>
    inverseRotatePoint([point.x, 0, point.y], rotation),
  )
  if (polygon.length === 0) throw new Error('墙体没有有效轮廓。')
  const minX = Math.min(...polygon.map((point) => point[0])),
    maxX = Math.max(...polygon.map((point) => point[0]))
  const minZ = Math.min(...polygon.map((point) => point[2])),
    maxZ = Math.max(...polygon.map((point) => point[2]))
  const position = rotatePoint(
    [(minX + maxX) / 2, getWallBaseElevationForNodes(node, nodes), (minZ + maxZ) / 2],
    rotation,
  )
  const dimensions: Vec3 = [maxX - minX, getWallEffectiveHeightForNodes(node, nodes), maxZ - minZ]
  return RemountObjectSchema.parse({
    nodeId: node.id,
    name: node.name || '墙体',
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
  assertMeasuredHeight(draft)
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
  for (const object of objects) {
    if (!object.camera || object.camera.follow?.mode === 'offset') continue
    const points = object.camera.keyframes.map((frame) => frame.position)
    if (points.length > 1)
      plan.paths.push({
        id: `${object.nodeId}:movement`,
        name: `${object.camera.name} · 机位移动`,
        sourcePoints: points,
        targetPoints: points.map((point) =>
          transformPoint(point, draft.sourceVenue.frame, draft.targetVenue.frame),
        ),
      })
    if (
      points.some((position) =>
        getObjectCorners({ ...object, position }).some((point) => {
          const [right, up, back] = toFrameCoordinates(
            transformPoint(point, draft.sourceVenue.frame, draft.targetVenue.frame),
            draft.targetVenue.frame,
          )
          const { width, depth, height } = draft.targetVenue.bounds
          return (
            Math.abs(right) > width / 2 + 1e-6 ||
            back < -1e-6 ||
            back > depth + 1e-6 ||
            up < -1e-6 ||
            up > height + 1e-6
          )
        }),
      )
    )
      plan.conflicts.push({
        nodeId: object.nodeId,
        type: 'out-of-bounds',
        severity: 'error',
        message: `${object.camera.name} 的机位关键帧超出目标场地可用范围。`,
      })
  }
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

function metadataUpdate(draft: RemountDraft, lastPlan = draft.lastPlan, cameras?: CameraProject) {
  const site = currentSite()
  const remount = RemountMetadataSchema.parse(
    JSON.parse(JSON.stringify(RemountMetadataSchema.parse({ ...draft, lastPlan }))),
  )
  const document = readStageDocument()
  const measuredSource =
    document && draft.sourceVenue.id === document.venue.id && draft.sourceHeightMeasured
      ? {
          stageHeightMeasured: true,
          [THEATRE_METADATA_KEY]: StageSceneDocumentSchema.parse({
            ...document,
            venue: { ...document.venue, height: draft.sourceVenue.bounds.height },
          }),
        }
      : {}
  return {
    id: site.id,
    data: {
      metadata: {
        ...site.metadata,
        ...measuredSource,
        ...(cameras ? { [CAMERA_METADATA_KEY]: validateCameraProject(cameras) } : {}),
        remount,
      },
    },
  }
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
  assertMeasuredHeight(draft)
  const nodes = useScene.getState().nodes
  if (!draft.plan || !isRemountPreviewCurrent(sceneId))
    throw new Error('预览已过期，请重新生成预览。')
  validatedSources(draft, nodes)
  const plan = DeploymentPlanSchema.parse(draft.plan)
  if (!plan.calibration.valid || plan.conflicts.some((conflict) => conflict.severity === 'error'))
    throw new Error('请先解决标定误差或物理冲突。')
  const placed = new Map(plan.placements.map((placement) => [placement.nodeId, placement]))
  const cameras = canonicalCameras()
  let cameraChanged = false
  const updates: { id: AnyNodeId; data: Partial<AnyNode> }[] = []
  for (const placement of plan.placements) {
    const source = draft.sourceSnapshots.find((snapshot) => snapshot.nodeId === placement.nodeId)!
    if (source.sourceKind === 'camera' && source.camera) {
      cameras.shots = cameras.shots.map((shot) =>
        shot.id === source.camera!.id ? mappedCamera(source.camera!, draft) : shot,
      )
      cameraChanged = true
      continue
    }
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
      node.type === 'item' ? stableVector(rotation, node.rotation) : yawOf(rotation)
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
  updates.push(metadataUpdate(draft, plan, cameraChanged ? cameras : undefined))
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
