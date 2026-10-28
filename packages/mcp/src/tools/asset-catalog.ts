import type { AssetInput } from '@pascal-app/core/schema'

/**
 * Headless catalog for MCP layout tools.
 * Only standard performance props that still have local models. Residential
 * leftovers are omitted so their files are not fetched or shipped.
 */
export const MCP_CATALOG_ITEMS: AssetInput[] = [
  {
    id: 'sofa',
    category: 'furniture',
    tags: ['floor', 'seating', 'living'],
    name: 'Sofa',
    thumbnail: '/items/sofa/thumbnail.webp',
    src: '/items/sofa/model.glb',
    dimensions: [2.5, 0.8, 1.5],
    offset: [0, 0, 0.04],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  },
  {
    id: 'livingroom-chair',
    category: 'furniture',
    tags: ['floor', 'seating', 'living'],
    name: 'Livingroom Chair',
    thumbnail: '/items/livingroom-chair/thumbnail.webp',
    src: '/items/livingroom-chair/model.glb',
    dimensions: [1.5, 0.8, 1.5],
    offset: [0.01, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  },
  {
    id: 'coffee-table',
    category: 'furniture',
    tags: ['floor', 'table', 'living'],
    name: 'Coffee Table',
    thumbnail: '/items/coffee-table/thumbnail.webp',
    src: '/items/coffee-table/model.glb',
    dimensions: [2, 0.4, 1.5],
    offset: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    surface: { height: 0.3 },
  },
  {
    id: 'shelf',
    category: 'furniture',
    tags: ['wall', 'storage'],
    name: 'Shelf',
    thumbnail: '/items/shelf/thumbnail.webp',
    src: '/items/shelf/model.glb',
    dimensions: [1, 0.5, 0.7],
    offset: [0, 0.1, 0.01],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    attachTo: 'wall-side',
    surface: { height: 0.12 },
  },
  {
    id: 'dining-table',
    category: 'furniture',
    tags: ['floor', 'table', 'dining'],
    name: 'Dining Table',
    thumbnail: '/items/dining-table/thumbnail.webp',
    src: '/items/dining-table/model.glb',
    dimensions: [2.5, 0.8, 1],
    offset: [0, 0, -0.01],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    surface: { height: 0.8 },
  },
  {
    id: 'dining-chair',
    category: 'furniture',
    tags: ['floor', 'seating', 'dining'],
    name: 'Dining Chair',
    thumbnail: '/items/dining-chair/thumbnail.webp',
    src: '/items/dining-chair/model.glb',
    dimensions: [0.5, 1, 0.5],
    offset: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  },
]

export function findCatalogItem(id: string): AssetInput | undefined {
  return MCP_CATALOG_ITEMS.find((item) => item.id === id)
}

export function searchCatalogItems(args: {
  query: string
  category?: string | undefined
}): AssetInput[] {
  const terms = args.query.trim().toLowerCase().split(/\s+/).filter(Boolean)

  return MCP_CATALOG_ITEMS.filter((item) => {
    if (args.category && item.category !== args.category) return false
    const haystack = [item.id, item.name, item.category, ...(item.tags ?? [])]
      .join(' ')
      .toLowerCase()
    return terms.every((term) => haystack.includes(term))
  })
}
