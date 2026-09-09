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
  { id: 'wall', iconSrc: '/icons/wall.webp', label: '墙体' },
  { id: 'door', iconSrc: '/icons/door.webp', label: '门' },
  { id: 'window', iconSrc: '/icons/window.webp', label: '窗' },
  { id: 'stair', iconSrc: '/icons/stairs.webp', label: '楼梯' },
  { id: 'roof', iconSrc: '/icons/roof.webp', label: '双坡屋顶' },
  { id: 'fence', iconSrc: '/icons/fence.webp', label: '围栏' },
  { id: 'column', iconSrc: '/icons/column.webp', label: '柱体' },
  { id: 'elevator', iconSrc: '/icons/elevator.webp', label: '电梯' },
  { id: 'slab', iconSrc: '/icons/floor.webp', label: '楼板' },
  { id: 'ceiling', iconSrc: '/icons/ceiling.webp', label: '天花板' },
  { id: 'zone', iconSrc: '/icons/zone.webp', label: '区域' },
  { id: 'spawn', iconSrc: '/icons/spawn-point.webp', label: '出生点' },
  { id: 'shelf', iconSrc: '/icons/shelf.webp', label: '置物架' },
  { id: 'duct-segment', iconSrc: '/icons/duct.webp', label: '风管' },
  { id: 'duct-fitting', iconSrc: '/icons/duct-fitting.webp', label: '风管配件' },
  { id: 'duct-terminal', iconSrc: '/icons/registers.webp', label: '风口' },
  { id: 'hvac-equipment', iconSrc: '/icons/HVAC.webp', label: '暖通设备' },
  { id: 'pipe-segment', iconSrc: '/icons/dwv-pipes.webp', label: '排水通气管' },
  { id: 'pipe-trap', iconSrc: '/icons/dwv-pipes.webp', label: '存水弯' },
  { id: 'pipe-fitting', iconSrc: '/icons/duct-fitting.webp', label: '管道配件' },
  { id: 'lineset', iconSrc: '/icons/lineset.webp', label: '制冷剂管组' },
  { id: 'liquid-line', iconSrc: '/icons/lineset.webp', label: '液管' },
]
