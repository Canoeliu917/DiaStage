import { expect, test } from 'bun:test'
import { getItemBoundsCenter, getScaledDimensions, ItemNode } from './item'

const item = {
  id: 'item_test',
  type: 'item' as const,
  asset: {
    id: 'asset_test',
    category: 'prop',
    name: '旧物件',
    thumbnail: '',
    src: 'asset://test',
  },
}

test('legacy community assets load as ordinary library assets', () => {
  const parsed = ItemNode.parse({
    ...item,
    asset: { ...item.asset, source: 'community' },
  })

  expect(parsed.asset.source).toBe('library')
})

test('removed item lighting effects are rejected', () => {
  const parsed = ItemNode.safeParse({
    ...item,
    asset: {
      ...item.asset,
      interactive: {
        effects: [{ kind: 'light', color: '#ffffff', intensity: 1 }],
      },
    },
  })

  expect(parsed.success).toBe(false)
})

test('authored bounds center survives scene parsing and scales without moving the pivot', () => {
  const source = {
    ...item,
    position: [10, 0, 20],
    rotation: [0, Math.PI / 2, 0],
    scale: [2, 3, 4],
    asset: { ...item.asset, dimensions: [2, 3, 1], boundsCenter: [-1, 1.5, 0.7] },
  }
  const parsed = ItemNode.parse(JSON.parse(JSON.stringify(ItemNode.parse(source))))
  expect(getItemBoundsCenter(parsed)).toEqual([-2, 4.5, 2.8])
  expect(getScaledDimensions(parsed)).toEqual([4, 9, 4])
  expect(parsed.position).toEqual(source.position)
  expect(parsed.rotation).toEqual(source.rotation)
  expect(parsed.asset.offset).toEqual([0, 0, 0])
  const legacy = ItemNode.parse({ ...source, asset: { ...item.asset, dimensions: [2, 3, 1] } })
  expect(getItemBoundsCenter(legacy)).toEqual([0, 4.5, 0])
  expect(legacy.asset.boundsCenter).toBeUndefined()
})
