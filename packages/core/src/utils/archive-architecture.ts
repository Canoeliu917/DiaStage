function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

const LEGACY_STAIR_FIELDS = [
  'stairType',
  'fromLevelId',
  'toLevelId',
  'deckSlabId',
  'slabOpeningMode',
  'openingOffset',
  'thickness',
  'fillToFloor',
  'innerRadius',
  'sweepAngle',
  'topLandingMode',
  'topLandingDepth',
  'showCenterColumn',
  'showStepSupports',
  'railingMode',
  'railingHeight',
  'railingMaterial',
  'railingMaterialPreset',
] as const

const LEGACY_STAIR_SEGMENT_FIELDS = [
  'position',
  'rotation',
  'segmentType',
  'attachmentSide',
  'fillToFloor',
  'thickness',
] as const

const LEGACY_ROOM_ZONE_FIELDS = [
  'spaceRole',
  'roomNumber',
  'enclosureStatus',
  'floorFinish',
  'wallFinish',
  'ceilingFinish',
  'ceilingHeight',
  'occupancy',
  'clearDimensionPolicy',
] as const

function hasAnyField(node: Record<string, unknown>, fields: readonly string[]) {
  return fields.some((field) => field in node)
}

function archiveFields(
  node: Record<string, unknown>,
  fields: readonly string[],
  metadataKey: string,
) {
  const metadata = record(node.metadata) ? node.metadata : {}
  const legacy = record(metadata.legacy) ? metadata.legacy : {}
  const saved = record(legacy[metadataKey]) ? legacy[metadataKey] : {}
  for (const field of fields) {
    if (!(field in node)) continue
    saved[field] = structuredClone(node[field])
    delete node[field]
  }
  node.metadata = { ...metadata, legacy: { ...legacy, [metadataKey]: saved } }
}

export const ARCHIVED_ARCHITECTURE_TYPES = new Set([
  'lean-to-extension',
  'roof',
  'roof-segment',
  'ceiling',
  'dormer',
  'skylight',
  'chimney',
  'solar-panel',
  'box-vent',
  'ridge-vent',
  'turbine-vent',
  'cupola',
  'eyebrow-vent',
  'gutter',
  'downspout',
  'cabinet',
  'cabinet-module',
  'column',
  'duct-fitting',
  'duct-segment',
  'duct-terminal',
  'elevator',
  'hvac-equipment',
  'lineset',
  'liquid-line',
  'pipe-fitting',
  'pipe-segment',
  'pipe-trap',
  'structural-grid',
])

/** Preserve raw payloads before schema migration; opening a graph never writes it back. */
export function archiveArchitecture<
  T extends {
    nodes: Record<string, unknown>
    rootNodeIds: string[]
    collections?: Record<string, unknown>
  },
