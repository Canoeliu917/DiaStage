import { describe, expect, it } from 'bun:test'
import { LevelNode, SlabNode, WallNode } from '../schema'
import type { AnyNode, AnyNodeId } from '../schema/types'
import { deriveLegacyLevelHeight } from './level-height'

function createFixture(): Record<AnyNodeId, AnyNode> {
  const nodes: AnyNode[] = [
    LevelNode.parse({ id: 'level_empty', children: [] }),
    LevelNode.parse({ id: 'level_no_platform', children: ['wall_no_platform'] }),
    WallNode.parse({
      id: 'wall_no_platform',
      parentId: 'level_no_platform',
      start: [10, 0],
      end: [12, 0],
    }),
    LevelNode.parse({
      id: 'level_standard',
      children: ['slab_platform_standard', 'wall_standard'],
    }),
    SlabNode.parse({
      id: 'slab_platform_standard',
      parentId: 'level_standard',
      polygon: [
        [0, 0],
        [4, 0],
        [4, 4],
        [0, 4],
      ],
      elevation: 0.05,
    }),
    WallNode.parse({
      id: 'wall_standard',
      parentId: 'level_standard',
      start: [1, 2],
      end: [3, 2],
    }),
    LevelNode.parse({ id: 'level_tall_wall', children: ['slab_platform_raised', 'wall_tall'] }),
    SlabNode.parse({
      id: 'slab_platform_raised',
      parentId: 'level_tall_wall',
      polygon: [
        [20, 0],
        [24, 0],
        [24, 4],
        [20, 4],
      ],
      elevation: 0.35,
    }),
    WallNode.parse({
      id: 'wall_tall',
      parentId: 'level_tall_wall',
      start: [21, 2],
      end: [23, 2],
      height: 3.2,
    }),
  ]

  return Object.fromEntries(nodes.map((node) => [node.id, node])) as Record<AnyNodeId, AnyNode>
}

describe('deriveLegacyLevelHeight', () => {
  const nodes = createFixture()
  const cases = [
    ['level_no_platform', 2.5],
    ['level_standard', 2.5],
    ['level_tall_wall', 3.55],
    ['level_empty', 2.5],
  ] as const

  for (const [levelId, expected] of cases) {
    it(`derives ${expected} for ${levelId}`, () => {
      expect(deriveLegacyLevelHeight(levelId, nodes)).toBeCloseTo(expected)
    })
  }
})
