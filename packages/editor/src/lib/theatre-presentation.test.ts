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
    expect(new Set(THEATRE_CATALOG_ITEMS.map((item) => item.category))).toEqual(
      new Set(['furniture', 'props', 'scenery']),
    )
    expect(
      THEATRE_CATALOG_ITEMS.some((item) => item.id === 'wine-bottle' && item.category === 'props'),
    ).toBe(true)
    expect(
      THEATRE_CATALOG_ITEMS.some((item) => item.id === 'books' && item.category === 'props'),
    ).toBe(true)
    expect(THEATRE_CATALOG_ITEMS.some((item) => item.id === 'dishwasher-movn72ls')).toBe(false)
    expect(
      theatreCatalogItems(CATALOG_ITEMS.filter((item) => item.id === 'dishwasher-movn72ls')),
    ).toEqual([])
    expect(THEATRE_CATALOG_ITEMS.every((item) => !item.tool || item.tool === 'item')).toBe(true)
  })

  test('hides home and entertainment leftovers while keeping rehearsal assets', () => {
    const ids = new Set(THEATRE_CATALOG_ITEMS.map((item) => item.id))
    const removed = [
      'pool-table',
      'barbell',
      'skate',
      'scooter',
      'ironing-board',
      'toy',
      'car-toy',
      'ball',
      'sewing-machine',
      'frying-pan',
      'cutting-board',
      'kettle',
      'fruits',
      'trash-bin',
      'ikea-kallax-1x4-moa2y49n',
      'herman-miller-aeron-mo8x36k9',
      'standing-desk-mo8wgz95',
      'tv-stand',
      'office-table',
      'office-chair',
      'bunkbed',
    ]
    for (const id of removed) {
      expect(ids.has(id)).toBe(false)
      expect(theatreCatalogItems(CATALOG_ITEMS.filter((item) => item.id === id))).toEqual([])
    }
    for (const id of [
      'column',
      'pillar',
      'shelf',
      'fireplace-movn1fnn',
      'sofa',
      'my-leather-couch-modp80ha',
      'livingroom-chair',
      'dining-chair',
      'lounge-chair',
      'stool',
      'dining-table',
      'dining-table-mo9ms5yh',
      'coffee-table',
      'single-bed',
      'double-bed',
      'bedside-table',
      'dresser',
      'closet',
      'coat-rack',
      'bookshelf',
      'rectangular-carpet',
      'round-carpet',
      'books',
      'guitar',
      'piano',
      'easel',
      'picture',
      'round-mirror',
      'wine-bottle',
      'table-lamp',
    ]) {
      expect(ids.has(id)).toBe(true)
    }
    expect(THEATRE_CATALOG_ITEMS.find((item) => item.id === 'column')?.category).toBe('scenery')
    expect(THEATRE_CATALOG_ITEMS.find((item) => item.id === 'sofa')?.category).toBe('furniture')
    expect(THEATRE_CATALOG_ITEMS.find((item) => item.id === 'table-lamp')?.category).toBe(
      'furniture',
    )
    expect(THEATRE_CATALOG_ITEMS.find((item) => item.id === 'piano')?.category).toBe('props')
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
