import type { CatalogCategory, StructureTool } from '../../../store/use-editor'

export type ToolConfig = {
  id: StructureTool
  iconSrc: string
  label: string
  catalogCategory?: CatalogCategory
}

// Shared structure-tool metadata (icons + labels). The build palette now lives
// in the community Build sidebar; this list survives only as the lookup table
// for cursor/floorplan indicators. Roof-mounted accessories are intentionally
// absent — they're placed from the roof inspector's "Add element" section.
export const tools: ToolConfig[] = [
  { id: 'block', iconSrc: '/icons/cube.webp', label: '台块 / 平台' },
  { id: 'wall', iconSrc: '/icons/wall.webp', label: '景片' },
  { id: 'door', iconSrc: '/icons/door.webp', label: '实用门' },
  { id: 'window', iconSrc: '/icons/window.webp', label: '实用窗' },
  { id: 'stair', iconSrc: '/icons/stairs.webp', label: '台阶' },
  { id: 'fence', iconSrc: '/icons/fence.webp', label: '栏杆' },
  { id: 'shelf', iconSrc: '/icons/shelf.webp', label: '置物架' },
]
