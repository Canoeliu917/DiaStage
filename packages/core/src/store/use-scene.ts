'use client'

import type { TemporalState } from 'zundo'
import { temporal } from 'zundo'
import { create, type StoreApi, type UseBoundStore } from 'zustand'
import { parseMaterialRef, toSceneMaterialRef } from '../material-library'
import { getNodePluginId, isNodeKindEnabled, nodeRegistry } from '../registry/registry'
import { BuildingNode } from '../schema'
import type { Collection, CollectionId } from '../schema/collections'
import { generateCollectionId } from '../schema/collections'
import { compiledNodeSchema } from '../schema/compiled-node-parsers'
import { DoorNode as DoorNodeSchema } from '../schema/nodes/door'
import { LevelNode, normalizeLevelBaseElevation } from '../schema/nodes/level'
import { ShelfNode as ShelfNodeSchema } from '../schema/nodes/shelf'
import { SiteNode } from '../schema/nodes/site'
import {
  getEffectiveStairSurfaceMaterial,
  StairNode as StairNodeSchema,
} from '../schema/nodes/stair'
import { StairSegmentNode as StairSegmentNodeSchema } from '../schema/nodes/stair-segment'
import { getEffectiveWallSurfaceMaterial, type WallSurfaceSide } from '../schema/nodes/wall'
import { WindowNode as WindowNodeSchema } from '../schema/nodes/window'
import {
  generateSceneMaterialId,
  SceneMaterial,
  type SceneMaterialId,
} from '../schema/scene-material'
import { type AnyNode, type AnyNodeId, AnyNode as AnyNodeSchema } from '../schema/types'
import { healSceneNodes } from '../utils/heal-scene-graph'
import { removeRetiredDrawingSheetNodes } from '../utils/retired-scene-nodes'
import { migrateVerticalSceneNodes } from '../utils/vertical-scene-migration'
import * as nodeActions from './actions/node-actions'
import {
  areSceneSnapshotsEqual,
  getSceneHistoryPauseDepth,
  notifySceneCommit,
  pauseSceneHistory,
  resetSceneHistoryPauseDepth,
  resumeSceneHistory,
  type SceneCommitOrigin,
  type SceneSnapshot,
} from './history-control'
import { dispatchSceneMutation, type NodeChanges } from './scene-mutation'
import useLiveNodeOverrides from './use-live-node-overrides'
import useLiveTransforms from './use-live-transforms'

function getFiniteNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function getFiniteNumberInRange(value: unknown, fallback: number, min: number, max: number) {
  const finite = getFiniteNumber(value, fallback)
  return Math.min(Math.max(finite, min), max)
}

function getBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback
}

function getEnumValue<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  fallback: T[number],
): T[number] {
  return typeof value === 'string' && allowed.includes(value) ? value : fallback
}

function getStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : []
}

function getVector3(value: unknown, fallback: [number, number, number]): [number, number, number] {
  if (!Array.isArray(value) || value.length < 3) {
    return fallback
  }

  return [
    getFiniteNumber(value[0], fallback[0]),
    getFiniteNumber(value[1], fallback[1]),
    getFiniteNumber(value[2], fallback[2]),
  ]
}

function normalizeStairNode(node: Record<string, unknown>) {
  const hasTotalRise = 'totalRise' in node
  const sanitized = {
    ...node,
    position: getVector3(node.position, [0, 0, 0]),
    rotation: getFiniteNumber(node.rotation, 0),
    width: getFiniteNumber(node.width, 1.2),
    totalRise: hasTotalRise ? getFiniteNumber(node.totalRise, 0.45) : undefined,
    stepCount: getFiniteNumber(node.stepCount, 3),
    children: getStringArray(node.children),
  }

  const parsed = compiledNodeSchema(StairNodeSchema).safeParse(sanitized)
  if (!parsed.success) return null
  if (hasTotalRise) return parsed.data
  const { totalRise: _totalRise, ...rest } = parsed.data
  return rest
}

function normalizeStairSegmentNode(node: Record<string, unknown>) {
  const sanitized = {
    ...node,
    width: getFiniteNumber(node.width, 1.2),
    length: getFiniteNumber(node.length, 0.9),
    height: getFiniteNumber(node.height, 0.45),
    stepCount: getFiniteNumber(node.stepCount, 3),
  }

  const parsed = compiledNodeSchema(StairSegmentNodeSchema).safeParse(sanitized)
  return parsed.success ? parsed.data : null
}

function normalizeDoorNode(node: Record<string, unknown>) {
  const parsed = compiledNodeSchema(DoorNodeSchema).safeParse(node)
  return parsed.success ? { ...node, ...parsed.data } : null
}

// Windows saved before a schema field existed (e.g. `columnRatios`/`rowRatios`/
// `frameThickness`) load without it; the mesh builder then reads undefined and
// throws every frame. Zod-parse on load so schema defaults land, like doors.
function normalizeWindowNode(node: Record<string, unknown>) {
  const parsed = compiledNodeSchema(WindowNodeSchema).safeParse(node)
  return parsed.success ? { ...node, ...parsed.data } : null
}

function normalizeShelfNode(node: Record<string, unknown>) {
  const sanitized = {
    ...node,
    children: getStringArray(node.children),
    position: getVector3(node.position, [0, 0, 0]),
    rotation: getVector3(node.rotation, [0, 0, 0]),
    width: getFiniteNumberInRange(node.width, 1.2, 0.3, 3.0),
    depth: getFiniteNumberInRange(node.depth, 0.3, 0.1, 1.0),
    thickness: getFiniteNumberInRange(node.thickness, 0.04, 0.01, 0.1),
    height: getFiniteNumberInRange(node.height, 0.9, 0.05, 2.5),
    rows: Math.round(getFiniteNumberInRange(node.rows, 1, 1, 8)),
    columns: Math.round(getFiniteNumberInRange(node.columns, 1, 1, 6)),
    style: getEnumValue(
      node.style,
      ['wall-shelf', 'bookshelf', 'open-rack', 'cubby'] as const,
      'wall-shelf',
    ),
    withBack: getBoolean(node.withBack, false),
    withSides: getBoolean(node.withSides, true),
    withBottom: getBoolean(node.withBottom, false),
    bracketStyle: getEnumValue(
      node.bracketStyle,
      ['minimal', 'industrial', 'hidden'] as const,
      'minimal',
    ),
  }

  const parsed = compiledNodeSchema(ShelfNodeSchema).safeParse(sanitized)
  return parsed.success ? parsed.data : null
}

// Reuse an already-minted scene material for an identical inline legacy
// material so a whole building painted one custom colour collapses to one
// shared datablock (mirrors `commitSlotPaint`'s dedupe-on-match).
function findMintedSceneMaterialRef(
  material: unknown,
  mintedMaterials: Record<SceneMaterialId, SceneMaterial>,
): string | undefined {
  const target = JSON.stringify(material)
  for (const sceneMaterial of Object.values(mintedMaterials)) {
    if (JSON.stringify(sceneMaterial.material) === target) {
      return toSceneMaterialRef(sceneMaterial.id)
    }
  }
  return undefined
}

