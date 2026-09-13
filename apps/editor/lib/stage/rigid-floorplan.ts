import {
  type AnyNode,
  type AnyNodeId,
  type FloorplanGeometry,
  type GeometryContext,
  getScaledDimensions,
} from '@pascal-app/core'
import { DIA_COLORS } from '@/lib/visual-system'
import { stageModelFootprints } from './model-contact'

export function centeredPropFloorplan(
  geometry: FloorplanGeometry | null,
  node: AnyNode,
  context: GeometryContext,
): FloorplanGeometry | null {
  if (
    node.type === 'item' &&
    node.asset.id.startsWith('SCN-') &&
    (!node.parentId || context.resolve(node.parentId as AnyNodeId)?.type === 'level')
  ) {
    const [width, height, depth] = getScaledDimensions(node)
    const [x, y, z] = node.position
    const polygons = stageModelFootprints({
      id: node.id,
      kind: 'neutral-block',
      dimensionsMeters: { width, height, depth },
      transform: {
        position: { x, y, z },
        rotationDegrees: {
          x: (node.rotation[0] * 180) / Math.PI,
          y: (node.rotation[1] * 180) / Math.PI,
          z: (node.rotation[2] * 180) / Math.PI,
        },
      },
    })
    if (polygons) {
      const selected = context.viewState?.selected || context.viewState?.highlighted
      const children: FloorplanGeometry[] = polygons.map((points) => ({
        kind: 'polygon',
        points,
        fill: '#deded8',
        stroke: selected ? DIA_COLORS.ink : '#777',
        strokeWidth: selected ? 0.02 : 0.012,
      }))
      return { kind: 'group', children }
    }
  }
  if (geometry?.kind === 'group' && ['item', 'block', 'stair'].includes(node.type))
    return {
      ...geometry,
      children: geometry.children.filter(
        (child) => child.kind !== 'move-handle' && child.kind !== 'rotate-arrow',
      ),
    }
  return geometry
}
