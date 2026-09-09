import type { AnyNode, BuildingNode, LevelNode, ZoneNode } from '@pascal-app/core'
import { nodeRegistry } from '@pascal-app/core/registry'

export type StageNodeRow = {
  id: AnyNode['id']
  name: string
  typeLabel: string
  kind: 'light' | 'object' | 'container'
  parentLabel: string
  visible: boolean
  effectiveVisible: boolean
}

export type StageNodeSelection = {
  buildingId: BuildingNode['id'] | null
  levelId: LevelNode['id'] | null
  zoneId: ZoneNode['id'] | null
  selectedIds: AnyNode['id'][]
}

function isContainer(node: AnyNode): boolean {
  return node.type === 'site' || node.type === 'building' || node.type === 'level'
}

function isLight(node: AnyNode): boolean {
  return (
    node.type === 'item' &&
    (node.asset.interactive?.effects.some((effect) => effect.kind === 'light') ?? false)
  )
}

function typeLabel(node: AnyNode): string {
  if (node.type === 'item') return isLight(node) ? '点光灯' : '物件'
  return nodeRegistry.get(node.type)?.presentation?.label ?? '场景节点'
}

function nodeName(node: AnyNode): string {
  return (
    node.name?.trim() || (node.type === 'item' ? node.asset.name.trim() : '') || typeLabel(node)
  )
}

function ancestors(nodes: Record<string, AnyNode>, node: AnyNode): AnyNode[] {
  const result: AnyNode[] = []
  const visited = new Set([node.id])
  let parent = node.parentId ? nodes[node.parentId] : undefined
  while (parent && !visited.has(parent.id)) {
    visited.add(parent.id)
    result.push(parent)
    parent = parent.parentId ? nodes[parent.parentId] : undefined
  }
  return result
}

const nameOrder = new Intl.Collator('zh-CN', { numeric: true })
const kindOrder: Record<StageNodeRow['kind'], number> = { light: 0, container: 1, object: 2 }

export function buildStageRows(nodes: Record<string, AnyNode>): StageNodeRow[] {
  return Object.values(nodes)
    .map((node): StageNodeRow => {
      const parents = ancestors(nodes, node)
      const label = typeLabel(node)
      return {
        id: node.id,
        name: nodeName(node),
        typeLabel: label,
        kind: isLight(node) ? 'light' : isContainer(node) ? 'container' : 'object',
        parentLabel: parents.reverse().map(nodeName).join(' / ') || '根级',
        visible: node.visible !== false,
        effectiveVisible:
          node.visible !== false && parents.every((parent) => parent.visible !== false),
      }
    })
    .sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind] || nameOrder.compare(a.name, b.name))
}

export function getStageNodeSelection(
  nodes: Record<string, AnyNode>,
  id: string,
): StageNodeSelection {
  const node = nodes[id]
  if (!node || node.type === 'site')
    return { buildingId: null, levelId: null, zoneId: null, selectedIds: [] }
  const lineage = [node, ...ancestors(nodes, node)]
  return {
    buildingId: lineage.find((ancestor) => ancestor.type === 'building')?.id ?? null,
    levelId:
      node.type === 'building'
        ? null
        : (lineage.find((ancestor) => ancestor.type === 'level')?.id ?? null),
    zoneId: isContainer(node)
      ? null
      : (lineage.find((ancestor) => ancestor.type === 'zone')?.id ?? null),
    selectedIds: isContainer(node) || node.type === 'zone' ? [] : [node.id],
  }
}
