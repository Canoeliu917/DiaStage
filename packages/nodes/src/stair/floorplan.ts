import type {
  FloorplanGeometry,
  GeometryContext,
  StairNode,
  StairSegmentNode,
} from '@pascal-app/core'

export function buildStairFloorplan(
  stair: StairNode,
  ctx: GeometryContext,
): FloorplanGeometry | null {
  const segment = ctx.children?.find(
    (child): child is StairSegmentNode => child.type === 'stair-segment' && child.visible !== false,
  )
  if (!segment) return null
  const selected = ctx.viewState?.selected ?? false
  const body: FloorplanGeometry[] = [
    {
      kind: 'rect',
      x: -segment.width / 2,
      y: 0,
      width: segment.width,
      height: segment.length,
      fill: selected ? 'rgba(59, 130, 246, 0.08)' : 'rgba(255, 255, 255, 0.02)',
      stroke: '#171717',
      strokeWidth: 0.025,
      opacity: 0.9,
    },
  ]
  for (let index = 1; index < segment.stepCount; index += 1) {
    const z = (segment.length * index) / segment.stepCount
    body.push({
      kind: 'line',
      x1: -segment.width / 2,
      y1: z,
      x2: segment.width / 2,
      y2: z,
      stroke: selected ? '#2563eb' : '#262626',
      strokeWidth: 0.015,
      opacity: 0.75,
    })
  }
  const footprint: FloorplanGeometry = {
    kind: 'group',
    transform: { translate: [stair.position[0], stair.position[2]], rotate: -stair.rotation },
    children: body,
  }
  if (!selected) return footprint
  const localX = segment.width / 2 + 0.4
  const localZ = -0.4
  const cos = Math.cos(stair.rotation)
  const sin = Math.sin(stair.rotation)
  const x = stair.position[0] + localX * cos + localZ * sin
  const z = stair.position[2] - localX * sin + localZ * cos
  return {
    kind: 'group',
    children: [
      footprint,
      {
        kind: 'rotate-arrow',
        point: [x, z],
        angle: Math.atan2(z - stair.position[2], x - stair.position[0]),
        affordance: 'stair-rotate',
        pivot: [stair.position[0], stair.position[2]],
      },
      { kind: 'move-handle', point: [stair.position[0], stair.position[2]] },
    ],
  }
}
