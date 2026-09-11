import type { CatalogItem } from './catalog-items'
import { CATALOG_ITEMS } from './catalog-items'

const THEATRE_CATEGORIES = new Set(['furniture', 'props', 'scenery'])

export function theatreCatalogItems(items: CatalogItem[]): CatalogItem[] {
  return items.filter(
    (item) =>
      THEATRE_CATEGORIES.has(item.category) &&
      (!item.tool || item.tool === 'item'),
  )
}

export const THEATRE_CATALOG_ITEMS = theatreCatalogItems(CATALOG_ITEMS)
