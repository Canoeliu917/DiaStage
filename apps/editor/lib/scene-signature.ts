import type { SceneGraph } from '@pascal-app/editor'

export type PersistedSceneGraph = SceneGraph & {
  collections?: Record<string, unknown>
}

/**
 * Identity of a graph for echo detection, compared across a boundary that
 * normalizes: one side is a raw SSE payload, the other is the editor's state
 * after `applySceneGraphToEditor` ran. `setScene` always writes `collections`,
 * `materials` and `installedPlugins`, so a payload that omits them (MCP live
 * sync emits exactly that) has to serialize the same as the store that
 * defaulted them, or the echo reads as a local edit and gets saved back.
 *
 * Every field the PUT body carries has to appear here. A field that is
 * persisted but unsigned makes a local change to *only* that field
 * indistinguishable from an echo, and the save is skipped.
 */
export function sceneGraphSignature(graph: PersistedSceneGraph): string {
  return JSON.stringify({
    nodes: graph.nodes,
    rootNodeIds: graph.rootNodeIds,
    collections: graph.collections ?? {},
    materials: graph.materials ?? {},
    installedPlugins: graph.installedPlugins ?? [],
  })
}

export function hashSceneValue(label: string, input: unknown): string {
  const text = JSON.stringify(input)
  let value = 14695981039346656037n
  for (let index = 0; index < text.length; index++)
    value = BigInt.asUintN(64, (value ^ BigInt(text.charCodeAt(index))) * 1099511628211n)
  return `${label}-${value.toString(16).padStart(16, '0')}`
}

const BOOKKEEPING_METADATA = new Set([
  'diastageVersionSource',
  'diastageBuildDecision',
  'diastageRehearsalDecision',
  'diastageRemountDecision',
  'diastageRehearsalVersions',
  'diastageRestoredView',
  'stageTransaction',
  'remoteCommandReceipts',
  'remount',
  // Saved rehearsal snapshots already omit the read-only compatibility archive.
  'legacy',
])

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered)
  if (!record(value)) return value
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => [key, ordered(value[key])]),
  )
}

/** Exact persisted content, excluding receipts and saved previews that cannot change the stage. */
export function sceneContentVersion(graph: PersistedSceneGraph): string {
  const nodes = Object.fromEntries(
    Object.entries(graph.nodes).map(([id, node]) => [
      id,
      record(node) && record(node.metadata)
        ? {
            ...node,
            metadata: Object.fromEntries(
              Object.entries(node.metadata).filter(([key]) => !BOOKKEEPING_METADATA.has(key)),
            ),
          }
        : node,
    ]),
  )
  return hashSceneValue(
    'content-v1',
    ordered({
      nodes,
      rootNodeIds: graph.rootNodeIds,
      collections: graph.collections ?? {},
      materials: graph.materials ?? {},
      installedPlugins: graph.installedPlugins ?? [],
    }),
  )
}
