import type { CatalogCategory } from './../../../store/use-editor'

export type FurnishToolConfig = {
  id: 'item'
  iconSrc: string
  label: string
  catalogCategory: CatalogCategory
}

export const furnishTools: FurnishToolConfig[] = [
  { id: 'item', iconSrc: '/icons/couch.webp', label: '家具', catalogCategory: 'furniture' },
  { id: 'item', iconSrc: '/icons/appliance.webp', label: '家电', catalogCategory: 'appliance' },
  { id: 'item', iconSrc: '/icons/kitchen.webp', label: '厨房', catalogCategory: 'kitchen' },
  { id: 'item', iconSrc: '/icons/bathroom.webp', label: '卫浴', catalogCategory: 'bathroom' },
  { id: 'item', iconSrc: '/icons/tree.webp', label: '户外', catalogCategory: 'outdoor' },
]