// Turn a legacy surface spec (`{ material, materialPreset }`) into a
// `MaterialRef`: a preset that's already a `library:`/`scene:` ref is used
// as-is; an inline material mints (or reuses) a scene material. Returns
// undefined when the spec carries no material. Shared by every legacy→slots
// migration below.
function legacySpecToMaterialRef(
  spec: { material?: unknown; materialPreset?: unknown },
  mintedMaterials: Record<SceneMaterialId, SceneMaterial>,
): string | undefined {
  if (typeof spec.materialPreset === 'string' && parseMaterialRef(spec.materialPreset)) {
    return spec.materialPreset
  }
  if (spec.material !== undefined) {
    const existing = findMintedSceneMaterialRef(spec.material, mintedMaterials)
    if (existing) return existing
    const id = generateSceneMaterialId()
    mintedMaterials[id] = {
      id,
      name: `Material ${Object.keys(mintedMaterials).length + 1}`,
      material: spec.material as SceneMaterial['material'],
    }
    return toSceneMaterialRef(id)
  }
  return undefined
}

// Move the retired inline `material*` / `interiorMaterial*` / `exteriorMaterial*`
// fields onto the unified `node.slots` model (interior / exterior → a
// `library:`/`scene:` ref), minting scene materials for inline customs into
// `mintedMaterials` (merged into the scene material map by the caller). Already
// slot-modelled walls and walls with no legacy material are left untouched.
function migrateWallSurfaceMaterials(
  node: Record<string, any>,
  mintedMaterials: Record<SceneMaterialId, SceneMaterial>,
) {
  if (node.slots && (node.slots.interior !== undefined || node.slots.exterior !== undefined)) {
    return node
  }

  const slots: Record<string, string> = { ...(node.slots ?? {}) }
  for (const side of ['interior', 'exterior'] as WallSurfaceSide[]) {
    const spec = getEffectiveWallSurfaceMaterial(
      node as Parameters<typeof getEffectiveWallSurfaceMaterial>[0],
      side,
    )
    const ref = legacySpecToMaterialRef(spec, mintedMaterials)
    if (ref) slots[side] = ref
  }

  if (Object.keys(slots).length === 0) {
    return node
  }

  return {
    ...node,
    slots,
    material: undefined,
    materialPreset: undefined,
    interiorMaterial: undefined,
    interiorMaterialPreset: undefined,
    exteriorMaterial: undefined,
    exteriorMaterialPreset: undefined,
  }
}

// Move a kind's single legacy `material` / `materialPreset` onto its declared
// slots. A pre-slot-model node painted one material rendered that material on
// every part (each slot resolves `node.slots[slot]` → legacy → default), so the
// migration writes the same ref to every slot id the kind can expose — unused
// conditional slots are harmless. Already slot-modelled or unpainted nodes are
// left untouched. Mirrors `migrateWallSurfaceMaterials` for single-surface and
// whole-object kinds (slab, fence, shelf).
function migrateSingleMaterialSlots(
  node: Record<string, any>,
  slotIds: readonly string[],
  mintedMaterials: Record<SceneMaterialId, SceneMaterial>,
) {
  if (node.slots && Object.keys(node.slots).length > 0) {
    return node
  }

  const ref = legacySpecToMaterialRef(
    { material: node.material, materialPreset: node.materialPreset },
    mintedMaterials,
  )
  if (!ref) {
    return node
  }

  const slots: Record<string, string> = {}
  for (const slotId of slotIds) slots[slotId] = ref

  return { ...node, slots, material: undefined, materialPreset: undefined }
}

// Map legacy step surface finishes into the two current paint slots.
function migrateStairSurfaceSlots(
  node: Record<string, any>,
  mintedMaterials: Record<SceneMaterialId, SceneMaterial>,
) {
  if (node.slots && Object.keys(node.slots).length > 0) {
    return node
  }

  const roleToSlot = [
    ['tread', 'treads'],
    ['side', 'body'],
  ] as const

  const slots: Record<string, string> = {}
  for (const [role, slotId] of roleToSlot) {
    const spec = getEffectiveStairSurfaceMaterial(
      node as Parameters<typeof getEffectiveStairSurfaceMaterial>[0],
      role,
    )
    const ref = legacySpecToMaterialRef(spec, mintedMaterials)
    if (ref) slots[slotId] = ref
  }

  if (Object.keys(slots).length === 0) {
    return node
  }

  return {
    ...node,
    slots,
    material: undefined,
    materialPreset: undefined,
    treadMaterial: undefined,
    treadMaterialPreset: undefined,
    sideMaterial: undefined,
    sideMaterialPreset: undefined,
  }
}

function migrateConstructionDimension(node: Record<string, any>) {
  const drawingOverrides = Array.isArray(node.drawingOverrides) ? node.drawingOverrides : []
  const hasLegacyDrawingOverride = drawingOverrides.some(
    (entry) =>
      entry &&
      typeof entry === 'object' &&
      !Array.isArray(entry) &&
      entry.presentation === 'reference',
  )
  if (!('reference' in node || 'referenceStyle' in node || hasLegacyDrawingOverride)) return node

  const { reference: _reference, referenceStyle: _referenceStyle, ...dimension } = node
  return {
    ...dimension,
    drawingOverrides: drawingOverrides.map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry
      return entry.presentation === 'reference' ? { ...entry, presentation: 'shown' } : entry
    }),
  }
}

function migrateWallAssembly(node: Record<string, any>) {
  if (!Object.hasOwn(node, 'assemblyLayers')) return node

  const assemblyThickness = Array.isArray(node.assemblyLayers)
    ? node.assemblyLayers.reduce((total: number, layer: unknown) => {
        if (!(layer && typeof layer === 'object')) return total
        const thickness = (layer as { thickness?: unknown }).thickness
        return typeof thickness === 'number' && Number.isFinite(thickness) && thickness > 0
          ? total + thickness
          : total
      }, 0)
    : 0
  const { assemblyLayers: _assemblyLayers, ...wall } = node
  return assemblyThickness > 0 ? { ...wall, thickness: assemblyThickness } : wall
}

function migrateBlockRename(
  id: string,
  node: Record<string, any>,
  nodes: Record<string, any>,
): [string, Record<string, any>] {
  if (node.type !== 'custom-mesh') return [id, node]

  const desiredId = id.startsWith('custom-mesh_') ? `block_${id.slice('custom-mesh_'.length)}` : id
  let nextId = desiredId
  let suffix = 1
  while (nextId !== id && nodes[nextId]) {
    nextId = `${desiredId}_${suffix}`
    suffix += 1
  }
  const nextNode = { ...node, id: nextId, type: 'block' }

  if (nextId !== id) {
    for (const candidate of Object.values(nodes)) {
      if (!candidate || typeof candidate !== 'object') continue
      if (candidate.parentId === id) candidate.parentId = nextId
      if (Array.isArray(candidate.children)) {
        candidate.children = candidate.children.map((childId: unknown) =>
          childId === id ? nextId : childId,
        )
      }
    }
  }

  return [nextId, nextNode]
}

function migrateBlockHostedItem(node: Record<string, any>) {
  if (
    node.type !== 'item' ||
    node.blockFaceId !== undefined ||
    node.customMeshFaceId === undefined
  ) {
    return node
  }

  const { customMeshFaceId, ...item } = node
  return { ...item, blockFaceId: customMeshFaceId }
}

