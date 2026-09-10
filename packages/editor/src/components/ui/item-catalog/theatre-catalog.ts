import type { CatalogItem } from './catalog-items'
import { CATALOG_ITEMS } from './catalog-items'

const PROP_IDS = new Set([
  'books', 'toy', 'car-toy', 'barbell', 'guitar',
  'picture', 'round-mirror', 'easel', 'piano', 'wine-bottle', 'fruits', 'kettle',
  'cutting-board', 'frying-pan', 'sewing-machine', 'ball', 'skate', 'scooter',
])
const SCENIC_IDS = new Set(['column', 'pillar', 'shelf', 'fireplace-movn1fnn'])
const EXCLUDED_FURNITURE = new Set([
  'cabinet', 'threadmill', 'recessed-light', 'ceiling-lamp', 'barbell-stand',
  'small-indoor-plant', 'indoor-plant', 'cactus',
])

export function theatreCatalogItems(items: CatalogItem[]): CatalogItem[] {
  return items.flatMap((item) => {
    if (item.category === 'lighting' || item.interactive?.effects?.some(e => e.kind === 'light')) return []
    const category = PROP_IDS.has(item.id) ? 'props'
      : SCENIC_IDS.has(item.id) ? 'scenery'
      : item.category === 'props' || item.category === 'scenery' ? item.category
      : item.category === 'furniture' && !EXCLUDED_FURNITURE.has(item.id) ? 'furniture'
      : null
    if (!category || (item.tool && item.tool !== 'item')) return []
    return [{ ...item, category, tags: [category], name: item.id === 'livingroom-chair' ? '靠背椅' : item.name }]
  })
}

export const THEATRE_CATALOG_ITEMS = theatreCatalogItems(CATALOG_ITEMS)
