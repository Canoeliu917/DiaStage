import { describe, expect, test } from 'bun:test'
import { ItemNode } from '@pascal-app/core'
import {
  getDetachedAttachmentPreviewLift,
  getItemPlacementBounds,
  steppedRotation,
  stripTransient,
} from './placement-math'

describe('steppedRotation', () => {
  test('rotates a placement clockwise to the next 45 degree increment', () => {
    expect(steppedRotation(Math.PI / 15, 1)).toBeCloseTo(Math.PI / 4)
  })

  test('rotates a placement counter-clockwise to the previous 45 degree increment', () => {
    expect(steppedRotation(Math.PI / 15, -1)).toBeCloseTo(-Math.PI / 4)
  })
})

describe('stripTransient', () => {
  test('removes placement-only metadata flags before commit', () => {
    expect(stripTransient({ isNew: true, isTransient: true, label: 'copy' })).toEqual({
      label: 'copy',
    })
  })
})

describe('getDetachedAttachmentPreviewLift', () => {
  test('raises attach-only item previews while they are detached from their host', () => {
    expect(getDetachedAttachmentPreviewLift('wall')).toBeGreaterThan(0)
    expect(getDetachedAttachmentPreviewLift('wall-side')).toBeGreaterThan(0)
  })

  test('keeps floor item previews on the floor', () => {
    expect(getDetachedAttachmentPreviewLift(undefined)).toBe(0)
  })
})

test('placement bounds preserve an off-center GLB pivot and the legacy floor and wall conventions', () => {
  const asset = {
    id: 'fold',
    category: 'prop',
    name: 'Fold',
    thumbnail: '',
    src: 'asset://fold',
    dimensions: [2, 3, 1] as [number, number, number],
  }
  const node = ItemNode.parse({
    asset: { ...asset, boundsCenter: [-1, 1.5, 0.7] },
    scale: [2, 3, 4],
  })
  const bounds = getItemPlacementBounds(node, node.asset)
  expect(bounds.center).toEqual([-2, 4.5, 2.8])
  expect(bounds.min[0]).toBe(-4)
  expect(bounds.min[1]).toBe(0)
  expect(bounds.min[2]).toBeCloseTo(0.8)
  expect(bounds.max).toEqual([0, 9, 4.8])
  expect(getItemPlacementBounds(null, asset)).toEqual({
    min: [-1, 0, -0.5],
    max: [1, 3, 0.5],
    dimensions: [2, 3, 1],
    center: [0, 1.5, 0],
  })
  expect(getItemPlacementBounds(null, { ...asset, attachTo: 'wall-side' }).min).toEqual([-1, 0, 0])
  expect(node.position).toEqual([0, 0, 0])
})
