import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nodeRegistry, registerNode } from '@pascal-app/core/registry'
import {
  type AnyNode,
  BlockNode,
  BuildingNode,
  ItemNode,
  LevelNode,
  ScanNode,
  SiteNode,
  ZoneNode,
} from '@pascal-app/core/schema'
import { createStageStair } from '@pascal-app/core/stage'
import { buildStageRows, getStageNodeSelection } from './stage-overview-data'

test('simple stage steps appear as one movable object without exposing internal segments', () => {
  const { stair, segment } = createStageStair({}, 'level_main')
  const nodes = { [stair.id]: stair, [segment.id]: segment }
  const before = JSON.stringify(nodes)
  assert.deepEqual(
    buildStageRows(nodes).map((row) => row.id),
    [stair.id],
  )
  assert.equal(JSON.stringify(nodes), before)
})

function item(id: string, parentId: string | null, name = '物件'): AnyNode {
  return ItemNode.parse({
    id,
    parentId,
    name,
    asset: { id: 'asset', name: '素材', category: 'test', thumbnail: '', src: '/assets/item.glb' },
  })
}

function graph(): Record<string, AnyNode> {
  return Object.fromEntries(
    [
      SiteNode.parse({ id: 'site_main', name: '剧场' }),
      BuildingNode.parse({ id: 'building_main', parentId: 'site_main', name: '主楼' }),
      LevelNode.parse({ id: 'level_2', parentId: 'building_main', name: '楼层 2', level: 1 }),
      LevelNode.parse({ id: 'level_10', parentId: 'building_main', name: '楼层 10', level: 9 }),
      ZoneNode.parse({
        id: 'zone_stage',
        parentId: 'level_2',
        name: '表演区',
        polygon: [
          [0, 0],
          [5, 0],
          [5, 4],
        ],
      }),
      ScanNode.parse({ id: 'scan_upper', parentId: 'level_10', name: '上层扫描', visible: false }),
      item('item_lower', 'zone_stage', '座椅 10'),
      item('item_upper', 'level_10', '座椅 2'),
    ].map((node) => [node.id, node]),
  )
}

test('authored theatre roles identify furniture, props and scenery without changing node types', () => {
  const nodes = Object.fromEntries(
    ['furniture', 'prop', 'scenic-unit'].map((kind) => {
      const node = BlockNode.parse({ metadata: { theatreKind: kind } })
      return [node.id, node]
    }),
  )
  const before = JSON.stringify(nodes)
  const rows = buildStageRows(nodes)
  assert.deepEqual(new Set(rows.map((row) => row.typeLabel)), new Set(['家具', '舞台物件', '布景']))
  assert.ok(Object.values(nodes).every((node) => node.type === 'block'))
  assert.equal(JSON.stringify(nodes), before)
})

test('overview hides hierarchy containers while preserving references and hidden scenery', () => {
  const nodes = graph()
  const original = JSON.stringify(nodes)
  const rows = buildStageRows(nodes)
  assert.equal(rows.length, 3)
  assert.deepEqual(
    new Set(rows.map((row) => row.id)),
    new Set(['scan_upper', 'item_lower', 'item_upper']),
  )
  assert.equal(rows.find((row) => row.id === 'scan_upper')?.visible, false)
  assert.equal(
    rows.some((row) => row.id === 'zone_stage'),
    false,
  )
  assert.equal(
    rows.find((row) => row.id === 'item_lower')?.parentLabel,
    '剧场 / 主楼 / 表演层 1 / 表演区',
  )
  assert.equal(
    rows.some((row) => row.id === 'site_main'),
    false,
  )
  assert.ok(
    rows.findIndex((row) => row.id === 'item_upper') <
      rows.findIndex((row) => row.id === 'item_lower'),
  )
  assert.equal(JSON.stringify(nodes), original)
})

test('own visibility remains distinct from visibility inherited from an ancestor', () => {
  const nodes = graph()
  nodes.level_2 = { ...nodes.level_2!, visible: false }
  const rows = buildStageRows(nodes)
  const nested = rows.find((row) => row.id === 'item_lower')!
  assert.equal(nested.visible, true)
  assert.equal(nested.effectiveVisible, false)
  assert.equal(
    rows.some((row) => row.id === 'zone_stage'),
    false,
  )
  assert.equal(rows.find((row) => row.id === 'item_upper')?.effectiveVisible, true)
  assert.equal(rows.find((row) => row.id === 'scan_upper')?.effectiveVisible, false)
})

