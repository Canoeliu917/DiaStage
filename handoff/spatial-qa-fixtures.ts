import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { ItemNode } from '@pascal-app/core'
import { AVAILABLE_STAGE_SCENERY } from '../apps/editor/lib/stage/prop-assets'
import { createTheatreSceneGraph } from '../apps/editor/lib/theatre/new-production'
import { makeScenery } from '../apps/editor/lib/stage/scenery'
import { applyItemFoldControls, computeItemFoldBounds } from '@pascal-app/nodes/item-fold'
import { ItemGLTFLoader } from '../packages/nodes/src/item/model-loader'

const fixtures = []
for (const scenario of ['enclosure', 'opening', 'path', 'path-model', 'corner', 'blocked', 'impossible', 'fold']) {
  const graph = createTheatreSceneGraph(`Spatial QA ${scenario}`)
  for (const node of Object.values(graph.nodes) as any[]) if (node.type === 'slab' && node.material) {
    const id = `qa-${node.id}`
    graph.materials[id] = { id, name: 'QA floor', material: node.material }
    node.slots = { ...node.slots, surface: `scene:${id}` }
    delete node.material
  }
  const level = Object.values(graph.nodes).find((node) => node.type === 'level')!
  const add = (assetId: string, name: string, position: [number, number, number], scale = [1, 1, 1]) => {
    const source = AVAILABLE_STAGE_SCENERY.find(({ asset }) => asset.id === assetId)!
    const node = ItemNode.parse({ asset: source.asset, name, parentId: level.id, position, scale,
      metadata: { stageKind: source.kind } })
    graph.nodes[node.id] = node
    level.children.push(node.id)
    return node
  }
  if (scenario === 'path' || scenario === 'path-model') {
    if (scenario === 'path-model') add('SCN-DOOR-130', '门', [0, 0, -1.5])
    else {
      // Existing editable door-frame representation, not a modified library GLB.
      for (const node of makeScenery({ type: 'AddScenery', kind: 'door-flat', name: '门',
        nodeId: 'qa-door', meta: { commandId: 'qa-door', transactionId: 'qa',
          source: 'manual', issuedAt: '2026-09-14T00:00:00Z', expectedDocumentVersion: 0 },
        libraryAssetId: null, dimensionsMeters: { width: 1.4, height: 2.4, depth: 0.1 },
        transform: { position: { x: 0, y: 0, z: 4.5 }, rotationDegrees: { x: 0, y: 0, z: 0 } } },
        level.id, [0, 0, -1.5], [0, 0, 0])) {
        graph.nodes[node.id] = node
        level.children.push(node.id)
      }
    }
    add('SCN-CUBE-045', '通道阻挡物', [0, 0, 0.7])
  } else if (scenario === 'fold') {
    const node = add('SCN-FOLD-03', '三联景片', [0, 0, 0])
    const bytes = readFileSync('apps/editor/public/stage-library/models/SCN-FOLD-03.glb')
    const model = await new ItemGLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
    node.controls = { fold_angle_1_deg: 180, fold_angle_2_deg: 180 }
    applyItemFoldControls(model.scene, node.controls)
    node.asset = { ...node.asset, ...computeItemFoldBounds(model.scene, node.scale)! }
  }
  else {
    add('SCN-FLAT-090', '景片甲', [0, 0, 0])
    add('SCN-FLAT-090', '景片乙', [-2, 0, 0])
    if (!['corner', 'blocked'].includes(scenario)) add('SCN-FLAT-090', '景片丙', [2, 0, 0])
    if (scenario === 'blocked') add('SCN-CUBE-045', '阻挡物', [0, 0, 0.6], [14, 3, 2])
  }
  fixtures.push({ scenario, graph })
}
mkdirSync('.local', { recursive: true })
writeFileSync('.local/spatial-qa-fixtures.json', JSON.stringify(fixtures))
