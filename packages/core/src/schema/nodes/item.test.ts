import { expect, test } from 'bun:test'
import { ItemNode } from './item'

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
