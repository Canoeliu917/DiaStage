import type { CatalogItem } from './catalog-items'
import { CATALOG_ITEMS } from './catalog-items'

const PROP_IDS = new Set([
  'books', 'guitar', 'picture', 'round-mirror', 'easel', 'piano', 'wine-bottle',
])
const SCENIC_IDS = new Set(['column', 'pillar', 'shelf', 'fireplace-movn1fnn'])
const EXCLUDED_FURNITURE = new Set([
  'cabinet', 'threadmill', 'recessed-light', 'ceiling-lamp', 'barbell-stand',
  'small-indoor-plant', 'indoor-plant', 'cactus',
  'pool-table', 'barbell', 'ironing-board', 'toy', 'car-toy', 'trash-bin',
  'ikea-kallax-1x4-moa2y49n', 'herman-miller-aeron-mo8x36k9', 'standing-desk-mo8wgz95',
  'tv-stand', 'office-table', 'office-chair', 'bunkbed',
])
// Kitchen, outdoor, and appliance leftovers are not furniture, so the furniture
// exclusion cannot catch them. Drop them before the prop allowlist is applied.
const EXCLUDED_IDS = new Set([
  'skate', 'scooter', 'ball', 'sewing-machine', 'frying-pan', 'cutting-board', 'kettle', 'fruits',
])

export function theatreCatalogItems(items: CatalogItem[]): CatalogItem[] {
  return items.flatMap((item) => {
    if (EXCLUDED_IDS.has(item.id)) return []
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
