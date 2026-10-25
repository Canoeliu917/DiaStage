import { handleAiRequest } from '@/lib/ai/api'
import { betaBudgetPolicy } from '@/lib/ai/model-budget'
import { MODEL_PRICING } from '@/lib/ai/model-pricing'
import { usageLedger } from '@/lib/ai/usage-ledger'
import { getBootstrapOwnerId } from '@/lib/auth/server'
import { requireSceneSession } from '@/lib/scene-api-security'
export const runtime = 'nodejs'
export async function GET(request: Request) {
  const session = await requireSceneSession(request, { skipRateLimit: true })
  if (session instanceof Response) return session
  return handleAiRequest(request, async () => {
    const { userIds, limits } = betaBudgetPolicy()
    const ledger = usageLedger()
    const owner = session.user.id === (await getBootstrapOwnerId())
    return {
      summary: await ledger.userSummary(session.user.id),
      limits: { dailyCny: limits.userDailyCny, monthlyCny: limits.userMonthlyCny },
      invited: userIds.includes(session.user.id),
      timeZone: 'Asia/Shanghai',
      ...(owner ? { site: { ...(await ledger.summary()), limitCny: limits.siteMonthlyCny } } : {}),
      effectiveDate: MODEL_PRICING.effectiveDate,
      note: '内测 AI 费用由网站承担。用量含进行中的预留费用，按内部参考价估算，不是供应商账单。',
    }
  })
}
