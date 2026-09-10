function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
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
])

/** Preserve raw payloads before schema migration; opening a graph never writes it back. */
export function archiveArchitecture<
  T extends {
    nodes: Record<string, unknown>
    rootNodeIds: string[]
    collections?: Record<string, unknown>
  },
>(graph: T): T {
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
  if (!archivedIds.size) return graph
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