function migrateNodes(nodes: Record<string, any>): {
  nodes: Record<string, AnyNode>
  mintedMaterials: Record<SceneMaterialId, SceneMaterial>
} {
  // Repair pre-existing corruption (null children, zero-length walls) before
  // any per-type migration runs, so already-saved scenes load cleanly.
  const { nodes: healed } = healSceneNodes(nodes)
  const { nodes: patchedNodes } = removeRetiredDrawingSheetNodes(healed as Record<string, any>)

  // Scene materials minted while moving legacy wall fields onto `node.slots`;
  // merged into the scene material map by the caller (`setScene`).
  const mintedMaterials: Record<SceneMaterialId, SceneMaterial> = {}

  for (const [id, node] of Object.entries(patchedNodes)) {
    const [nextId, nextNode] = migrateBlockRename(id, node, patchedNodes)
    if (nextId !== id) {
      delete patchedNodes[id]
    }
    patchedNodes[nextId] = migrateBlockHostedItem(nextNode)
  }

  for (const [id, node] of Object.entries(patchedNodes)) {
    // 1. Item scale migration
    if (node.type === 'item' && !('scale' in node)) {
      patchedNodes[id] = { ...node, scale: [1, 1, 1] }
    }
    if (node.type === 'door') {
      const normalized = normalizeDoorNode(node)
      if (normalized) {
        patchedNodes[id] = normalized
      }
    }

    if (node.type === 'window') {
      const normalized = normalizeWindowNode(node)
      if (normalized) {
        patchedNodes[id] = normalized
      }
    }

    if (node.type === 'construction-dimension') {
      patchedNodes[id] = migrateConstructionDimension(node)
    }

    if (node.type === 'stair') {
      const normalized = normalizeStairNode(node)
      if (normalized) {
        patchedNodes[id] = normalized
      }
      patchedNodes[id] = migrateStairSurfaceSlots(patchedNodes[id], mintedMaterials)
    }

    if (node.type === 'stair-segment') {
      const normalized = normalizeStairSegmentNode(node)
      if (normalized) {
        patchedNodes[id] = normalized
      }
    }

    if (node.type === 'wall') {
      patchedNodes[id] = migrateWallSurfaceMaterials(
        migrateWallAssembly(patchedNodes[id]),
        mintedMaterials,
      )
    }

    if (node.type === 'slab') {
      patchedNodes[id] = migrateSingleMaterialSlots(patchedNodes[id], ['surface'], mintedMaterials)
    }

    if (node.type === 'fence') {
      patchedNodes[id] = migrateSingleMaterialSlots(
        patchedNodes[id],
        ['posts', 'infill', 'base', 'rail'],
        mintedMaterials,
      )
    }

    if (node.type === 'shelf') {
      const normalized = normalizeShelfNode(node)
      if (normalized) {
        patchedNodes[id] = normalized
      }
      patchedNodes[id] = migrateSingleMaterialSlots(
        patchedNodes[id],
        ['shelves', 'frame', 'back'],
        mintedMaterials,
      )
    }

    // Legacy: site.children used to hold nested BuildingNode / ItemNode
    // objects (see the SiteNode schema before the children-as-ids fix).
    // Flatten any leftover nested children into ids, and absorb the
    // embedded nodes into the flat map so the rest of the loader can
    // treat the site like every other parent.
    if (node.type === 'site' && Array.isArray(node.children)) {
      let needsFlatten = false
      const flattened: string[] = []
      for (const child of node.children) {
        if (typeof child === 'string') {
          flattened.push(child)
        } else if (child && typeof child === 'object' && typeof child.id === 'string') {
          needsFlatten = true
          flattened.push(child.id)
          if (!patchedNodes[child.id]) {
            patchedNodes[child.id] = { ...child, parentId: id }
          }
        }
      }
      if (needsFlatten) {
        patchedNodes[id] = { ...node, children: flattened }
      }
    }

    // Level children normalization.
    // Pre-0.9.1 JSONs may carry child IDs that no longer exist in the node
    // map (e.g. elevator IDs that lived under a level before the elevator
    // parent migration moved them up to building). If those dangling IDs are
    // left in place, collectReachableNodeIds marks the level as having
    // reachable children that don't exist, which corrupts the scene graph
    // traversal and leaves the LevelNode in a broken state — making floors
    // impossible to drag or delete after import.
    // We intentionally do NOT filter by type prefix here; being permissive
    // about which types are allowed as children prevents data loss when new
    // child types are added to the schema in the future.
    if (node.type === 'level') {
      const rawChildren = getStringArray(node.children)
      const validChildren = rawChildren.filter((childId) => {
        const exists = Boolean(patchedNodes[childId])
        if (!exists) {
          console.warn(
            '[migrateNodes] level',
            id,
            'references missing child',
            childId,
            '— dropping',
          )
        }
        return exists
      })
      const levelNumber = getFiniteNumber(node.level, 0)
      patchedNodes[id] = {
        ...node,
        baseElevation: normalizeLevelBaseElevation(node.baseElevation),
        level: levelNumber,
        children: validChildren,
      }
    }
  }

  const vertical = migrateVerticalSceneNodes(patchedNodes)
  return { nodes: vertical.nodes as Record<string, AnyNode>, mintedMaterials }
}

function getNodeChildIds(node: AnyNode): AnyNodeId[] {
  if (!('children' in node && Array.isArray(node.children))) {
    return []
  }

  return (node.children as unknown[])
    .map((child) => {
      if (typeof child === 'string') return child
      if (child && typeof child === 'object' && 'id' in child && typeof child.id === 'string') {
        return child.id
      }
      return null
    })
    .filter((id): id is AnyNodeId => typeof id === 'string')
}

function normalizeRootNodeIds(
  nodes: Record<AnyNodeId, AnyNode>,
  rootNodeIds: AnyNodeId[],
): AnyNodeId[] {
  const existingRootIds = rootNodeIds.filter((id) => Boolean(nodes[id]))
  const siteRootIds = existingRootIds.filter((id) => nodes[id]?.type === 'site')

  if (siteRootIds.length > 0) {
    return siteRootIds
  }

  return existingRootIds.filter((id) => nodes[id]?.parentId === null)
}

function collectReachableNodeIds(
  nodes: Record<AnyNodeId, AnyNode>,
  rootNodeIds: AnyNodeId[],
): Set<AnyNodeId> {
  const reachable = new Set<AnyNodeId>()
  const stack = [...rootNodeIds]
  const childIdsByParentId = new Map<AnyNodeId, AnyNodeId[]>()

  for (const node of Object.values(nodes)) {
    if (!node.parentId) continue
    const parentId = node.parentId as AnyNodeId
    const children = childIdsByParentId.get(parentId) ?? []
    children.push(node.id as AnyNodeId)
    childIdsByParentId.set(parentId, children)
  }

  while (stack.length > 0) {
    const id = stack.pop()
    if (!id || reachable.has(id)) continue

    const node = nodes[id]
    if (!node) continue

    reachable.add(id)
    stack.push(...getNodeChildIds(node))
    stack.push(...(childIdsByParentId.get(id) ?? []))
  }

  return reachable
}

