import type { AnyNode, AnyNodeId, LevelNode as LevelNodeType } from '@pascal-app/core'

function sortLevelsByHeight(levels: LevelNodeType[]) {
  return [...levels].sort((left, right) => left.level - right.level)
}

function isLevelNode(node: AnyNode | undefined): node is LevelNodeType {
  return node?.type === 'level'
}

function getAllSceneLevels(nodes: Record<string, AnyNode>) {
  return sortLevelsByHeight(
    Object.values(nodes).filter((entry): entry is LevelNodeType => entry?.type === 'level'),
  )
}

function getBuildingLevels(
  nodes: Record<string, AnyNode>,
  buildingId: AnyNodeId | string | null | undefined,
  source?: LevelNodeType,
) {
  if (!buildingId) return source ? [source] : []
  const building = nodes[buildingId as AnyNodeId]
  if (building?.type !== 'building') return source ? [source] : []

  const levels = new Map<string, LevelNodeType>()
  if (source) levels.set(source.id, source)

  for (const childId of building.children ?? []) {
    const child = nodes[childId as AnyNodeId]
    if (isLevelNode(child)) levels.set(child.id, child)
  }

  for (const candidate of Object.values(nodes)) {
    if (isLevelNode(candidate) && candidate.parentId === building.id) {
      levels.set(candidate.id, candidate)
    }
  }

  return sortLevelsByHeight(Array.from(levels.values()))
}

export function resolveStairPlacementLevelId(
  nodes: Record<string, AnyNode>,
  preferredLevelId: AnyNodeId | string | null | undefined,
  preferredBuildingId?: AnyNodeId | string | null,
) {
  if (isLevelNode(nodes[preferredLevelId as AnyNodeId])) {
    return preferredLevelId as LevelNodeType['id']
  }

  const buildingLevels = getBuildingLevels(nodes, preferredBuildingId)
  return buildingLevels[0]?.id ?? getAllSceneLevels(nodes)[0]?.id ?? null
}
