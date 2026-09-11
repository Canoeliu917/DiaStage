import { expect, test } from 'bun:test'
import { StairNode, StairSegmentNode } from '../../schema'
import { resolveStairTotalRise } from './stair-rise'

test('stage rise follows its saved step geometry', () => {
  const segment = StairSegmentNode.parse({ height: 0.45, stepCount: 3 })
  const stair = StairNode.parse({
    children: [segment.id],
  })
  const nodes = {
    [segment.id]: segment,
  }
  expect(resolveStairTotalRise(stair, nodes)).toBe(0.45)
  expect(resolveStairTotalRise({ ...stair, totalRise: 0.6 }, nodes)).toBe(0.6)
  expect(resolveStairTotalRise(StairNode.parse({ stepCount: 3 }), {})).toBeCloseTo(0.45)
})