export type SceneState = {
  // 1. The Data: A flat dictionary of all nodes
  nodes: Record<AnyNodeId, AnyNode>

  // 2. The Root: Which nodes are at the top level?
  rootNodeIds: AnyNodeId[]

  // 3. The "Dirty" Set: For the Wall/Physics systems
  dirtyNodes: Set<AnyNodeId>

  // 4. Relational metadata — not nodes
  collections: Record<CollectionId, Collection>
  materials: Record<SceneMaterialId, SceneMaterial>
  installedPlugins: string[]
  hasExplicitPluginInstallState: boolean

  // 5. Read-only lock — when true all create/update/delete operations are no-ops
  readOnly: boolean
  setReadOnly: (readOnly: boolean) => void

  // Actions
  loadScene: () => void
  clearScene: () => void
  unloadScene: () => void
  setScene: (
    nodes: Record<AnyNodeId, AnyNode>,
    rootNodeIds: AnyNodeId[],
    extra?: {
      collections?: Record<CollectionId, Collection>
      materials?: Record<SceneMaterialId, SceneMaterial>
      installedPlugins?: string[]
      hasExplicitPluginInstallState?: boolean
    },
  ) => void
  setInstalledPlugins: (pluginIds: string[], options?: { explicit?: boolean }) => void

  markDirty: (id: AnyNodeId) => void
  clearDirty: (id: AnyNodeId) => void

  createNode: (node: AnyNode, parentId?: AnyNodeId) => void
  createNodes: (ops: { node: AnyNode; parentId?: AnyNodeId }[]) => void
  applyNodeChanges: (changes: NodeChanges) => void

  updateNode: (id: AnyNodeId, data: Partial<AnyNode>) => void
  updateNodes: (updates: { id: AnyNodeId; data: Partial<AnyNode> }[]) => void

  deleteNode: (id: AnyNodeId) => void
  deleteNodes: (ids: AnyNodeId[]) => void

  // Collection actions
  createCollection: (name: string, nodeIds?: AnyNodeId[]) => CollectionId
  deleteCollection: (id: CollectionId) => void
  updateCollection: (id: CollectionId, data: Partial<Omit<Collection, 'id'>>) => void
  addToCollection: (id: CollectionId, nodeId: AnyNodeId) => void
  removeFromCollection: (id: CollectionId, nodeId: AnyNodeId) => void

  // Scene material actions
  addSceneMaterial: (material: SceneMaterial) => void
  updateSceneMaterial: (id: SceneMaterialId, data: Partial<Omit<SceneMaterial, 'id'>>) => void
  removeSceneMaterial: (id: SceneMaterialId) => void
}

// type PartializedStoreState = Pick<SceneState, 'rootNodeIds' | 'nodes'>;

type UseSceneStore = UseBoundStore<StoreApi<SceneState>> & {
  temporal: StoreApi<
    TemporalState<
      Pick<SceneState, 'nodes' | 'rootNodeIds' | 'collections' | 'materials' | 'installedPlugins'>
    >
  >
}

function sceneHistorySnapshotFromState(
  state: Pick<
    SceneState,
    'nodes' | 'rootNodeIds' | 'collections' | 'materials' | 'installedPlugins'
  >,
): SceneSnapshot {
  const { nodes, rootNodeIds, collections, materials, installedPlugins } = state
  // Fresh placement nodes are renderable drafts, not document history. Excluding their
  // entire subtree here protects both local undo and external commit subscribers.
  const transientNodeIds = new Set<AnyNodeId>()
  for (const node of Object.values(nodes)) {
    const metadata = node.metadata
    if (
      metadata &&
      typeof metadata === 'object' &&
      !Array.isArray(metadata) &&
      (metadata as Record<string, unknown>).isNew === true
    ) {
      transientNodeIds.add(node.id)
    }
  }

  if (transientNodeIds.size === 0) {
    return { nodes, rootNodeIds, collections, materials, installedPlugins }
  }

  const childIdsByParentId = new Map<AnyNodeId, Set<AnyNodeId>>()
  const addChild = (parentId: AnyNodeId, childId: AnyNodeId) => {
    const childIds = childIdsByParentId.get(parentId) ?? new Set<AnyNodeId>()
    childIds.add(childId)
    childIdsByParentId.set(parentId, childIds)
  }
  for (const node of Object.values(nodes)) {
    if (node.parentId) addChild(node.parentId as AnyNodeId, node.id)
    for (const childId of getNodeChildIds(node)) addChild(node.id, childId)
  }

  const pendingIds = [...transientNodeIds]
  while (pendingIds.length > 0) {
    const parentId = pendingIds.pop()
    if (!parentId) continue
    for (const childId of childIdsByParentId.get(parentId) ?? []) {
      if (transientNodeIds.has(childId)) continue
      transientNodeIds.add(childId)
      pendingIds.push(childId)
    }
  }

  const historyNodes = {} as Record<AnyNodeId, AnyNode>
  for (const [id, node] of Object.entries(nodes) as [AnyNodeId, AnyNode][]) {
    if (transientNodeIds.has(id)) continue
    if (!('children' in node && Array.isArray(node.children))) {
      historyNodes[id] = node
      continue
    }
    const children = (node.children as AnyNodeId[]).filter(
      (childId) => !transientNodeIds.has(childId),
    )
    historyNodes[id] =
      children.length === node.children.length ? node : ({ ...node, children } as AnyNode)
  }

  const historyCollections = {} as Record<CollectionId, Collection>
  for (const [id, collection] of Object.entries(collections) as [CollectionId, Collection][]) {
    const nodeIds = collection.nodeIds.filter((nodeId) => !transientNodeIds.has(nodeId))
    if (collection.controlNodeId && transientNodeIds.has(collection.controlNodeId)) {
      const { controlNodeId: _controlNodeId, ...rest } = collection
      historyCollections[id] = { ...rest, nodeIds }
    } else {
      historyCollections[id] =
        nodeIds.length === collection.nodeIds.length ? collection : { ...collection, nodeIds }
    }
  }

  return {
    nodes: historyNodes,
    rootNodeIds: rootNodeIds.filter((id) => !transientNodeIds.has(id)),
    collections: historyCollections,
    materials,
    installedPlugins,
  }
}

/**
 * A dirty mark is a promise that some system will rebuild the node and clear
 * the mark, so marks are only accepted for kinds with a dirty consumer: kinds
 * with `dirtyTracking: false` (and kinds of disabled plugins) have none, and
 * a mark for them would sit in the set for the whole session and defeat every
 * consumer's empty-set early exit. Ids without a node pass: tools mark nodes
 * they are about to create.
 */
function isDirtyTrackable(
  id: AnyNodeId,
  scene: Pick<SceneState, 'nodes' | 'installedPlugins'>,
): boolean {
  const node = scene.nodes[id]
  if (!node) return true
  if (!isNodeKindEnabled(node.type, scene.installedPlugins)) return false
  return nodeRegistry.get(node.type)?.dirtyTracking !== false
}

/**
 * `markDirty` always applied the consumer-kind guard, but many call sites add
 * to the raw set directly (that is how stuck `level` marks got in) — enforcing
 * it in `add` itself keeps them all honest.
 */
class GuardedDirtySet extends Set<AnyNodeId> {
  private readonly getScene: () => Pick<SceneState, 'nodes' | 'installedPlugins'>

  constructor(
    getScene: () => Pick<SceneState, 'nodes' | 'installedPlugins'>,
    from?: Iterable<AnyNodeId>,
  ) {
    super()
    this.getScene = getScene
    if (from) for (const id of from) this.add(id)
  }

  override add(id: AnyNodeId): this {
    if (!isDirtyTrackable(id, this.getScene())) return this
    return super.add(id)
  }
}

