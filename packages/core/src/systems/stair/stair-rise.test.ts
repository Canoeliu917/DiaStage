import { expect, test } from 'bun:test'
import { LevelNode, SlabNode, StairNode, StairSegmentNode } from '../../schema'
import { resolveStairTotalRise } from './stair-rise'

test('stage rise follows its saved geometry, never storey or slab height', () => {
  const segment = StairSegmentNode.parse({ height: 0.45, stepCount: 3 })
  const stair = StairNode.parse({
    children: [segment.id],
    fromLevelId: 'level_a',
    toLevelId: 'level_b',
    deckSlabId: 'slab_a',
  })
  const nodes = {
    [segment.id]: segment,
    level_a: LevelNode.parse({ height: 3 }),
    slab_a: SlabNode.parse({
      polygon: [
        [0, 0],
        [1, 0],
        [0, 1],
      ],
      elevation: 2,
    }),
  }
  expect(resolveStairTotalRise(stair, nodes)).toBe(0.45)
  expect(
    resolveStairTotalRise(stair, {
      ...nodes,
      level_a: LevelNode.parse({ height: 8 }),
      slab_a: SlabNode.parse({
        polygon: [
          [0, 0],
          [1, 0],
          [0, 1],
        ],
        elevation: 6,
      }),
    }),
  ).toBe(0.45)
  expect(resolveStairTotalRise({ ...stair, totalRise: 0.6 }, nodes)).toBe(0.6)
  expect(resolveStairTotalRise(StairNode.parse({ stepCount: 3 }), {})).toBeCloseTo(0.45)
})
