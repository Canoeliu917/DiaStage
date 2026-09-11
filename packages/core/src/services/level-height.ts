import type { LevelNode, SlabNode, WallNode } from '../schema'
import type { AnyNode, AnyNodeId } from '../schema/types'
import { computeWallSlabSupport } from '../systems/slab/slab-support'
import { resolveWallTop } from '../systems/wall/wall-top'

export const DEFAULT_LEVEL_HEIGHT = 2.5

export function deriveLegacyLevelHeight(
  levelId: string,
  nodes: Record<AnyNodeId, AnyNode>,
): number {
  const level = nodes[levelId as LevelNode['id']] as LevelNode | undefined
  if (!level) return DEFAULT_LEVEL_HEIGHT

  const levelChildren = level.children
    .map((childId) => nodes[childId as keyof typeof nodes])
    .filter((child): child is AnyNode => child !== undefined)
  const slabs = levelChildren.filter((child): child is SlabNode => child.type === 'slab')
  const walls = levelChildren.filter((child): child is WallNode => child.type === 'wall')

  let maxTop = 0

  for (const child of levelChildren) {
    if (child.type === 'wall') {
      const wall = child as WallNode
      const electedElevation = computeWallSlabSupport(
        {
          start: wall.start,
          end: wall.end,
          curveOffset: wall.curveOffset,
          thickness: wall.thickness,
        },
        slabs,
        walls,
      ).elevation
      const top = resolveWallTop(wall, level.height ?? DEFAULT_LEVEL_HEIGHT, electedElevation)
      if (top > maxTop) maxTop = top
    }
  }

  return maxTop > 0 ? maxTop : DEFAULT_LEVEL_HEIGHT
}
