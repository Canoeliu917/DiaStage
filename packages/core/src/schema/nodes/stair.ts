import dedent from 'dedent'
import { z } from 'zod'
import { BaseNode, nodeType, objectId } from '../base'
import type { MaterialSchema as MaterialSchemaType } from '../material'
import { MaterialSchema } from '../material'
import { StairSegmentNode } from './stair-segment'

export type StairSurfaceMaterialRole = 'tread' | 'side'
export type StairSurfaceMaterialSpec = {
  material?: MaterialSchemaType
  materialPreset?: string
}

export const StairNode = BaseNode.extend({
  id: objectId('stair'),
  type: nodeType('stair'),
  material: MaterialSchema.optional(),
  materialPreset: z.string().optional(),
  treadMaterial: MaterialSchema.optional(),
  treadMaterialPreset: z.string().optional(),
  sideMaterial: MaterialSchema.optional(),
  sideMaterialPreset: z.string().optional(),
  slots: z.record(z.string(), z.string()).optional(),
  position: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
  rotation: z.number().default(0),
  supportSlabId: z.string().optional(),
  width: z.number().positive().default(1.2),
  totalRise: z.number().positive().optional(),
  stepCount: z.number().int().positive().default(3),
  children: z.array(StairSegmentNode.shape.id).default([]),
}).describe(
  dedent`
  A straight set of stage steps.
  - position: base-center position in meters
  - rotation: Y-axis rotation in radians
  - width, totalRise, stepCount: summary dimensions mirrored from its one child
  - children: one StairSegmentNode containing tread depth and rise
  `,
)

export type StairNode = z.infer<typeof StairNode>

function legacyMaterial(node: StairNode): StairSurfaceMaterialSpec {
  return { material: node.material, materialPreset: node.materialPreset }
}

export function getEffectiveStairSurfaceMaterial(
  node: StairNode,
  role: StairSurfaceMaterialRole,
): StairSurfaceMaterialSpec {
  const preferred =
    role === 'tread'
      ? { material: node.treadMaterial, materialPreset: node.treadMaterialPreset }
      : { material: node.sideMaterial, materialPreset: node.sideMaterialPreset }
  if (preferred.material !== undefined || typeof preferred.materialPreset === 'string') {
    return preferred
  }
  const alternate =
    role === 'tread'
      ? { material: node.sideMaterial, materialPreset: node.sideMaterialPreset }
      : { material: node.treadMaterial, materialPreset: node.treadMaterialPreset }
  if (alternate.material !== undefined || typeof alternate.materialPreset === 'string') {
    return alternate
  }
  return legacyMaterial(node)
}
