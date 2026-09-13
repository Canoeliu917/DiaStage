import type { CatalogCategory, StructureTool } from '../../../store/use-editor'

export type ToolConfig = {
  id: StructureTool
  iconSrc: string
  label: string
  catalogCategory?: CatalogCategory
}

// Shared stage-tool metadata used by cursor and floorplan indicators.
export const tools: ToolConfig[] = [
  { id: 'block', iconSrc: '/icons/cube.webp', label: '台块 / 平台' },
  { id: 'wall', iconSrc: '/icons/wall.webp', label: '景片' },
  { id: 'door', iconSrc: '/icons/door.webp', label: '实用门' },
  { id: 'window', iconSrc: '/icons/window.webp', label: '实用窗' },
  { id: 'stair', iconSrc: '/icons/stairs.webp', label: '台阶' },
  { id: 'fence', iconSrc: '/icons/fence.webp', label: '栏杆' },
  { id: 'shelf', iconSrc: '/icons/shelf.webp', label: '置物架' },
]
