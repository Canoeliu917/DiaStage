import {
  type AnyNode,
  type AnyNodeId,
  type Collection,
  type CollectionId,
  getLevelElevations,
  getSceneHistoryPauseDepth,
  SceneMaterial,
  type SceneMaterialId,
  type SceneSnapshot,
  type SlabNode,
  useLiveNodeOverrides,
  useLiveTransforms,
  useScene,
} from '@pascal-app/core'
import { inverseRotatePoint } from '@pascal-app/core/remount'
import { z } from 'zod'
import { apiGraphSchema } from '../graph-schema'
import { isTheatreVisibilityOverride } from './presentation'
import {
  type StageSnapshot,
  StageSnapshotSchema,
  type TheatreDocument,
  TheatreDocumentSchema,
  theatreId,
  type Vec3,
} from './schema'
import { migrateStageDocument, runtimeTheatreDocument } from './simulation'

export const THEATRE_METADATA_KEY = 'diastageTheatre'
type SceneNodes = ReturnType<typeof useScene.getState>['nodes']

function rootSite(nodes: SceneNodes, rootNodeIds: string[]) {
  const site = rootNodeIds.map((id) => nodes[id as AnyNodeId]).find((node) => node?.type === 'site')
  if (!site) throw new Error('场地尚未载入，请稍后重试')
  return site
}

export function readTheatreDocument(
  nodes = useScene.getState().nodes,
  rootNodeIds: string[] = useScene.getState().rootNodeIds,
): TheatreDocument | null {
  const raw = rootSite(nodes, rootNodeIds).metadata[THEATRE_METADATA_KEY]
  if (raw === undefined) return null
  if (typeof raw === 'object' && raw !== null && 'version' in raw && raw.version === 2)
    return runtimeTheatreDocument(migrateStageDocument(raw))
  return TheatreDocumentSchema.parse(raw)
}

export function assertTheatreWritable(): void {
  const state = useScene.getState()
  if (state.readOnly) throw new Error('当前场景为只读，不能修改排演')
  if (
    !useScene.temporal.getState().isTracking ||
    getSceneHistoryPauseDepth() > 0 ||
    useLiveTransforms.getState().transforms.size > 0 ||
    [...useLiveNodeOverrides.getState().overrides.values()].some(
      (override) => !isTheatreVisibilityOverride(override),
    ) ||
    Object.values(state.nodes).some((node) => node.metadata.isNew === true)
  ) {
    throw new Error('请先结束当前放置、拖动或预演，再保存排演')
  }
}

export function stageFloorUpdates(document: TheatreDocument, nodes: SceneNodes, siteId: string) {
  const { width, depth, origin } = document.venue
  const corners: Vec3[] = [
    [origin[0] - width / 2, origin[1], origin[2] - depth / 2],
    [origin[0] + width / 2, origin[1], origin[2] - depth / 2],
    [origin[0] + width / 2, origin[1], origin[2] + depth / 2],
    [origin[0] - width / 2, origin[1], origin[2] + depth / 2],
  ]
  const levels = getLevelElevations(nodes)
  const updates: Array<{ id: AnyNodeId; data: Partial<SlabNode> }> = []
  for (const floor of Object.values(nodes)) {
    if (floor.type !== 'slab' || floor.metadata.theatreKind !== 'stage-floor') continue
    const level = floor.parentId ? levels.get(floor.parentId) : undefined
    const parent = level?.buildingId ? nodes[level.buildingId as AnyNodeId] : undefined
    if (!level || parent?.type !== 'building') throw new Error('自有舞台地面缺少有效的表演区')
    if (parent.parentId !== siteId) continue
    const local = corners.map((point) => {
      const result = inverseRotatePoint(
        [
          point[0] - parent.position[0],
          point[1] - parent.position[1],
          point[2] - parent.position[2],
        ],
        parent.rotation,
      )
      result[1] -= level.baseY
      return result
    })
    if (local.some((point) => !point.every(Number.isFinite))) throw new Error('舞台地面坐标无效')
    const elevation = local[0]![1]
    if (local.some((point) => Math.abs(point[1] - elevation) > 1e-6))
      throw new Error('当前舞台地面已倾斜，请恢复水平后调整场地模板')
    updates.push({
      id: floor.id,
      data: {
        polygon: local.map((point): [number, number] => [point[0], point[2]]),
        elevation,
      },
    })
  }
  return updates
}

export function writeTheatreDocument(input: TheatreDocument): TheatreDocument {
  assertTheatreWritable()
  const document = TheatreDocumentSchema.parse(input)
  const state = useScene.getState()
  const site = rootSite(state.nodes, state.rootNodeIds)
  const previous = readTheatreDocument(state.nodes, state.rootNodeIds)
  const venueChanged =
    !previous || JSON.stringify(previous.venue) !== JSON.stringify(document.venue)
  for (const scene of document.scenes) {
    for (const prop of scene.props) {
      if (prop.nodeId && !state.nodes[prop.nodeId as AnyNodeId])
        throw new Error(`道具「${prop.name}」关联的物件不存在`)
    }
  }
  state.applyNodeChanges({
    update: [
      { id: site.id, data: { metadata: { ...site.metadata, [THEATRE_METADATA_KEY]: document } } },
      ...(venueChanged ? stageFloorUpdates(document, state.nodes, site.id) : []),
    ],
  })
  return document
}

function jsonCopy<T>(value: T): T {
  const encoded = JSON.stringify(value, (_key, entry: unknown) => {
    if (typeof entry === 'number' && !Number.isFinite(entry))
      throw new Error('布景包含非法数值，请修正后再保存版本')
    if (typeof entry === 'function' || typeof entry === 'symbol' || typeof entry === 'bigint')
      throw new Error('布景包含不能保存的数据')
    return entry
  })
  return JSON.parse(encoded) as T
}

