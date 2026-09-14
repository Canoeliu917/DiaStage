import { ItemNode } from '@pascal-app/core'
import { createTheatreSceneGraph } from '../apps/editor/lib/theatre/new-production'
import { AVAILABLE_STAGE_SCENERY } from '../apps/editor/lib/stage/prop-assets'

const base = 'http://127.0.0.1:4329'
const id = `stage-interaction-qa-${Date.now()}`
const graph = createTheatreSceneGraph('三轴与堆叠验收（临时）')
const level = Object.values(graph.nodes).find((n) => n.type === 'level')!
for (const node of Object.values(graph.nodes)) if (node.type === 'slab') node.metadata.stageLocked = true
const assets = ['SCN-RISER-01', 'SCN-RISER-02', 'SCN-RISER-03', 'SCN-TABLE-120', 'SCN-CHAIR-045']
for (const [i, canonicalId] of assets.entries()) {
  const entry = AVAILABLE_STAGE_SCENERY.find((a) => a.asset.id === canonicalId)!
  if (!entry) throw new Error(canonicalId)
  const node = ItemNode.parse({ asset: entry.asset, name: entry.asset.name, parentId: level.id,
    position: [[-1.5, 0, 0], [0, 0, 0], [1.5, 0, 0], [-1.5, 0, 2], [1.5, 0, 2]][i],
    metadata: { stageKind: entry.kind } })
  graph.nodes[node.id] = node
  level.children.push(node.id)
}
const response = await fetch(`${base}/api/scenes`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ id, name: '三轴与堆叠验收（临时）', graph }) })
if (!response.ok) throw new Error(await response.text())
await Bun.write(new URL('../.local/stage-interaction-fixture.json', import.meta.url), JSON.stringify({ id, graph }, null, 2))
console.log(id)
