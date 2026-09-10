import { expect, test } from 'bun:test'
import { type AnyNode, type AnyNodeId, BuildingNode, LevelNode } from '@pascal-app/core/schema'
import { resolveStairPlacementLevelId } from './stair-levels'

test('falls back from stale placement level ids to a valid level in the selected building', () => {
  const buildingA = BuildingNode.parse({})
  const groundA = LevelNode.parse({ level: 0, parentId: buildingA.id })
  const buildingB = BuildingNode.parse({})
  const groundB = LevelNode.parse({ level: 0, parentId: buildingB.id })
  const nodes = {
    [buildingA.id]: { ...buildingA, children: [groundA.id] },
    [groundA.id]: groundA,
    [buildingB.id]: { ...buildingB, children: [groundB.id] },
    [groundB.id]: groundB,
  } as Record<AnyNodeId, AnyNode>

  expect(resolveStairPlacementLevelId(nodes, 'level_missing', buildingB.id)).toBe(groundB.id)
})
