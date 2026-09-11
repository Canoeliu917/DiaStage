import { type NodeDefinition, StairSegmentNode as StairSegmentNodeSchema } from '@pascal-app/core'
import { StairSegmentNode } from './schema'

/** Data-only child holding the dimensions of one straight set of stage steps. */
export const stairSegmentDefinition: NodeDefinition<typeof StairSegmentNode> = {
  kind: 'stair-segment',
  schemaVersion: 1,
  schema: StairSegmentNode,
  category: 'structure',
  defaults: () => {
    const stub = StairSegmentNodeSchema.parse({
      id: 'stair-segment_default' as never,
      type: 'stair-segment',
    })
    const { id: _id, type: _type, ...rest } = stub
    return rest
  },
  capabilities: { duplicable: false, deletable: false },
  presentation: {
    label: '踏步数据',
    description: '舞台台阶的尺寸数据。',
    icon: { kind: 'url', src: '/icons/stairs.webp' },
    paletteSection: 'structure',
    paletteOrder: 111,
  },
  mcp: { description: 'Dimensions for one straight set of stage steps.' },
}
