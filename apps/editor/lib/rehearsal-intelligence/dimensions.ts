import { z } from 'zod'

export const ONTOLOGY_VERSION = 'diastage-dramaturgy-0.1' as const
export const PROMPT_VERSION = 'rehearsal-partner-0.2' as const
export const ACTIVE_DIMENSIONS = [
  'character',
  'objective',
  'relationship',
  'action',
  'tactic',
  'conflict',
  'spatial_relationship',
  'state_change',
] as const
export const DimensionIdSchema = z.enum(ACTIVE_DIMENSIONS)
export const DimensionSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  category: z.string().min(1),
  status: z.enum(['ACTIVE', 'OBSERVE', 'DISABLED']),
  version: z.string().min(1),
})
export const DIMENSIONS = [
  ['character', '人物', '谁在行动？', '人物'],
  ['objective', '目标', '他现在最想改变什么？', '意图'],
  ['relationship', '关系', '他们如何看待彼此？', '人物'],
  ['action', '行动', '他正在做什么来改变对方？', '行动'],
  ['tactic', '策略', '他用了什么办法？', '行动'],
  ['conflict', '冲突', '谁或什么正在阻止他？', '关系'],
  ['spatial_relationship', '空间关系', '距离和朝向如何表达这次尝试？', '空间'],
  ['state_change', '状态变化', '这次尝试前后发生了什么变化？', '变化'],
].map(([id, name, description, category]) =>
  DimensionSchema.parse({
    id,
    name,
    description,
    category,
    status: 'ACTIVE',
    version: ONTOLOGY_VERSION,
  }),
)

// The supplied specification names only eight dimensions; never invent the other thirty.
export const ONTOLOGY_COMPLETENESS = {
  registered: DIMENSIONS.length,
  required: 38,
  complete: false,
}
