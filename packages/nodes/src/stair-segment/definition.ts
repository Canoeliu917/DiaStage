import { type NodeDefinition, StairSegmentNode as StairSegmentNodeSchema } from '@pascal-app/core'
import { stairSegmentParametrics } from './parametrics'
import { StairSegmentNode } from './schema'

/**
 * Stair segment — Stage A. Child of a stair node; per-flight geometry.
 * Built by `StairSystem` registered on the parent stair definition.
 */
export const stairSegmentDefinition: NodeDefinition<typeof StairSegmentNode> = {
  kind: 'stair-segment',
  schemaVersion: 1,
  schema: StairSegmentNode,
  category: 'structure',
  surfaceRole: 'joinery',

  defaults: () => {
    const stub = StairSegmentNodeSchema.parse({
      id: 'stair-segment_default' as never,
      type: 'stair-segment',
    })
    const { id: _id, type: _type, ...rest } = stub
    return rest
  },

  capabilities: {
    selectable: { hitVolume: 'bbox' },
    duplicable: false,
    deletable: false,
  },

  parametrics: stairSegmentParametrics,

  renderer: {
    kind: 'parametric',
    module: () => import('./renderer'),
  },

  presentation: {
    label: '踏步',
    description: '舞台台阶的踏步，随整组台阶一起调整。',
    icon: { kind: 'url', src: '/icons/stairs.webp' },
    paletteSection: 'structure',
    paletteOrder: 111,
  },

  mcp: {
    description: 'A single stair flight with run + rise + tread parameters.',
  },
}
