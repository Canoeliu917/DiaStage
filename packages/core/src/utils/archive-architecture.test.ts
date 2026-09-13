import { expect, test } from 'bun:test'
import { archiveArchitecture } from './archive-architecture'

function scene(nodes: Record<string, Record<string, unknown>>) {
  return { nodes, rootNodeIds: ['site'], collections: {} }
}

test('archive preserves raw legacy data, descendants and links without mutating a loaded project', () => {
  const graph = {
    nodes: {
      site_old: { type: 'site', children: ['level_old'], metadata: { user: 'keep' } },
      level_old: {
        type: 'level',
        parentId: 'site_old',
        children: ['roof_old', 'ceiling_old', 'stair_old'],
      },
      roof_old: {
        type: 'roof',
        parentId: 'level_old',
        children: ['rseg_old', 'item_old'],
        futureField: { raw: [1, 2, 3] },
      },
      rseg_old: { type: 'roof-segment', parentId: 'roof_old', unsupported: 'preserve' },
      item_old: { type: 'item', asset: { oldCustomData: true } },
      ceiling_old: {
        type: 'ceiling',
        parentId: 'level_old',
        holes: [
          [
            [0, 0],
            [1, 0],
            [0, 1],
          ],
        ],
      },
      stair_old: { type: 'stair', parentId: 'level_old', children: [] },
    },
    rootNodeIds: ['site_old'],
    collections: { collection_old: { name: '组合', nodeIds: ['roof_old', 'stair_old'] } },
  }
  const original = structuredClone(graph)
  const archived = archiveArchitecture(graph)
  expect(graph).toEqual(original)
  expect(archived.nodes).not.toHaveProperty('roof_old')
  expect(archived.nodes).not.toHaveProperty('ceiling_old')
  expect(archived.nodes).not.toHaveProperty('rseg_old')
  expect(archived.nodes).not.toHaveProperty('item_old')
  expect(archived.nodes.stair_old).toEqual(original.nodes.stair_old)
  expect(archived.nodes.site_old.metadata).toMatchObject({
    user: 'keep',
    legacy: {
      architecture: {
        nodes: {
          roof_old: original.nodes.roof_old,
          ceiling_old: original.nodes.ceiling_old,
          rseg_old: original.nodes.rseg_old,
          item_old: original.nodes.item_old,
        },
        parentChildren: { level_old: original.nodes.level_old.children },
        collections: original.collections,
      },
    },
  })
  expect(archiveArchitecture(archived)).toBe(archived)
  expect(archived.collections.collection_old.nodeIds).toEqual(['stair_old'])
  expect(JSON.parse(JSON.stringify(archived))).toEqual(archived)
})

test('archive preserves removed terrain data without keeping it active', () => {
  const terrain = { size: 2, spacing: 0.5, heights: 'legacy-data' }
  const graph = {
    nodes: {
      site_old: { type: 'site', children: [], metadata: { user: 'keep' }, terrain },
    },
    rootNodeIds: ['site_old'],
    collections: {},
  }

  const archived = archiveArchitecture(graph)

  expect(graph.nodes.site_old.terrain).toEqual(terrain)
  expect(archived.nodes.site_old).not.toHaveProperty('terrain')
  expect(archived.nodes.site_old.metadata).toEqual({
    user: 'keep',
    legacy: { terrain },
  })
})

test('archive preserves removed terrain fill flags without keeping them active', () => {
  const graph = scene({
    site: { type: 'site', children: ['wall_old', 'slab_old'], metadata: {} },
    wall_old: { type: 'wall', parentId: 'site', children: [], fillToTerrain: true },
    slab_old: { type: 'slab', parentId: 'site', children: [], fillToTerrain: false },
  })

  const archived = archiveArchitecture(graph)

  expect(archived.nodes.wall_old).not.toHaveProperty('fillToTerrain')
  expect(archived.nodes.slab_old).not.toHaveProperty('fillToTerrain')
  expect(archived.nodes.wall_old.metadata).toEqual({
    legacy: { terrain: { fillToTerrain: true } },
  })
  expect(archived.nodes.slab_old.metadata).toEqual({
    legacy: { terrain: { fillToTerrain: false } },
  })
})

test('archive preserves removed room documentation without keeping it active', () => {
  const graph = scene({
    site: { type: 'site', children: ['zone_old'], metadata: {} },
    zone_old: {
      type: 'zone',
      parentId: 'site',
      polygon: [
        [0, 0],
        [2, 0],
        [0, 2],
      ],
      spaceRole: 'room',
      roomNumber: '101',
      ceilingHeight: 2.7,
    },
  })

  const archived = archiveArchitecture(graph)

  expect(archived.nodes.zone_old).not.toHaveProperty('spaceRole')
  expect(archived.nodes.zone_old).not.toHaveProperty('roomNumber')
  expect(archived.nodes.zone_old).not.toHaveProperty('ceilingHeight')
  expect(archived.nodes.zone_old.metadata).toEqual({
    legacy: {
      buildingRoom: { spaceRole: 'room', roomNumber: '101', ceilingHeight: 2.7 },
    },
  })
})

test('archive hides building-generated floor openings while preserving their raw data', () => {
  const manualHole = [
    [0, 0],
    [1, 0],
    [0, 1],
  ]
  const stairHole = [
    [2, 0],
    [3, 0],
    [2, 1],
  ]
  const graph = scene({
    site: { type: 'site', children: ['slab_old'], metadata: {} },
    slab_old: {
      type: 'slab',
      parentId: 'site',
      holes: [manualHole, stairHole],
      holeMetadata: [{ source: 'manual' }, { source: 'stair', stairId: 'stair_old' }],
    },
  })

  const archived = archiveArchitecture(graph)

  expect(graph.nodes.slab_old.holes).toEqual([manualHole, stairHole])
  expect(archived.nodes.slab_old.holes).toEqual([manualHole])
  expect(archived.nodes.slab_old.holeMetadata).toEqual([{ source: 'manual' }])
  expect(archived.nodes.slab_old.metadata).toEqual({
    legacy: {
      buildingOpenings: [{ hole: stairHole, metadata: { source: 'stair', stairId: 'stair_old' } }],
    },
  })
})
