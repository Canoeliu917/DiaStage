import type { CatalogCategory } from './../../../store/use-editor'

export type FurnishToolConfig = {
  id: 'item'
  iconSrc: string
  label: string
  catalogCategory: CatalogCategory
}

export const furnishTools: FurnishToolConfig[] = [
  { id: 'item', iconSrc: '/icons/wall.webp', label: '布景', catalogCategory: 'scenery' },
  { id: 'item', iconSrc: '/icons/couch.webp', label: '家具', catalogCategory: 'furniture' },
  { id: 'item', iconSrc: '/icons/item.webp', label: '舞台物件', catalogCategory: 'props' },
]
