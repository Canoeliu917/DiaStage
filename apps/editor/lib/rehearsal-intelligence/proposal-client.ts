import { z } from 'zod'
import { fetchAiWithBudgetConsent } from '../ai/budget-client'
import { validateInteraction } from './proposal-validator'
import type { RehearsalContext } from './schema'

const ResponseSchema = z.object({ interaction: z.unknown() })
const ErrorSchema = z.object({ error: z.object({ message: z.string() }) })

export async function requestProposal(context: RehearsalContext, signal: AbortSignal) {
  signal.throwIfAborted()
  const { response } = await fetchAiWithBudgetConsent('/api/rehearsal/propose', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(context),
    signal: AbortSignal.any([signal, AbortSignal.timeout(65000)]),
  })
  const body: unknown = await response.json()
  signal.throwIfAborted()
  if (!response.ok)
    throw new Error(
      ErrorSchema.safeParse(body).data?.error.message ?? `无法取得建议（${response.status}）`,
    )
  const interaction = validateInteraction(ResponseSchema.parse(body).interaction)
  if (
    interaction.sceneId !== context.sceneId ||
    JSON.stringify(interaction.inputContext) !== JSON.stringify(context)
  )
    throw new Error('排演返回资料不匹配，请重新生成')
  return interaction
}
