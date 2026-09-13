import type { AnyNode, AnyNodeId, FloorPlacedFootprint, StairNode } from '@pascal-app/core'

export function getStairFloorPlacedFootprints(
  stair: StairNode,
  nodes: Readonly<Record<AnyNodeId, AnyNode>>,
): FloorPlacedFootprint[] {
  const segment = nodes[stair.children[0] as AnyNodeId]
  if (segment?.type !== 'stair-segment') return []
  const halfRun = segment.length / 2
  const cos = Math.cos(stair.rotation)
  const sin = Math.sin(stair.rotation)
  return [
    {
      position: [
        stair.position[0] + halfRun * sin,
        stair.position[1],
        stair.position[2] + halfRun * cos,
      ],
      dimensions: [segment.width, Math.max(segment.height, 0.01), segment.length],
      rotation: [0, stair.rotation, 0],
    },
  ]
}
