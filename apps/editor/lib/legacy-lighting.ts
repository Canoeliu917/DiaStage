function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isLegacyLight(node: unknown): boolean {
  if (!record(node)) return false
  if (record(node.metadata) && node.metadata.theatreKind === 'light') return true
  if (
    typeof node.type === 'string' &&
    /^streetscape:.*(?:light|lantern|luminaire|floodlight-pole)$/.test(node.type)
  )
    return true
  if (node.type !== 'item' || !record(node.asset)) return false
  const { asset } = node
  return (
    asset.category === 'lighting' ||
    (record(asset.interactive) &&
      Array.isArray(asset.interactive.effects) &&
      asset.interactive.effects.some((effect) => record(effect) && effect.kind === 'light')) ||
    (typeof asset.id === 'string' &&
      /^(table-lamp|floor-lamp|ceiling-lamp|recessed-light)$/.test(asset.id))
  )
}

/** Operates on raw graphs: unknown old node payloads are retained, never schema-stripped. */
export function archiveLegacyLighting<
  T extends {
    nodes: Record<string, unknown>
    rootNodeIds: string[]
    collections?: Record<string, unknown>
  },
>(graph: T, browserLighting?: string | null): T {
  const removed = new Set(
    Object.entries(graph.nodes)
      .filter(([, node]) => isLegacyLight(node))
      .map(([id]) => id),
  )
  let grew = true
  while (grew) {
    grew = false
    for (const [id, node] of Object.entries(graph.nodes)) {
      if (
        record(node) &&
        typeof node.parentId === 'string' &&
        removed.has(node.parentId) &&
        !removed.has(id)
      ) {
        removed.add(id)
        grew = true
      }
    }
  }
  const siteId = graph.rootNodeIds.find(
    (id) => record(graph.nodes[id]) && graph.nodes[id].type === 'site',
  )
  if (!siteId || (!removed.size && !browserLighting)) return graph
  const copy = structuredClone(graph),
    site = copy.nodes[siteId]
  if (!record(site)) return graph
  const metadata = record(site.metadata) ? site.metadata : {}
  site.metadata = metadata
  const legacy = record(metadata.legacy) ? metadata.legacy : {}
  const archived = record(legacy.lightingNodes) ? legacy.lightingNodes : {}
  const collections = record(legacy.lightingCollections) ? legacy.lightingCollections : {}
  for (const id of removed) {
    archived[id] = copy.nodes[id]
    delete copy.nodes[id]
  }
  for (const node of Object.values(copy.nodes))
    if (record(node) && Array.isArray(node.children))
      node.children = node.children.filter((id) => !removed.has(id))
  for (const [id, collection] of Object.entries(copy.collections ?? {})) {
    if (!record(collection) || !Array.isArray(collection.nodeIds)) continue
    if (collection.nodeIds.some((id) => removed.has(id))) {
      collections[id] = structuredClone(collection)
      collection.nodeIds = collection.nodeIds.filter((id) => !removed.has(id))
    }
  }
  metadata.legacy = {
    ...legacy,
    ...(removed.size ? { lightingNodes: archived, lightingCollections: collections } : {}),
    ...(browserLighting ? { lightingStorage: browserLighting } : {}),
  }
  return copy
}
