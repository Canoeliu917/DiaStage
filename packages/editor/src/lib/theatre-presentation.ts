import type { AnyNode } from '@pascal-app/core'

const EDITABLE_TYPES = new Set([
  'block',
  'wall',
  'fence',
  'shelf',
  'door',
  'window',
  'stair',
  'stair-segment',
  'item',
  'column',
  'slab',
  'zone',
  'spawn',
])

export function isTheatreEditableType(type: string | null): boolean {
  return type !== null && EDITABLE_TYPES.has(type)
}

const LABELS: Record<string, string> = {
  site: '场地',
  building: '舞台空间',
  level: '表演层',
  zone: '表演区',
  block: '台块',
  wall: '景片',
  fence: '栏杆',
  shelf: '置物架',
  door: '实用门',
  window: '实用窗',
  stair: '舞台台阶',
  'stair-segment': '台阶段',
  slab: '舞台地面',
  ceiling: '上空遮挡',
  column: '立柱',
  item: '道具与陈设',
  scan: '场地参考',
  guide: '平面参考',
  spawn: '观察起点',
}

export function getTheatreNodeLabel(type: string): string {
  return LABELS[type] ?? '兼容物件'
}

export function getTheatreNodeName(node: AnyNode): string {
  const name = node.name?.trim()
  // Imported display defaults are adapted without rewriting names in saved scenes.
  if (
    name &&
    !/^(Site|Building|Level|Wall|Roof|Slab|Ceiling|Zone|Stair|建筑|楼层|墙体|屋顶|楼板|天花板)(\s*[\d.-]+)?$/i.test(
      name,
    )
  )
    return name
  if (node.type === 'level') return `${getTheatreNodeLabel(node.type)} ${node.level}`
  if (node.type === 'item') return node.asset?.name || getTheatreNodeLabel(node.type)
  return getTheatreNodeLabel(node.type)
}