const useScene: UseSceneStore = create<SceneState>()(
  temporal(
    (set, get) => ({
      // 1. Flat dictionary of all nodes
      nodes: {},

      // 2. Root node IDs
      rootNodeIds: [],

      // 3. Dirty set
      dirtyNodes: new GuardedDirtySet(get),

      // 4. Collections
      collections: {} as Record<CollectionId, Collection>,
      materials: {} as Record<SceneMaterialId, SceneMaterial>,
      installedPlugins: [],
      hasExplicitPluginInstallState: false,

      // 5. Read-only lock
      readOnly: false,
      setReadOnly: (readOnly: boolean) => set({ readOnly }),

      unloadScene: () => {
        set({
          nodes: {},
          rootNodeIds: [],
          dirtyNodes: new GuardedDirtySet(get),
          collections: {},
          materials: {},
          installedPlugins: [],
          hasExplicitPluginInstallState: false,
        })
      },

      clearScene: () => {
        const installedPlugins = get().installedPlugins
        const hasExplicitPluginInstallState = get().hasExplicitPluginInstallState
        get().unloadScene()
        get().loadScene() // Default scene
        set({ installedPlugins, hasExplicitPluginInstallState })
      },

      setScene: (nodes, rootNodeIds, extra) => {
        // Apply backward compatibility migrations
        const { nodes: patchedNodes, mintedMaterials } = migrateNodes(nodes)
        // Scene materials minted by the wall legacy→slots migration join the
        // loaded palette (existing refs win on id collision — there are none,
        // ids are freshly generated).
        const materials = { ...mintedMaterials, ...(extra?.materials ?? {}) }

        // Remove orphans: nodes whose parentId points to a non-existent node
        const cleanedNodes = { ...patchedNodes }
        for (const node of Object.values(cleanedNodes)) {
          if (node.parentId && !cleanedNodes[node.parentId]) {
            console.warn(
              '[Scene] Removing orphan node',
              node.id,
              '(parentId',
              node.parentId,
              'not found)',
            )
            delete cleanedNodes[node.id]
          }
        }

        const normalizedRootNodeIds = normalizeRootNodeIds(cleanedNodes, rootNodeIds)
        const reachableNodeIds = collectReachableNodeIds(cleanedNodes, normalizedRootNodeIds)
        if (normalizedRootNodeIds.length > 0) {
          for (const node of Object.values(cleanedNodes)) {
            if (reachableNodeIds.has(node.id as AnyNodeId)) continue
            console.warn('[Scene] Removing unreachable node', node.id)
            delete cleanedNodes[node.id]
          }
        }

        // Single tracked `set`: with zundo, every tracked write pushes the
        // pre-write state onto `pastStates`. Writing the scene in two steps
        // (as this used to) exposed a half-normalized intermediate state —
        // and the pre-load (possibly empty) state — as undo targets.
        set({
          nodes: cleanedNodes,
          rootNodeIds: normalizedRootNodeIds,
          dirtyNodes: new GuardedDirtySet(get),
          collections: extra?.collections ?? {},
          materials,
          installedPlugins: Array.from(new Set(extra?.installedPlugins ?? [])),
          hasExplicitPluginInstallState: extra?.hasExplicitPluginInstallState ?? false,
        })
        // Mark all nodes as dirty to trigger re-validation
        Object.values(cleanedNodes).forEach((node) => {
          get().markDirty(node.id)
        })
      },

      setInstalledPlugins: (pluginIds, options) => {
        if (get().readOnly) return
        const nextInstalledPlugins = Array.from(new Set(pluginIds))
        const previousInstalledPlugins = get().installedPlugins
        // Guard against the *next* plugin list: the store still holds the old
        // one, and re-marks for newly enabled kinds must pass the guard.
        const dirtyNodes = new GuardedDirtySet(
          () => ({ nodes: get().nodes, installedPlugins: nextInstalledPlugins }),
          get().dirtyNodes,
        )
        for (const node of Object.values(get().nodes)) {
          if (!getNodePluginId(node.type)) continue
          if (!isNodeKindEnabled(node.type, nextInstalledPlugins)) {
            dirtyNodes.delete(node.id)
          } else if (!isNodeKindEnabled(node.type, previousInstalledPlugins)) {
            if (nodeRegistry.get(node.type)?.dirtyTracking !== false) dirtyNodes.add(node.id)
          }
        }
        set({
          installedPlugins: nextInstalledPlugins,
          hasExplicitPluginInstallState: options?.explicit ?? get().hasExplicitPluginInstallState,
          dirtyNodes,
        })
      },

      loadScene: () => {
        if (get().rootNodeIds.length > 0) {
          // Assign all nodes as dirty to force re-validation
          Object.values(get().nodes).forEach((node) => {
            get().markDirty(node.id)
          })
          return // Scene already loaded
        }

        // Create hierarchy: Site → Building → Level. Parent links must be
        // written explicitly — the schema defaults `parentId` to null, and the
        // scene authority rejects parent/child asymmetry that the renderer
        // happily traverses through `children`.
        const site = SiteNode.parse({})
        const building = BuildingNode.parse({
          parentId: site.id,
        })
        const level0 = LevelNode.parse({
          parentId: building.id,
          level: 0,
          children: [],
          height: 2.5,
        })

        // Define all nodes flat
        const nodes: Record<AnyNodeId, AnyNode> = {
          [site.id]: { ...site, children: [building.id] },
          [building.id]: { ...building, children: [level0.id] },
          [level0.id]: level0,
        }

        // Site is the root
        const rootNodeIds = [site.id]

        set({ nodes, rootNodeIds })
      },

      markDirty: (id) => {
        // Guarded here too, not just in GuardedDirtySet.add — tests (and any
        // setState caller) can swap in a plain Set.
        if (!isDirtyTrackable(id, get())) return
        get().dirtyNodes.add(id)
      },

      clearDirty: (id) => {
        get().dirtyNodes.delete(id)
      },

      createNodes: (ops) =>
        dispatchSceneMutation(
          { create: ops },
          () => nodeActions.createNodesAction(set, get, ops),
          (changes) => nodeActions.applyNodeChangesAction(set, get, changes),
        ),
      createNode: (node, parentId) => get().createNodes([{ node, parentId }]),
      applyNodeChanges: (changes) =>
        dispatchSceneMutation(
          changes,
          () => nodeActions.applyNodeChangesAction(set, get, changes),
          (replacement) => nodeActions.applyNodeChangesAction(set, get, replacement),
        ),

      updateNodes: (updates) =>
        dispatchSceneMutation(
          { update: updates },
          () => nodeActions.updateNodesAction(set, get, updates),
          (changes) => nodeActions.applyNodeChangesAction(set, get, changes),
        ),
      updateNode: (id, data) => get().updateNodes([{ id, data }]),

      // --- DELETE ---

      deleteNodes: (ids) =>
        dispatchSceneMutation(
          { delete: ids },
          () => nodeActions.deleteNodesAction(set, get, ids),
          (changes) => nodeActions.applyNodeChangesAction(set, get, changes),
        ),

      deleteNode: (id) => get().deleteNodes([id]),

      // --- COLLECTIONS ---

      createCollection: (name, nodeIds = []) => {
        if (get().readOnly) return '' as CollectionId
        const id = generateCollectionId()
        const collection: Collection = { id, name, nodeIds }
        set((state) => {
          const nextCollections = { ...state.collections, [id]: collection }
          // Denormalize: stamp collectionId onto each node
          const nextNodes = { ...state.nodes }
          for (const nodeId of nodeIds) {
            const node = nextNodes[nodeId]
            if (!node) continue
            const existing =
              ('collectionIds' in node ? (node.collectionIds as CollectionId[]) : undefined) ?? []
            nextNodes[nodeId] = { ...node, collectionIds: [...existing, id] } as AnyNode
          }
          return { collections: nextCollections, nodes: nextNodes }
        })
        return id
      },

      deleteCollection: (id) => {
        if (get().readOnly) return
        set((state) => {
          const col = state.collections[id]
          const nextCollections = { ...state.collections }
          delete nextCollections[id]
          // Remove collectionId from all member nodes
          const nextNodes = { ...state.nodes }
          for (const nodeId of col?.nodeIds ?? []) {
            const node = nextNodes[nodeId]
            if (!(node && 'collectionIds' in node)) continue
            nextNodes[nodeId] = {
              ...node,
              collectionIds: (node.collectionIds as CollectionId[]).filter((cid) => cid !== id),
            } as AnyNode
          }
          return { collections: nextCollections, nodes: nextNodes }
        })
      },

      updateCollection: (id, data) => {
        if (get().readOnly) return
        set((state) => {
          const col = state.collections[id]
          if (!col) return state
          return { collections: { ...state.collections, [id]: { ...col, ...data } } }
        })
      },

      addToCollection: (id, nodeId) => {
        if (get().readOnly) return
        set((state) => {
          const col = state.collections[id]
          if (!col || col.nodeIds.includes(nodeId)) return state
          const nextCollections = {
            ...state.collections,
            [id]: { ...col, nodeIds: [...col.nodeIds, nodeId] },
          }
          const node = state.nodes[nodeId]
          if (!node) return { collections: nextCollections }
          const existing =
            ('collectionIds' in node ? (node.collectionIds as CollectionId[]) : undefined) ?? []
          const nextNodes = {
            ...state.nodes,
            [nodeId]: { ...node, collectionIds: [...existing, id] } as AnyNode,
          }
          return { collections: nextCollections, nodes: nextNodes }
        })
      },

      removeFromCollection: (id, nodeId) => {
        if (get().readOnly) return
        set((state) => {
          const col = state.collections[id]
          if (!col) return state
          const nextCollections = {
            ...state.collections,
            [id]: { ...col, nodeIds: col.nodeIds.filter((n) => n !== nodeId) },
          }
          const node = state.nodes[nodeId]
          if (!(node && 'collectionIds' in node)) return { collections: nextCollections }
          const nextNodes = {
            ...state.nodes,
            [nodeId]: {
              ...node,
              collectionIds: (node.collectionIds as CollectionId[]).filter((cid) => cid !== id),
            } as AnyNode,
          }
          return { collections: nextCollections, nodes: nextNodes }
        })
      },

      // --- SCENE MATERIALS ---

      addSceneMaterial: (material) => {
        if (get().readOnly) return
        set((state) => ({
          materials: { ...state.materials, [material.id]: material },
        }))
      },

      updateSceneMaterial: (id, data) => {
        if (get().readOnly) return
        set((state) => {
          const material = state.materials[id]
          if (!material) return state
          return { materials: { ...state.materials, [id]: { ...material, ...data } } }
        })
      },

      removeSceneMaterial: (id) => {
        if (get().readOnly) return
        set((state) => {
          const materials = { ...state.materials }
          delete materials[id]
          return { materials }
        })
      },
    }),
    {
      partialize: (state: SceneState) => sceneHistorySnapshotFromState(state),
      equality: (pastState, currentState) => areSceneSnapshotsEqual(pastState, currentState),
      onSave: (pastState, currentState) => {
        notifySceneCommit({
          origin: 'local',
          before: sceneHistorySnapshotFromState(pastState),
          current: sceneHistorySnapshotFromState(currentState),
        })
      },
      limit: 50, // Limit to last 50 actions
    },
  ),
)