test('legacy light effects are absent from the overview without filtering by user names', () => {
  const nodes = graph()
  nodes.item_named = item('item_named', 'level_2', '点光灯 Light 灯光')
  nodes.item_light = ItemNode.parse({
    ...item('item_light', 'level_10', '舞台照明'),
    asset: {
      id: 'light-asset',
      name: '照明素材',
      category: 'test',
      thumbnail: '',
      src: '/assets/light.glb',
      interactive: { effects: [{ kind: 'light', intensityRange: [0, 100] }] },
    },
  })
  const rows = buildStageRows(nodes)
  assert.equal(
    rows.some((row) => row.id === 'item_light'),
    false,
  )
  assert.equal(rows.find((row) => row.id === 'item_named')?.kind, 'object')
  assert.equal(rows.find((row) => row.id === 'item_named')?.typeLabel, '物件')
})

test('theatre labels adapt legacy presentation without rewriting registry or node data', () => {
  const restore = nodeRegistry._snapshot()
  try {
    nodeRegistry._reset()
    registerNode({
      kind: 'scan',
      schemaVersion: 1,
      schema: ScanNode,
      category: 'utility',
      defaults: () => ScanNode.parse({}),
      capabilities: {},
      renderer: { kind: 'parametric', module: async () => ({ default: () => null }) },
      presentation: { label: '三维扫描', icon: { kind: 'url', src: '/icons/mesh.webp' } },
    })
    const nodes = graph()
    nodes.item_asset = item('item_asset', null, '')
    const original = JSON.stringify(nodes)
    const rows = buildStageRows(nodes)
    assert.equal(rows.find((row) => row.id === 'scan_upper')?.typeLabel, '场地参考')
    assert.equal(rows.find((row) => row.id === 'item_asset')?.name, '素材')
    assert.equal(nodeRegistry.get('scan')?.presentation?.label, '三维扫描')
    assert.equal(JSON.stringify(nodes), original)
  } finally {
    restore()
  }
})

test('selection uses the actual ancestor path and the existing container and zone semantics', () => {
  const nodes = graph()
  assert.deepEqual(getStageNodeSelection(nodes, 'item_lower'), {
    buildingId: 'building_main',
    levelId: 'level_2',
    zoneId: 'zone_stage',
    selectedIds: ['item_lower'],
  })
  assert.deepEqual(getStageNodeSelection(nodes, 'scan_upper'), {
    buildingId: 'building_main',
    levelId: 'level_10',
    zoneId: null,
    selectedIds: ['scan_upper'],
  })
  assert.deepEqual(getStageNodeSelection(nodes, 'site_main'), {
    buildingId: null,
    levelId: null,
    zoneId: null,
    selectedIds: [],
  })
  assert.deepEqual(getStageNodeSelection(nodes, 'building_main'), {
    buildingId: 'building_main',
    levelId: null,
    zoneId: null,
    selectedIds: [],
  })
  assert.deepEqual(getStageNodeSelection(nodes, 'level_10'), {
    buildingId: 'building_main',
    levelId: 'level_10',
    zoneId: null,
    selectedIds: [],
  })
  assert.deepEqual(getStageNodeSelection(nodes, 'zone_stage'), {
    buildingId: 'building_main',
    levelId: 'level_2',
    zoneId: 'zone_stage',
    selectedIds: [],
  })
})

test('isolated nodes and cyclic parent chains terminate without inventing a level or building', () => {
  const nodes = graph()
  nodes.item_orphan = item('item_orphan', 'level_missing', '孤立物件')
  nodes.item_cycle_a = item('item_cycle_a', 'item_cycle_b', '循环 A')
  nodes.item_cycle_b = { ...item('item_cycle_b', 'item_cycle_a', '循环 B'), visible: false }
  const rows = buildStageRows(nodes)
  assert.equal(rows.find((row) => row.id === 'item_orphan')?.parentLabel, '根级')
  assert.equal(rows.find((row) => row.id === 'item_cycle_a')?.parentLabel, '循环 B')
  assert.equal(rows.find((row) => row.id === 'item_cycle_a')?.effectiveVisible, false)
  assert.deepEqual(getStageNodeSelection(nodes, 'item_orphan'), {
    buildingId: null,
    levelId: null,
    zoneId: null,
    selectedIds: ['item_orphan'],
  })
  assert.deepEqual(getStageNodeSelection(nodes, 'item_cycle_a'), {
    buildingId: null,
    levelId: null,
    zoneId: null,
    selectedIds: ['item_cycle_a'],
  })
  assert.deepEqual(getStageNodeSelection(nodes, 'missing'), {
    buildingId: null,
    levelId: null,
    zoneId: null,
    selectedIds: [],
  })
})
