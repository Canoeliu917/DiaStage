import { writeFileSync } from 'node:fs'
import { ItemNode } from '@pascal-app/core'
import { createTheatreSceneGraph } from '../apps/editor/lib/theatre/new-production'
import { AVAILABLE_STAGE_SCENERY } from '../apps/editor/lib/stage/prop-assets'
const graph = createTheatreSceneGraph()
const level = Object.values(graph.nodes).find((node) => node.type === 'level')!
const ids: Record<string, string> = {}
for (const [name, assetId, x, z] of [
  ['QA chair', 'SCN-CHAIR-045', 0, 0],
  ['QA flat A', 'SCN-FLAT-090', -2, 0],
  ['QA flat B', 'SCN-FLAT-090', 2, 0],
  ['QA fold', 'SCN-FOLD-03', -2, -2],
] as const) {
  const entry = AVAILABLE_STAGE_SCENERY.find(({ asset }) => asset.id === assetId)!
  const node = ItemNode.parse({ asset: entry.asset, name, parentId: level.id, position: [x, 0, z], metadata: { stageKind: entry.kind } })
  graph.nodes[node.id] = node; level.children.push(node.id); ids[name] = node.id
}
writeFileSync('.local/ipad-v2-fixture.json', JSON.stringify({ graph, ids }))
console.log('QA fixture generated without reading or writing any scene database')


