import type { AnyNode } from '@pascal-app/core'
import { getTheatreNodeLabel, getTheatreNodeName } from '../../../lib/theatre-presentation'

export type NodeDisplay = {
  icon: string
  label: string
}

const TYPE_DEFAULTS: Record<string, NodeDisplay> = {
  item: { icon: '/icons/item.webp', label: '物体' },
  wall: { icon: '/icons/wall.webp', label: '墙体' },
  door: { icon: '/icons/door.webp', label: '门' },
  window: { icon: '/icons/window.webp', label: '窗' },
  slab: { icon: '/icons/floor.webp', label: '舞台地面' },
  fence: { icon: '/icons/fence.webp', label: '围栏' },
  stair: { icon: '/icons/stairs.webp', label: '舞台台阶' },
  'stair-segment': { icon: '/icons/stairs.webp', label: '台阶段' },
  scan: { icon: '/icons/mesh.webp', label: '三维扫描' },
  guide: { icon: '/icons/floorplan.webp', label: '参考图' },
}

export function getTypeDisplay(type: string): NodeDisplay {
  return { icon: TYPE_DEFAULTS[type]?.icon ?? '/icons/select.webp', label: getTheatreNodeLabel(type) }
}

export function getNodeDisplay(node: AnyNode | null | undefined): NodeDisplay {
  if (!node) return { icon: '/icons/select.webp', label: '选中物体' }
  const fallback = TYPE_DEFAULTS[node.type] ?? { icon: '/icons/select.webp', label: node.type }
  // Item nodes carry an asset with its own thumbnail/name
  if (node.type === 'item') {
    return {
      icon: node.asset?.thumbnail || fallback.icon,
      label: getTheatreNodeName(node),
    }
  }
  return {
    icon: fallback.icon,
    label: getTheatreNodeName(node),
  }
}
