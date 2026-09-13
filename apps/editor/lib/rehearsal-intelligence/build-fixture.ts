import type { SceneGraph } from '@pascal-app/core'
import { commandMeta } from '../stage/command-executor'
import { makeScenery } from '../stage/scenery'

// These authority regressions edit a legacy scene, independently of the unavailable new GLBs.
export function withLegacyTable(graph: SceneGraph): SceneGraph {
  const level = Object.values(graph.nodes).find((node) => node.type === 'level')!
  const [table] = makeScenery(
    {
      type: 'AddScenery',
      meta: commandMeta(),
      nodeId: 'legacy-test-table',
      name: '圆桌',
      kind: 'round-table',
      libraryAssetId: null,
      dimensionsMeters: { width: 1.2, height: 0.75, depth: 1.2 },
      transform: { position: { x: 0, y: 0, z: 3 }, rotationDegrees: { x: 0, y: 0, z: 0 } },
    },
    level.id,
    [0, 0, 0],
    [0, 0, 0],
  )
  if (table?.type !== 'block') throw new Error('Expected legacy block fixture')
  graph.nodes[table.id] = table
  level.children.push(table.id)
  return graph
}
