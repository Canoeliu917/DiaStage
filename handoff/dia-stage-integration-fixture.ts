import { writeFileSync } from 'node:fs'
import { ItemNode } from '@pascal-app/core'
import { AVAILABLE_STAGE_SCENERY } from '../apps/editor/lib/stage/prop-assets'
import { createTheatreSceneGraph } from '../apps/editor/lib/theatre/new-production'

const graph = createTheatreSceneGraph()
for (const node of Object.values(graph.nodes) as any[])
  if (node.type === 'slab' && node.material) {
    const materialId = `dia-integration-${node.id}`
    graph.materials[materialId] = {
      id: materialId,
      name: 'QA floor material',
      material: node.material,
    }
    node.slots = { ...node.slots, surface: `scene:${materialId}` }
    delete node.material
  }
const removed = new Set(
  Object.values(graph.nodes)
    .filter((node: any) => node.type === 'item')
    .map((node: any) => node.id),
)
for (const id of removed) delete graph.nodes[id as string]
for (const node of Object.values(graph.nodes) as any[])
  if (node.children) node.children = node.children.filter((id: string) => !removed.has(id))
const level = Object.values(graph.nodes).find((node: any) => node.type === 'level') as any
const source = AVAILABLE_STAGE_SCENERY.find((entry) => entry.asset.id === 'SCN-FLAT-090')!
const ids: string[] = []
for (const [name, position] of [
  ['景片甲', [-1.7, 0, 0]],
  ['景片乙', [1.7, 0, 0.8]],
] as const) {
  const node = ItemNode.parse({
    name,
    parentId: level.id,
    position,
    rotation: [0, 0, 0],
    asset: source.asset,
    metadata: { stageKind: source.kind },
  })
  graph.nodes[node.id] = node
  level.children.push(node.id)
  ids.push(node.id)
}
writeFileSync('.local/dia-stage-integration-fixture.json', JSON.stringify({ graph, ids }))