export default useScene

let sceneReadOnlyLeaseCount = 0
let sceneReadOnlyLeaseBaseline = false

export function acquireSceneReadOnlyLease(): () => void {
  if (sceneReadOnlyLeaseCount === 0) {
    sceneReadOnlyLeaseBaseline = useScene.getState().readOnly
  }
  sceneReadOnlyLeaseCount += 1
  useScene.setState({ readOnly: true })

  let released = false
  return () => {
    if (released) return
    released = true
    sceneReadOnlyLeaseCount = Math.max(0, sceneReadOnlyLeaseCount - 1)
    if (sceneReadOnlyLeaseCount > 0) return
    useScene.setState({ readOnly: sceneReadOnlyLeaseBaseline })
    sceneReadOnlyLeaseBaseline = false
  }
}

export type SceneNodePatch = {
  id: AnyNodeId
  data: Partial<AnyNode>
  removeFields: string[]
}

export type SceneMaterialPatch = {
  id: SceneMaterialId
  material: SceneMaterial | null
}

export type ScenePatch = {
  materialChanges: SceneMaterialPatch[]
  nodeUpdates: SceneNodePatch[]
}

export type SceneNodeStructuralPatch = {
  node: AnyNode
  position: number
}

export type SceneOperationPatch = ScenePatch & {
  nodeCreates: SceneNodeStructuralPatch[]
  nodeDeletes: SceneNodeStructuralPatch[]
}

function sceneOperationPatchLiveConflictIds(
  beforeState: SceneState,
  changes: SceneOperationPatch,
): Set<AnyNodeId> {
  const ids = new Set<AnyNodeId>()
  const addNodeAndParent = (node: AnyNode | undefined) => {
    if (!node) return
    ids.add(node.id)
    if (node.parentId) ids.add(node.parentId as AnyNodeId)
  }
  for (const { id, data } of changes.nodeUpdates) {
    ids.add(id)
    if (Object.hasOwn(data, 'parentId')) {
      const currentParentId = beforeState.nodes[id]?.parentId
      if (currentParentId) ids.add(currentParentId as AnyNodeId)
      if (typeof data.parentId === 'string') ids.add(data.parentId as AnyNodeId)
    }
  }
  for (const { node } of changes.nodeCreates) addNodeAndParent(node)
  for (const { node } of changes.nodeDeletes) addNodeAndParent(node)
  return ids
}

function sceneOperationPatchHasLiveConflict(
  beforeState: SceneState,
  changes: SceneOperationPatch,
): boolean {
  const overrides = useLiveNodeOverrides.getState()
  const transforms = useLiveTransforms.getState()
  for (const id of sceneOperationPatchLiveConflictIds(beforeState, changes)) {
    if (overrides.get(id) || transforms.get(id)) return true
  }
  return false
}

function areScenePatchValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (typeof left !== typeof right || left === null || right === null) return false
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => areScenePatchValuesEqual(value, right[index]))
    )
  }
  if (typeof left !== 'object' || typeof right !== 'object') return false
  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const leftKeys = Object.keys(leftRecord)
  if (leftKeys.length !== Object.keys(rightRecord).length) return false
  return leftKeys.every(
    (key) =>
      Object.hasOwn(rightRecord, key) &&
      areScenePatchValuesEqual(leftRecord[key], rightRecord[key]),
  )
}

function parseSceneOperationPatchNode(value: unknown): AnyNode | null {
  const builtin = AnyNodeSchema.safeParse(value)
  if (builtin.success) return builtin.data
  if (!(value && typeof value === 'object' && !Array.isArray(value))) return null
  const type = (value as { type?: unknown }).type
  if (typeof type !== 'string') return null
  const registered = nodeRegistry.get(type)?.schema.safeParse(value)
  return registered?.success ? (registered.data as AnyNode) : null
}

function structuralSiblingIds(
  nodes: Record<AnyNodeId, AnyNode>,
  rootNodeIds: AnyNodeId[],
  parentId: AnyNodeId | null,
): AnyNodeId[] | null {
  if (!parentId) return rootNodeIds
  const parent = nodes[parentId]
  if (!(parent && 'children' in parent && Array.isArray(parent.children))) return null
  return parent.children.every((id) => typeof id === 'string')
    ? (parent.children as AnyNodeId[])
    : null
}

