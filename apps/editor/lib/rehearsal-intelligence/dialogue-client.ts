import { z } from 'zod'
import { fetchAiWithBudgetConsent } from '../ai/budget-client'
import {
  type DiaDialogueContext,
  DiaDialogueRequestSchema,
  DiaDialogueResultSchema,
} from './dialogue-schema'
import { OpenGroundingRequestError } from './open-language-client'

const ResponseSchema = DiaDialogueResultSchema.extend({ requestId: z.string().uuid() })

export async function requestDiaDialogue(
  text: string,
  context: DiaDialogueContext,
  signal: AbortSignal,
) {
  const body = DiaDialogueRequestSchema.parse({ ...context, rawUtterance: text })
  let response: Response
  try {
    response = (
      await fetchAiWithBudgetConsent('/api/dia/dialogue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.any([signal, AbortSignal.timeout(65000)]),
      })
    ).response
  } catch {
    signal.throwIfAborted()
    throw new OpenGroundingRequestError('千问对话请求未完成；已有舞台与提案保留，请稍后重试。')
  }
  const raw: unknown = await response.json().catch(() => null)
  signal.throwIfAborted()
  if (!response.ok) {
    const error = z
      .object({ error: z.object({ code: z.string(), message: z.string() }) })
      .safeParse(raw).data?.error
    if (error && ['PLAN_INVALID', 'AMBIGUOUS_COMMAND'].includes(error.code))
      throw new Error(error.message)
    throw new OpenGroundingRequestError(error?.message ?? '模型请求未完成，正式舞台未改变。')
  }
  const result = ResponseSchema.safeParse(raw)
  if (!result.success || result.data.sceneVersion !== context.sceneVersion)
    throw new OpenGroundingRequestError('对话结果与当前舞台版本不匹配，请重新发送。')
  return result.data
}