export function captureStageSnapshot(): StageSnapshot {
  const state = useScene.getState()
  const nodes = jsonCopy(state.nodes)
  for (const id of state.rootNodeIds) {
    const node = nodes[id]
    if (node) delete node.metadata[THEATRE_METADATA_KEY]
  }
  return StageSnapshotSchema.parse(
    jsonCopy({
      nodes,
      rootNodeIds: state.rootNodeIds,
      materials: state.materials,
      collections: state.collections,
      installedPlugins: state.installedPlugins,
    }),
  )
}

export function saveRehearsalTake(name: string, note = ''): TheatreDocument {
  assertTheatreWritable()
  const current = readTheatreDocument()
  if (!current) throw new Error('请先建立排演')
  const { takes: _takes, ...document } = current
  const take = {
    id: theatreId('take'),
    name,
    createdAt: new Date().toISOString(),
    note,
    document: jsonCopy(document),
    stage: captureStageSnapshot(),
  }
  return writeTheatreDocument({ ...current, takes: [...current.takes, take] })
}

const collectionSchema = z.object({
  id: z.string().startsWith('collection_'),
  name: z.string(),
  color: z.string().optional(),
  nodeIds: z.array(z.string()),
  controlNodeId: z.string().optional(),
})

export function parseSnapshot(input: StageSnapshot): SceneSnapshot {
  const snapshot = StageSnapshotSchema.parse(input)
  apiGraphSchema.parse(snapshot)
  const nodes: SceneNodes = {}
  for (const [id, value] of Object.entries(snapshot.nodes)) {
    const base = z
      .object({ id: z.string(), type: z.string(), parentId: z.string().nullable() })
      .parse(value)
    if (base.id !== id) throw new Error('布景快照节点 ID 不匹配')
    nodes[id as AnyNodeId] = value as AnyNode
  }
  const roots = snapshot.rootNodeIds as AnyNodeId[]
  for (const rootId of roots)
    if (!nodes[rootId] || nodes[rootId]!.parentId !== null) throw new Error('布景快照根节点无效')
  for (const node of Object.values(nodes)) {
    if (node.parentId && !nodes[node.parentId as AnyNodeId]) throw new Error('布景快照缺少父节点')
    if (node.parentId === null && !roots.includes(node.id))
      throw new Error('布景快照缺少根节点索引')
    const directParent = node.parentId ? nodes[node.parentId as AnyNodeId] : null
    if (
      directParent &&
      !(
        'children' in directParent &&
        Array.isArray(directParent.children) &&
        directParent.children.some((childId) => childId === node.id)
      )
    )
      throw new Error('布景快照缺少子节点索引')
    if ('children' in node && Array.isArray(node.children)) {
      for (const childId of node.children)
        if (nodes[childId as AnyNodeId]?.parentId !== node.id)
          throw new Error('布景快照的父子关系无效')
    }
    const visited = new Set<string>([node.id])
    let parentId = node.parentId
    while (parentId) {
      if (visited.has(parentId)) throw new Error('布景快照包含循环层级')
      visited.add(parentId)
      const parent = nodes[parentId as AnyNodeId]
      parentId = parent?.parentId ?? null
    }
  }
  const materials: SceneSnapshot['materials'] = {}
  for (const [id, value] of Object.entries(snapshot.materials)) {
    const material = SceneMaterial.parse(value)
    if (id !== material.id) throw new Error('布景快照表面 ID 不匹配')
    materials[id as SceneMaterialId] = material
  }
  const collections: SceneSnapshot['collections'] = {}
  for (const [id, value] of Object.entries(snapshot.collections)) {
    const collection = collectionSchema.parse(value)
    if (id !== collection.id || collection.nodeIds.some((nodeId) => !nodes[nodeId as AnyNodeId]))
      throw new Error('布景快照分组引用无效')
    collections[id as CollectionId] = collection as Collection
  }
  return {
    nodes,
    rootNodeIds: roots,
    materials,
    collections,
    installedPlugins: snapshot.installedPlugins,
  }
}

export function restoreRehearsalTake(takeId: string): TheatreDocument {
  assertTheatreWritable()
  const current = readTheatreDocument()
  const take = current?.takes.find((entry) => entry.id === takeId)
  if (!current || !take) throw new Error('排演版本不存在')
  const snapshot = parseSnapshot(take.stage)
  const document = TheatreDocumentSchema.parse({ ...take.document, takes: current.takes })
  const live = useScene.getState()
  for (const id of snapshot.rootNodeIds) {
    const node = snapshot.nodes[id]!
    node.metadata = { ...node.metadata, ...live.nodes[id]?.metadata }
    delete node.metadata[THEATRE_METADATA_KEY]
  }
  const site = rootSite(snapshot.nodes, snapshot.rootNodeIds)
  site.metadata = { ...site.metadata, [THEATRE_METADATA_KEY]: document }
  for (const scene of document.scenes) {
    for (const prop of scene.props)
      if (prop.nodeId && !snapshot.nodes[prop.nodeId as AnyNodeId])
        throw new Error('版本道具的关联物件缺失')
  }
  live.setScene(snapshot.nodes, snapshot.rootNodeIds, {
    materials: snapshot.materials,
    collections: snapshot.collections,
    installedPlugins: snapshot.installedPlugins,
    hasExplicitPluginInstallState: live.hasExplicitPluginInstallState,
  })
  return document
}
