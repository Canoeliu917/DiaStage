import { CeilingNode, type NodeDefinition } from '@pascal-app/core'

// Schema-only registration keeps old documents readable without mounting architecture tools.
export const ceilingDefinition: NodeDefinition<typeof CeilingNode> = {
  kind: 'ceiling',
  schemaVersion: 1,
  schema: CeilingNode,
  category: 'structure',
  defaults: () => {
    const {
      id: _id,
      type: _type,
      ...data
    } = CeilingNode.parse({
      polygon: [
        [0, 0],
        [1, 0],
        [0, 1],
      ],
    })
    return data
  },
  capabilities: {},
}
