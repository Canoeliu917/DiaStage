import type { AnyNode, StairNode } from '../../schema'

/** Stage rises are authored dimensions, independent of storeys and slab elevations. */
export function resolveStairTotalRise(stair: StairNode, nodes: Record<string, AnyNode>): number {
  if (stair.totalRise !== undefined) return stair.totalRise
  const segments = stair.children
    .map((id) => nodes[id])
    .filter((node) => node?.type === 'stair-segment')
  if (segments.length) return segments.reduce((sum, segment) => sum + segment.height, 0)
  return Math.max(1, stair.stepCount) * 0.15
}
