import {
  ClarificationAnswerSchema,
  parseStageText,
  SceneContextSummarySchema,
  type StagePlan,
  StagePlanSchema,
  validateStagePlan,
} from '@pascal-app/core/stage'
import { z } from 'zod'
import { AiError } from './api'
import { trackAiCall } from './usage'

export const PlanRequestSchema = z.strictObject({
  source: z.enum(['voice', 'typed-command']),
  input: z.string().trim().min(1).max(10_000),
  sceneContext: SceneContextSummarySchema,
  priorAnswers: z.array(ClarificationAnswerSchema).max(30),
})
export type PlanRequest = z.infer<typeof PlanRequestSchema>
export type ModelPlanner = (request: PlanRequest, signal: AbortSignal) => Promise<unknown>

const callModel: ModelPlanner = async (request, signal) => {
  const { generateStagePlan } = await import('./openai-server')
  return generateStagePlan(request, signal)
}

export async function planStageRequest(
  input: unknown,
  signal: AbortSignal,
  modelPlanner: ModelPlanner = callModel,
): Promise<StagePlan> {
  const request = PlanRequestSchema.safeParse(input)
  if (!request.success)
    throw new AiError('PLAN_INVALID', '口令或舞台摘要格式有误；口令最多 10,000 个字符。')
  signal.throwIfAborted()
  const { source, sceneContext, priorAnswers } = request.data
  const localPlan = parseStageText(request.data.input, sceneContext, priorAnswers, source)
  if (localPlan)
    return trackAiCall(
      'stage-command',
      'local-parser',
      signal,
      async () => validateStagePlan(localPlan, sceneContext).plan,
      () => null,
    )
  for (let attempt = 0; attempt < 2; attempt++) {
    signal.throwIfAborted()
    let raw: unknown
    try {
      raw = await modelPlanner(request.data, signal)
    } catch (error) {
      if (signal.aborted) signal.throwIfAborted()
      if (error instanceof SyntaxError || error instanceof z.ZodError) {
        if (attempt === 0) continue
        break
      }
      throw error
    }
    signal.throwIfAborted()
    const result = StagePlanSchema.safeParse(raw)
    if (!result.success) continue
    if (
      result.data.source !== source ||
      result.data.items.some(
        (item) => item.libraryAssetId !== null || item.evidenceIds.length > 0,
      ) ||
      result.data.evidence.length > 0
    )
      throw new AiError(
        'PLAN_INVALID',
        '方案包含未经授权的来源、素材或证据引用，请重新生成。',
        422,
        true,
      )
    // Domain conflicts and questions remain reviewable; they never grant permission to execute.
    return validateStagePlan(result.data, sceneContext).plan
  }
  throw new AiError('PLAN_INVALID', '未能生成有效的舞台方案，请调整口令后重新生成。', 422, true)
}