function insertSceneStructuralPlacements(
  base: AnyNodeId[],
  placements: readonly SceneNodeStructuralPatch[],
): AnyNodeId[] | null {
  if (placements.length === 0) return base
  const result = new Array<AnyNodeId | undefined>(base.length + placements.length)
  for (const change of placements) {
    if (
      !Number.isSafeInteger(change.position) ||
      change.position < 0 ||
      change.position >= result.length ||
      result[change.position] !== undefined
    ) {
      return null
    }
    result[change.position] = change.node.id
  }
  let baseIndex = 0
  for (let index = 0; index < result.length; index += 1) {
    if (result[index] !== undefined) continue
    result[index] = base[baseIndex]
    baseIndex += 1
  }
  return result as AnyNodeId[]
}

function sceneOperationPatchNextState(
  beforeState: SceneState,
  changes: SceneOperationPatch,
): Pick<SceneState, 'materials' | 'nodes' | 'rootNodeIds'> | null {
  const createIds = new Set<AnyNodeId>()
  const deleteIds = new Set<AnyNodeId>()
  const updateIds = new Set<AnyNodeId>()
  const materialIds = new Set<SceneMaterialId>()
  const parsedCreates: SceneNodeStructuralPatch[] = []

  for (const change of changes.nodeCreates) {
    const parsed = parseSceneOperationPatchNode(change.node)
    if (
      !parsed ||
      parsed.id !== change.node.id ||
      createIds.has(parsed.id) ||
      Object.hasOwn(beforeState.nodes, parsed.id) ||
      !Number.isSafeInteger(change.position) ||
      change.position < 0
    ) {
      return null
    }
    createIds.add(parsed.id)
    parsedCreates.push({ node: change.node, position: change.position })
  }
  for (const change of changes.nodeDeletes) {
    const id = change.node.id
    const current = beforeState.nodes[id]
    const parentId = (change.node.parentId as AnyNodeId | null | undefined) ?? null
    const siblings = structuralSiblingIds(beforeState.nodes, beforeState.rootNodeIds, parentId)
    if (
      !current ||
      createIds.has(id) ||
      deleteIds.has(id) ||
      !Number.isSafeInteger(change.position) ||
      change.position < 0 ||
      siblings?.[change.position] !== id ||
      !areScenePatchValuesEqual(current, change.node)
    ) {
      return null
    }
    deleteIds.add(id)
  }
  for (const id of createIds) {
    if (deleteIds.has(id)) return null
  }
  for (const node of Object.values(beforeState.nodes)) {
    const parentId = (node.parentId as AnyNodeId | null | undefined) ?? null
    if (parentId && deleteIds.has(parentId) && !deleteIds.has(node.id)) return null
  }

  const nextNodes = { ...beforeState.nodes }
  let nextRootNodeIds =
    deleteIds.size > 0
      ? beforeState.rootNodeIds.filter((id) => !deleteIds.has(id))
      : beforeState.rootNodeIds
  const changedParentIds = new Set<AnyNodeId>()
  for (const change of changes.nodeDeletes) {
    const parentId = (change.node.parentId as AnyNodeId | null | undefined) ?? null
    if (parentId && !deleteIds.has(parentId)) changedParentIds.add(parentId)
    delete nextNodes[change.node.id]
  }
  for (const parentId of changedParentIds) {
    const parent = nextNodes[parentId]
    if (!(parent && 'children' in parent && Array.isArray(parent.children))) return null
    nextNodes[parentId] = {
      ...parent,
      children: (parent.children as AnyNodeId[]).filter((id) => !deleteIds.has(id)),
    } as AnyNode
  }

  for (const change of parsedCreates) nextNodes[change.node.id] = change.node
  const rootCreates: SceneNodeStructuralPatch[] = []
  const existingParentCreates = new Map<AnyNodeId, SceneNodeStructuralPatch[]>()
  for (const change of parsedCreates) {
    const parentId = (change.node.parentId as AnyNodeId | null | undefined) ?? null
    if (!parentId) {
      rootCreates.push(change)
      continue
    }
    const parent = nextNodes[parentId]
    if (!parent) return null
    if (createIds.has(parentId)) {
      if (
        !('children' in parent) ||
        !Array.isArray(parent.children) ||
        parent.children[change.position] !== change.node.id
      ) {
        return null
      }
      continue
    }
    const placements = existingParentCreates.get(parentId) ?? []
    placements.push(change)
    existingParentCreates.set(parentId, placements)
  }
  const insertedRoots = insertSceneStructuralPlacements(nextRootNodeIds, rootCreates)
  if (!insertedRoots) return null
  nextRootNodeIds = insertedRoots
  for (const [parentId, placements] of existingParentCreates) {
    const parent = nextNodes[parentId]
    if (!(parent && 'children' in parent && Array.isArray(parent.children))) return null
    const children = insertSceneStructuralPlacements(parent.children as AnyNodeId[], placements)
    if (!children) return null
    nextNodes[parentId] = { ...parent, children } as AnyNode
  }
  for (const change of parsedCreates) {
    const parentId = (change.node.parentId as AnyNodeId | null | undefined) ?? null
    const siblings = structuralSiblingIds(nextNodes, nextRootNodeIds, parentId)
    if (siblings?.[change.position] !== change.node.id) return null
    if (!('children' in change.node && Array.isArray(change.node.children))) continue
    for (const childId of change.node.children as AnyNodeId[]) {
      if (nextNodes[childId]?.parentId !== change.node.id) return null
    }
  }

  for (const { id, data, removeFields } of changes.nodeUpdates) {
    const node = nextNodes[id]
    if (
      !node ||
      createIds.has(id) ||
      deleteIds.has(id) ||
      updateIds.has(id) ||
      ('id' in data && data.id !== node.id) ||
      ('type' in data && data.type !== node.type) ||
      ('object' in data && data.object !== node.object) ||
      removeFields.some(
        (field) =>
          field === 'id' || field === 'object' || field === 'type' || Object.hasOwn(data, field),
      )
    ) {
      return null
    }
    updateIds.add(id)
    const candidate = { ...node, ...data } as Record<string, unknown>
    for (const field of removeFields) delete candidate[field]
    const validated = parseSceneOperationPatchNode(candidate)
    if (
      !validated ||
      validated.id !== id ||
      validated.type !== node.type ||
      validated.object !== node.object
    ) {
      return null
    }
    nextNodes[id] = candidate as AnyNode
  }

  const materials =
    changes.materialChanges.length > 0 ? { ...beforeState.materials } : beforeState.materials
  for (const { id, material } of changes.materialChanges) {
    if (
      materialIds.has(id) ||
      (material !== null && (material.id !== id || !SceneMaterial.safeParse(material).success))
    ) {
      return null
    }
    materialIds.add(id)
    if (material === null) delete materials[id]
    else materials[id] = material
  }

  return { materials, nodes: nextNodes, rootNodeIds: nextRootNodeIds }
}

