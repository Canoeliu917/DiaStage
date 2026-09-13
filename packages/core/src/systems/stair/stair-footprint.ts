import type { AnyNode, AnyNodeId, StairNode } from '../../schema'

export type StairFootprintAABB = { minX: number; minZ: number; maxX: number; maxZ: number }

/** Axis-aligned XZ bounds for one straight set of stage steps. */
export function stairFootprintAABB(
  stair: StairNode,
  nodes?: Readonly<Record<string, AnyNode>>,
): StairFootprintAABB | null {
  const segment = nodes?.[stair.children[0] as AnyNodeId]
  if (segment?.type !== 'stair-segment') return null
  const halfWidth = segment.width / 2
  const corners = [
    [-halfWidth, 0],
    [halfWidth, 0],
    [halfWidth, segment.length],
    [-halfWidth, segment.length],
  ] as const
  const cos = Math.cos(stair.rotation)
  const sin = Math.sin(stair.rotation)
  const points = corners.map(([x, z]) => [
    stair.position[0] + x * cos + z * sin,
    stair.position[2] - x * sin + z * cos,
  ])
  return {
    minX: Math.min(...points.map((point) => point[0]!)),
    minZ: Math.min(...points.map((point) => point[1]!)),
    maxX: Math.max(...points.map((point) => point[0]!)),
    maxZ: Math.max(...points.map((point) => point[1]!)),
  }
}
