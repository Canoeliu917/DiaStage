import { type NodeDefinition, RoofSegmentNode } from '@pascal-app/core'

// Schema-only registration keeps old documents readable without mounting architecture tools.
export const roofSegmentDefinition: NodeDefinition<typeof RoofSegmentNode> = {
  kind: 'roof-segment',
  schemaVersion: 5,
  schema: RoofSegmentNode,
  category: 'structure',
  defaults: () => {
    const { id: _id, type: _type, ...data } = RoofSegmentNode.parse({})
    return data
  },
  capabilities: {},
}
