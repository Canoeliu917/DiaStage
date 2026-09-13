import type { CatalogItem } from './catalog-items'
import { CATALOG_ITEMS } from './catalog-items'

const STAGE_ASSET_IDS = new Set(CATALOG_ITEMS.map((item) => item.id))

export function theatreCatalogItems(items: CatalogItem[]): CatalogItem[] {
  return items.filter(
    (item) =>
      STAGE_ASSET_IDS.has(item.id) &&
      (!item.tool || item.tool === 'item'),
  )
}

export const THEATRE_CATALOG_ITEMS = theatreCatalogItems(CATALOG_ITEMS)
