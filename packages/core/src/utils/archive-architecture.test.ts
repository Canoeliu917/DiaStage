import { expect, test } from 'bun:test'
import { archiveArchitecture } from './archive-architecture'

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
