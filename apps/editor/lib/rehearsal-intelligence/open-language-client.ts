import { z } from 'zod'
import { fetchAiWithBudgetConsent } from '../ai/budget-client'
import {
  type OpenLanguageContext,
  OpenLanguageRequestSchema,
  StructuredGroundingSchema,
  validateOpenGrounding,
} from './open-language'

export const OpenGroundingResponseSchema = z.strictObject({
  grounding: StructuredGroundingSchema,
  provider: z.literal('openai'),
  model: z.string().min(1),
  reply: z.string().max(2000).default(''),
})
export async function requestOpenGrounding(
  rawUtterance: string,
  context: OpenLanguageContext,
  signal: AbortSignal,
) {
  const body = OpenLanguageRequestSchema.parse({ rawUtterance, context })
  const { response } = await fetchAiWithBudgetConsent('/api/dia/ground', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.any([signal, AbortSignal.timeout(65000)]),
  })
  const result: unknown = await response.json()
  signal.throwIfAborted()
  if (!response.ok)
    throw new Error('当前语义服务不可用或返回内容未通过验证；请明确对象与已支持的搭建要求。')
  const parsed = OpenGroundingResponseSchema.parse(result)
  if (parsed.grounding.rawUtterance !== rawUtterance) throw new Error('返回口令不匹配。')
  if (!parsed.grounding.requiresClarification)
    validateOpenGrounding(parsed.grounding, rawUtterance, context)
  return parsed
}
