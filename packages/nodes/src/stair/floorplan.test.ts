import { expect, test } from 'bun:test'
import { type GeometryContext, StairNode, StairSegmentNode } from '@pascal-app/core'
import { buildStairFloorplan } from './floorplan'

test('stage steps floor plan shows the footprint and every tread division', () => {
  const segment = StairSegmentNode.parse({
    id: 'sseg_main',
    width: 1.2,
    length: 0.9,
    height: 0.45,
    stepCount: 3,
  })
  const stair = StairNode.parse({
    id: 'stair_main',
    position: [2, 0, 3],
    rotation: Math.PI / 2,
    children: [segment.id],
  })
  const geometry = buildStairFloorplan(stair, {
    resolve: () => undefined,
    children: [segment],
    siblings: [],
  } satisfies GeometryContext)

  expect(geometry?.kind).toBe('group')
  if (geometry?.kind !== 'group') return
  expect(geometry.transform).toEqual({ translate: [2, 3], rotate: -Math.PI / 2 })
  expect(geometry.children.filter((child) => child.kind === 'line')).toHaveLength(2)
})
