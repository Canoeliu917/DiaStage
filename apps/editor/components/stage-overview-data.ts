import type { AnyNode, BuildingNode, LevelNode, ZoneNode } from '@pascal-app/core'
import { getTheatreNodeLabel, getTheatreNodeName } from '@pascal-app/editor'
import { isLegacyLight } from '@/lib/legacy-lighting'

export type StageNodeRow = {
  id: AnyNode['id']
  name: string
  typeLabel: string
  kind: 'object'
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

function typeLabel(node: AnyNode): string {
  const theatreLabels: Record<string, string> = {
    furniture: '家具',
    prop: '舞台物件',
    'scenic-unit': '布景',
    'stage-floor': '舞台地面',
  }
  const theatreKind = node.metadata.theatreKind
  if (typeof theatreKind === 'string' && theatreLabels[theatreKind])
    return theatreLabels[theatreKind]
  if (node.type === 'item') return '物件'
  return getTheatreNodeLabel(node.type)
}

function nodeName(node: AnyNode): string {
  return getTheatreNodeName(node)
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

export function buildStageRows(nodes: Record<string, AnyNode>): StageNodeRow[] {
  return Object.values(nodes)
    .filter(
      (node) =>
        !isContainer(node) &&
        !isLegacyLight(node) &&
        node.type !== 'zone' &&
        node.type !== 'stair-segment',
    )
    .map((node): StageNodeRow => {
      const parents = ancestors(nodes, node)
      const label = typeLabel(node)
      return {
        id: node.id,
        name: nodeName(node),
        typeLabel: label,
        kind: 'object',
        parentLabel: parents.reverse().map(nodeName).join(' / ') || '根级',
        visible: node.visible !== false,
        effectiveVisible:
          node.visible !== false && parents.every((parent) => parent.visible !== false),
      }
    })
    .sort((a, b) => nameOrder.compare(a.name, b.name))
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