export function applySceneOperationPatch(changes: SceneOperationPatch): boolean {
  const beforeState = useScene.getState()
  if (
    changes.nodeUpdates.length === 0 &&
    changes.materialChanges.length === 0 &&
    changes.nodeCreates.length === 0 &&
    changes.nodeDeletes.length === 0
  ) {
    return false
  }
  if (sceneOperationPatchHasLiveConflict(beforeState, changes)) return false
  const next = sceneOperationPatchNextState(beforeState, changes)
  if (!next) return false

  const before = sceneHistorySnapshotFromState(beforeState)
  const shouldScopeHistoryPause =
    useScene.temporal.getState().isTracking || getSceneHistoryPauseDepth() > 0
  if (shouldScopeHistoryPause) pauseSceneHistory(useScene)
  try {
    useScene.setState(next)
  } finally {
    if (shouldScopeHistoryPause) resumeSceneHistory(useScene)
  }

  const currentState = useScene.getState()
  const current = sceneHistorySnapshotFromState(currentState)
  const touchedNodeIds = new Set<AnyNodeId>([
    ...changes.nodeUpdates.map(({ id }) => id),
    ...changes.nodeCreates.map(({ node }) => node.id),
    ...changes.nodeDeletes.map(({ node }) => node.id),
  ])
  for (const id of touchedNodeIds) {
    useLiveNodeOverrides.getState().clear(id)
    useLiveTransforms.getState().clear(id)
  }
  if (areSceneSnapshotsEqual(before, current)) return false

  for (const id of touchedNodeIds) {
    if (current.nodes[id]) currentState.markDirty(id)
    else currentState.clearDirty(id)
    const beforeParentId = before.nodes[id]?.parentId as AnyNodeId | null | undefined
    const currentParentId = current.nodes[id]?.parentId as AnyNodeId | null | undefined
    if (beforeParentId) currentState.markDirty(beforeParentId)
    if (currentParentId) currentState.markDirty(currentParentId)
  }
  const structuralParentIds = new Set<AnyNodeId>()
  for (const { node } of changes.nodeCreates) {
    if (node.parentId) structuralParentIds.add(node.parentId as AnyNodeId)
  }
  for (const { node } of changes.nodeDeletes) {
    if (node.parentId) structuralParentIds.add(node.parentId as AnyNodeId)
  }
  for (const parentId of structuralParentIds) {
    const parent = current.nodes[parentId]
    if (!(parent && 'children' in parent && Array.isArray(parent.children))) continue
    for (const childId of parent.children) currentState.markDirty(childId as AnyNodeId)
  }
  if (changes.materialChanges.length > 0) {
    const materialRefs = new Set(changes.materialChanges.map(({ id }) => toSceneMaterialRef(id)))
    for (const node of Object.values(current.nodes)) {
      const slots = 'slots' in node ? node.slots : undefined
      if (!(slots && Object.values(slots).some((ref) => materialRefs.has(ref)))) continue
      currentState.markDirty(node.id)
      if (node.parentId) currentState.markDirty(node.parentId as AnyNodeId)
    }
  }
  for (const { node } of changes.nodeDeletes) currentState.clearDirty(node.id)

  notifySceneCommit({
    origin: 'host',
    before,
    current,
  })
  return true
}

export function applyScenePatch(changes: ScenePatch): boolean {
  return applySceneOperationPatch({
    ...changes,
    nodeCreates: [],
    nodeDeletes: [],
  })
}

export type ApplySceneSnapshotOptions = {
  origin: Extract<SceneCommitOrigin, 'load' | 'host'>
}

export function applySceneSnapshot(
  snapshot: SceneSnapshot,
  options: ApplySceneSnapshotOptions,
): boolean {
  const before = sceneHistorySnapshotFromState(useScene.getState())
  const temporalState = useScene.temporal.getState()
  if (!temporalState.isTracking || getSceneHistoryPauseDepth() > 0) {
    throw new Error('Cannot replace the scene snapshot during an active interaction')
  }
  pauseSceneHistory(useScene)
  try {
    useScene.getState().setScene(snapshot.nodes, snapshot.rootNodeIds, {
      collections: snapshot.collections,
      installedPlugins: snapshot.installedPlugins,
      materials: snapshot.materials,
    })
    useScene.temporal.getState().clear()
  } finally {
    resumeSceneHistory(useScene)
  }

  useLiveNodeOverrides.getState().clearAll()
  useLiveTransforms.getState().clearAll()

  const current = sceneHistorySnapshotFromState(useScene.getState())
  if (areSceneSnapshotsEqual(before, current)) return false
  notifySceneCommit({ origin: options.origin, before, current })
  return true
}

// Track previous temporal state lengths and node snapshot for diffing
let prevPastLength = 0
let prevFutureLength = 0
let prevNodesSnapshot: Record<AnyNodeId, AnyNode> | null = null

export function clearSceneHistory() {
  resetSceneHistoryPauseDepth()
  // Resetting the pause-depth counter without resuming would strand the
  // temporal store in `isTracking: false` if a pause window was active when
  // the scene was (re)loaded — every edit after the load would then be
  // invisible to undo. Resume unconditionally so the cleared history starts
  // tracking from the loaded baseline.
  useScene.temporal.getState().resume()
  useScene.temporal.getState().clear()
  prevPastLength = 0
  prevFutureLength = 0
  prevNodesSnapshot = null
}

// Subscribe to the temporal store (Undo/Redo events)
useScene.temporal.subscribe((state) => {
  const currentPastLength = state.pastStates.length
  const currentFutureLength = state.futureStates.length

  // Undo: futureStates increases (state moved from past to future)
  // Redo: pastStates increases while futureStates decreases (state moved from future to past)
  const didUndo = currentFutureLength > prevFutureLength
  const didRedo = currentPastLength > prevPastLength && currentFutureLength < prevFutureLength

  if (didUndo || didRedo) {
    // Capture the previous snapshot before RAF fires
    const snapshotBefore = prevNodesSnapshot

    // Defer to a microtask so the scene store has settled before we diff,
    // but still mark walls/items dirty before the next paint.
    queueMicrotask(() => {
      const currentNodes = useScene.getState().nodes
      const { markDirty } = useScene.getState()

      if (snapshotBefore) {
        // Diff: only mark nodes that actually changed
        for (const [id, node] of Object.entries(currentNodes) as [AnyNodeId, AnyNode][]) {
          if (snapshotBefore[id] !== node) {
            markDirty(id)
            // Also mark parent so merged geometries update
            if (node.parentId) markDirty(node.parentId as AnyNodeId)
          }
        }
        // Nodes that were deleted (exist in prev but not current)
        for (const [id, node] of Object.entries(snapshotBefore) as [AnyNodeId, AnyNode][]) {
          if (!currentNodes[id]) {
            const parentId = node.parentId as AnyNodeId | undefined
            if (parentId) {
              markDirty(parentId)
              // Mark sibling nodes dirty so they can update their geometry
              // (e.g. adjacent walls need to recalculate miter/junction geometry)
              const parent = currentNodes[parentId]
              if (parent && 'children' in parent && Array.isArray(parent.children)) {
                for (const childId of parent.children) {
                  markDirty(childId as AnyNodeId)
                }
              }
            }
          }
        }
      } else {
        // No snapshot to diff against — fall back to marking all
        for (const node of Object.values(currentNodes)) {
          markDirty(node.id)
        }
      }

      // Undo/redo rewrites `nodes` without going through the delete actions,
      // so marks for nodes that no longer exist would sit in the set for the
      // rest of the session — no system clears a mark whose node is gone.
      const { dirtyNodes, clearDirty } = useScene.getState()
      for (const id of [...dirtyNodes]) {
        if (!currentNodes[id]) clearDirty(id)
      }
    })
  }

  // Update tracked lengths and snapshot
  prevPastLength = currentPastLength
  prevFutureLength = currentFutureLength
  prevNodesSnapshot = useScene.getState().nodes
})
