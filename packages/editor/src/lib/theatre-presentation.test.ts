import { describe, expect, test } from 'bun:test'
import { LevelNode, WallNode } from '@pascal-app/core'
import { CATALOG_ITEMS } from '../components/ui/item-catalog/catalog-items'
import {
  THEATRE_CATALOG_ITEMS,
  theatreCatalogItems,
} from '../components/ui/item-catalog/theatre-catalog'
import { CONTINUATION_PROFILES } from './continuation'
import { getTheatreNodeLabel, getTheatreNodeName } from './theatre-presentation'

describe('theatre presentation boundary', () => {
  test('adapts inherited labels without changing scene nodes or custom names', () => {
    const wall = WallNode.parse({ name: 'Wall', start: [0, 0], end: [1, 0] })
    const before = JSON.stringify(wall)
    expect(getTheatreNodeName(wall)).toBe('景片')
    expect(JSON.stringify(wall)).toBe(before)
    expect(getTheatreNodeName({ ...wall, name: '第一场 · 记忆之墙' })).toBe('第一场 · 记忆之墙')
    expect(getTheatreNodeName(LevelNode.parse({ level: 0 }))).toBe('表演层 0')
    expect(getTheatreNodeLabel('roof')).toBe('兼容物件')
  })

  test('all default asset categories and search candidates are theatrical', () => {
    expect(CATALOG_ITEMS).toHaveLength(22)
    expect(THEATRE_CATALOG_ITEMS).toHaveLength(22)
    expect(new Set(THEATRE_CATALOG_ITEMS.map((item) => item.category))).toEqual(
      new Set(['scenery']),
    )
    expect(
      THEATRE_CATALOG_ITEMS.every((item) => item.src.startsWith('/stage-library/models/')),
    ).toBe(true)
    expect(
      theatreCatalogItems([
        { ...CATALOG_ITEMS[0]!, id: 'wine-bottle' },
        { ...CATALOG_ITEMS[0]!, id: 'books' },
        { ...CATALOG_ITEMS[0]!, id: 'dishwasher-movn72ls' },
      ]),
    ).toEqual([])
    expect(THEATRE_CATALOG_ITEMS.every((item) => !item.tool || item.tool === 'item')).toBe(true)
  })

  test('catalog adaptation preserves original assets and exact dimensions', () => {
    const before = JSON.stringify(CATALOG_ITEMS)
    const mapped = theatreCatalogItems(CATALOG_ITEMS)
    for (const item of mapped) {
      const original = CATALOG_ITEMS.find((candidate) => candidate.id === item.id)!
      expect(item.dimensions).toEqual(original.dimensions)
      expect(item.offset).toEqual(original.offset)
      expect(item.src).toBe(original.src)
    }
    expect(JSON.stringify(CATALOG_ITEMS)).toBe(before)
    expect(CONTINUATION_PROFILES.wall.default).toBe('single')
  })
})
