import { handleAiRequest } from '@/lib/ai/api'
import { MODEL_PRICING } from '@/lib/ai/model-pricing'
import { usageLedger } from '@/lib/ai/usage-ledger'
import { getBootstrapOwnerId } from '@/lib/auth/server'
import { requireSceneSession, sceneApiJson } from '@/lib/scene-api-security'
export const runtime = 'nodejs'
export async function GET(request: Request) {
  const session = await requireSceneSession(request, { skipRateLimit: true })
  if (session instanceof Response) return session
  if (session.user.id !== (await getBootstrapOwnerId()))
    return sceneApiJson(request, { error: 'forbidden' }, { status: 403 })
  return handleAiRequest(request, async () => ({
    summary: await usageLedger().summary(),
    effectiveDate: MODEL_PRICING.effectiveDate,
    note: '本机工作区估算；API未提供货币账单。不是公网个人配额。',
  }))
}
