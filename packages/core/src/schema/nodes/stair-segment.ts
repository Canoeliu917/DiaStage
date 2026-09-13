import dedent from 'dedent'
import { z } from 'zod'
import { BaseNode, nodeType, objectId } from '../base'
import { MaterialSchema } from '../material'

export const StairSegmentNode = BaseNode.extend({
  id: objectId('sseg'),
  type: nodeType('stair-segment'),
  material: MaterialSchema.optional(),
  materialPreset: z.string().optional(),
  width: z.number().positive().default(1.2),
  length: z.number().positive().default(0.9),
  height: z.number().positive().default(0.45),
  stepCount: z.number().int().positive().default(3),
}).describe(
  dedent`
  Dimension data for one straight set of stage steps.
  - width: total width in meters
  - length: total horizontal run in meters
  - height: total rise in meters
  - stepCount: number of equal treads
  `,
)

export type StairSegmentNode = z.infer<typeof StairSegmentNode>