>(graph: T): T {
  const terrainSiteIds = Object.entries(graph.nodes)
    .filter(([, node]) => record(node) && node.type === 'site' && 'terrain' in node)
    .map(([id]) => id)
  const terrainFillNodeIds = Object.entries(graph.nodes)
    .filter(
      ([, node]) =>
        record(node) && (node.type === 'wall' || node.type === 'slab') && 'fillToTerrain' in node,
    )
    .map(([id]) => id)
  const simpleStairIds = Object.entries(graph.nodes)
    .filter(
      ([, node]) => record(node) && node.type === 'stair' && hasAnyField(node, LEGACY_STAIR_FIELDS),
    )
    .map(([id]) => id)
  const simpleStairSegmentIds = Object.entries(graph.nodes)
    .filter(
      ([, node]) =>
        record(node) &&
        node.type === 'stair-segment' &&
        hasAnyField(node, LEGACY_STAIR_SEGMENT_FIELDS),
    )
    .map(([id]) => id)
  const simpleZoneIds = Object.entries(graph.nodes)
    .filter(
      ([, node]) =>
        record(node) && node.type === 'zone' && hasAnyField(node, LEGACY_ROOM_ZONE_FIELDS),
    )
    .map(([id]) => id)
  const legacyOpeningSurfaceIds = Object.entries(graph.nodes)
    .filter(
      ([, node]) =>
        record(node) &&
        node.type === 'slab' &&
        Array.isArray(node.holes) &&
        Array.isArray(node.holeMetadata) &&
        node.holeMetadata.some(
          (entry) => record(entry) && (entry.source === 'stair' || entry.source === 'elevator'),
        ),
    )
    .map(([id]) => id)
  const archivedIds = new Set(
    Object.entries(graph.nodes)
      .filter(
        ([, node]) =>
          record(node) &&
          typeof node.type === 'string' &&
          ARCHIVED_ARCHITECTURE_TYPES.has(node.type),
      )
      .map(([id]) => id),
  )
  if (
    !archivedIds.size &&
    !terrainSiteIds.length &&
    !terrainFillNodeIds.length &&
    !simpleStairIds.length &&
    !simpleStairSegmentIds.length &&
    !simpleZoneIds.length &&
    !legacyOpeningSurfaceIds.length
  )
    return graph
  let changed = true
  while (changed) {
    changed = false
    for (const [id, node] of Object.entries(graph.nodes)) {
      if (record(node) && archivedIds.has(id) && Array.isArray(node.children)) {
        for (const childId of node.children) {
          if (typeof childId === 'string' && graph.nodes[childId] && !archivedIds.has(childId)) {
            archivedIds.add(childId)
            changed = true
          }
        }
      }
      if (
        record(node) &&
        !archivedIds.has(id) &&
        typeof node.parentId === 'string' &&
        archivedIds.has(node.parentId)
      ) {
        archivedIds.add(id)
        changed = true
      }
    }
  }
  const hostId =
    graph.rootNodeIds.find((id) => record(graph.nodes[id]) && graph.nodes[id].type === 'site') ??
    graph.rootNodeIds.find((id) => !archivedIds.has(id) && record(graph.nodes[id]))
  if (!hostId) throw new Error('旧建筑资料缺少可保存兼容归档的场地根节点；原始场景未改动。')
  const copy = structuredClone(graph)
  for (const id of terrainSiteIds) {
    const site = copy.nodes[id]
    if (!record(site) || !('terrain' in site)) continue
    const siteMetadata = record(site.metadata) ? site.metadata : {}
    const siteLegacy = record(siteMetadata.legacy) ? siteMetadata.legacy : {}
    site.metadata = {
      ...siteMetadata,
      legacy: { ...siteLegacy, terrain: structuredClone(site.terrain) },
    }
    delete site.terrain
  }
  for (const id of terrainFillNodeIds) {
    const node = copy.nodes[id]
    if (!record(node) || !('fillToTerrain' in node)) continue
    const nodeMetadata = record(node.metadata) ? node.metadata : {}
    const nodeLegacy = record(nodeMetadata.legacy) ? nodeMetadata.legacy : {}
    const terrainLegacy = record(nodeLegacy.terrain) ? nodeLegacy.terrain : {}
    node.metadata = {
      ...nodeMetadata,
      legacy: {
        ...nodeLegacy,
        terrain: { ...terrainLegacy, fillToTerrain: structuredClone(node.fillToTerrain) },
      },
    }
    delete node.fillToTerrain
  }
  for (const id of simpleStairIds) {
    const stair = copy.nodes[id]
    if (record(stair)) archiveFields(stair, LEGACY_STAIR_FIELDS, 'buildingStair')
  }
  for (const id of simpleStairSegmentIds) {
    const segment = copy.nodes[id]
    if (record(segment)) archiveFields(segment, LEGACY_STAIR_SEGMENT_FIELDS, 'buildingStair')
  }
  for (const id of simpleZoneIds) {
    const zone = copy.nodes[id]
    if (record(zone)) archiveFields(zone, LEGACY_ROOM_ZONE_FIELDS, 'buildingRoom')
  }
  for (const id of legacyOpeningSurfaceIds) {
    const surface = copy.nodes[id]
    if (!record(surface)) continue
    const holes = surface.holes
    const holeMetadata = surface.holeMetadata
    if (!Array.isArray(holes) || !Array.isArray(holeMetadata)) continue
    const metadata = record(surface.metadata) ? surface.metadata : {}
    const legacy = record(metadata.legacy) ? metadata.legacy : {}
    const buildingOpenings = holes.flatMap((hole, index) => {
      const entry = holeMetadata[index]
      return record(entry) && (entry.source === 'stair' || entry.source === 'elevator')
        ? [{ hole: structuredClone(hole), metadata: structuredClone(entry) }]
        : []
    })
    surface.metadata = { ...metadata, legacy: { ...legacy, buildingOpenings } }
    surface.holes = holes.filter((_, index) => {
      const entry = holeMetadata[index]
      return !(record(entry) && (entry.source === 'stair' || entry.source === 'elevator'))
    })
    surface.holeMetadata = holeMetadata.filter(
      (entry) => !(record(entry) && (entry.source === 'stair' || entry.source === 'elevator')),
    )
  }
  if (!archivedIds.size) return copy
  const host = copy.nodes[hostId]
  if (!record(host)) return graph
  const metadata = record(host.metadata) ? host.metadata : {}
  const legacy = record(metadata.legacy) ? metadata.legacy : {}
  const saved = record(legacy.architecture) ? legacy.architecture : {}
  const archived = record(saved.nodes) ? saved.nodes : {}
  const parentChildren = record(saved.parentChildren) ? saved.parentChildren : {}
  const collections = record(saved.collections) ? saved.collections : {}
  for (const id of archivedIds) {
    archived[id] = copy.nodes[id]
    delete copy.nodes[id]
  }
  for (const [id, node] of Object.entries(copy.nodes)) {
    if (
      record(node) &&
      Array.isArray(node.children) &&
      node.children.some((child) => archivedIds.has(child))
    ) {
      parentChildren[id] ??= structuredClone(node.children)
      node.children = node.children.filter((child) => !archivedIds.has(child))
    }
  }
  for (const [id, collection] of Object.entries(copy.collections ?? {})) {
    if (
      record(collection) &&
      Array.isArray(collection.nodeIds) &&
      collection.nodeIds.some((node) => archivedIds.has(node))
    ) {
      collections[id] ??= structuredClone(collection)
      collection.nodeIds = collection.nodeIds.filter((node) => !archivedIds.has(node))
    }
  }
  host.metadata = {
    ...metadata,
    legacy: {
      ...legacy,
      architecture: {
        ...saved,
        nodes: archived,
        parentChildren,
        collections,
        rootNodeIds: saved.rootNodeIds ?? [...graph.rootNodeIds],
      },
    },
  }
  copy.rootNodeIds = copy.rootNodeIds.filter((id) => !archivedIds.has(id))
  return copy
}
