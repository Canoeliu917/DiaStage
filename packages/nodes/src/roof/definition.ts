import { type NodeDefinition, RoofNode } from '@pascal-app/core'

// Schema-only registration keeps old documents readable without mounting architecture tools.
export const roofDefinition: NodeDefinition<typeof RoofNode> = {
  kind: 'roof',
  schemaVersion: 2,
  schema: RoofNode,
  category: 'structure',
  defaults: () => {
    const { id: _id, type: _type, ...data } = RoofNode.parse({})
    return data
  },
  capabilities: {},
}
