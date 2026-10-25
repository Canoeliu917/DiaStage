import { z } from 'zod'
import { fetchAiWithBudgetConsent } from '../ai/budget-client'
import {
  type OpenLanguageContext,
  OpenLanguageRequestSchema,
  StructuredGroundingSchema,
  validateOpenGrounding,
} from './open-language'

export const OpenGroundingResponseSchema = z.strictObject({
  requestId: z.string().uuid(),
  grounding: StructuredGroundingSchema,
  provider: z.literal('openai'),
  model: z.string().min(1),
  reply: z.string().max(2000).default(''),
})
const ErrorResponseSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
})
export class OpenGroundingRequestError extends Error {}

export async function requestOpenGrounding(
  rawUtterance: string,
  context: OpenLanguageContext,
  signal: AbortSignal,
) {
  const body = OpenLanguageRequestSchema.parse({ rawUtterance, context })
  let response: Response
  try {
    const result = await fetchAiWithBudgetConsent('/api/dia/ground', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.any([signal, AbortSignal.timeout(65000)]),
    })
    response = result.response
  } catch {
    signal.throwIfAborted()
    throw new OpenGroundingRequestError('Dia 语义服务暂时无法连接，请稍后重试；可继续手动置景。')
  }
  const result: unknown = await response.json().catch(() => null)
  signal.throwIfAborted()
  if (!response.ok) {
    const error = ErrorResponseSchema.safeParse(result).data?.error
    if (error && ['PLAN_INVALID', 'AMBIGUOUS_COMMAND'].includes(error.code))
      throw new Error(error.message)
    throw new OpenGroundingRequestError(
      error?.message ?? 'Dia 语义服务暂时不可用，请稍后重试；可继续手动置景。',
    )
  }
  const validated = OpenGroundingResponseSchema.safeParse(result)
  if (!validated.success)
    throw new OpenGroundingRequestError('Dia 语义服务返回的内容未通过验证，请稍后重试。')
  const parsed = validated.data
  if (parsed.grounding.rawUtterance !== rawUtterance)
    throw new OpenGroundingRequestError('Dia 语义服务返回的口令不匹配，请重试。')
  if (!parsed.grounding.requiresClarification)
    validateOpenGrounding(parsed.grounding, rawUtterance, context)
  return parsed
}
