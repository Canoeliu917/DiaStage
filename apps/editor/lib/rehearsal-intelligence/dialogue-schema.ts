import { SceneContextSummarySchema, StagePlanSchema } from '@pascal-app/core/stage'
import { z } from 'zod'
import { OpenLanguageContextSchema, StructuredGroundingSchema } from './open-language'

export const DialogueHistorySchema = z
  .array(
    z.strictObject({
      role: z.enum(['user', 'dia', 'system-state']),
      content: z.string().max(2000),
      sceneVersion: z.string().max(200),
    }),
  )
  .max(8)

export const DiaDialogueContextSchema = z.strictObject({
  sceneVersion: z.string().min(1).max(200),
  sceneContext: SceneContextSummarySchema,
  openContext: OpenLanguageContextSchema,
  history: DialogueHistorySchema,
  historyTruncated: z.boolean(),
  pendingPlan: StagePlanSchema.nullable(),
})
export type DiaDialogueContext = z.infer<typeof DiaDialogueContextSchema>
export const DiaDialogueRequestSchema = DiaDialogueContextSchema.extend({
  rawUtterance: z.string().trim().min(1).max(2000),
})
export const DiaDialogueResultSchema = z.strictObject({
  sceneVersion: z.string().min(1),
  reply: z.string().min(1).max(2000),
  provider: z.enum(['aliyun', 'openai']),
  model: z.string().min(1),
  plan: StagePlanSchema.nullable(),
  grounding: StructuredGroundingSchema.nullable(),
  localView: z.boolean(),
})
export type DiaDialogueResult = z.infer<typeof DiaDialogueResultSchema>
