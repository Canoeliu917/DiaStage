import { expect, test } from 'bun:test'
import { type GeometryContext, ItemNode } from '@pascal-app/core'
import { getItemPlacementBounds } from '../../../editor/src/components/tools/item/placement-math'
import { buildFloorplanItemEntry } from '../../../editor/src/lib/floorplan/items'
import { itemDefinition } from './definition'
import { buildItemContextualDimensions, buildItemFloorplan } from './floorplan'

test('folded prop keeps its pivot while scaled bounds, floor plan and handles follow its geometry', () => {
  const node = ItemNode.parse({
    position: [10, 0, 20],
    rotation: [0, Math.PI / 2, 0],
    scale: [2, 3, 4],
    asset: {
      id: 'fold',
      category: 'prop',
      name: 'Fold',
      thumbnail: '',
      src: 'asset://fold',
      dimensions: [2, 3, 1],
      boundsCenter: [-1, 1.5, 0.7],
    },
  })
  const before = JSON.stringify(node)
  const ctx: GeometryContext = {
    resolve: () => undefined,
    parent: null,
    children: [],
    siblings: [],
    viewState: { selected: true, highlighted: false, hovered: false, moving: false },
  }
  const geometry = buildItemFloorplan(node, ctx)
  expect(geometry?.kind).toBe('group')
  if (geometry?.kind !== 'group') throw new Error('missing item geometry')
  const polygon = geometry.children.find((child) => child.kind === 'polygon')!
  if (polygon.kind !== 'polygon') throw new Error('missing footprint')
  const native = getItemPlacementBounds(node, node.asset)
  const expected = [
    [native.min[0], native.min[2]],
    [native.max[0], native.min[2]],
    [native.max[0], native.max[2]],
    [native.min[0], native.max[2]],
  ].map(([x, z]) => [10 + z!, 20 - x!])
  for (let index = 0; index < expected.length; index++) {
    expect(polygon.points[index]![0]).toBeCloseTo(expected[index]![0]!)
    expect(polygon.points[index]![1]).toBeCloseTo(expected[index]![1]!)
  }
  const move = geometry.children.find((child) => child.kind === 'move-handle')!
  expect(move.kind === 'move-handle' && move.point).toEqual([12.8, 22])
  const legacy = buildFloorplanItemEntry(node, new Map(), new Map())!
  expect(legacy.center).toEqual({ x: 12.8, y: 22 })
  const footprint = itemDefinition.capabilities.floorPlaced!.footprint!(node)
  expect(footprint.position?.[0]).toBeCloseTo(12.8)
  expect(footprint.position?.[2]).toBeCloseTo(22)
  const dimensions = buildItemContextualDimensions(node, ctx)
  expect(dimensions?.kind === 'group' && dimensions.children[0]).toMatchObject({
    start: polygon.points[0],
    end: polygon.points[1],
  })
  const handles = typeof itemDefinition.handles === 'function' ? itemDefinition.handles(node) : []
  expect(handles[1]!.placement.position(node, {} as never)).toEqual([-4.3, 4.5, 5.1])
  expect(JSON.stringify(node)).toBe(before)
})
