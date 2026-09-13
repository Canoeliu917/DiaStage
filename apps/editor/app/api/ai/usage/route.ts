import { handleAiRequest } from '@/lib/ai/api'
import { MODEL_PRICING } from '@/lib/ai/model-pricing'
import { usageLedger } from '@/lib/ai/usage-ledger'
export const runtime = 'nodejs'
export function GET(request: Request) {
  return handleAiRequest(request, async () => ({
    summary: await usageLedger().summary(),
    effectiveDate: MODEL_PRICING.effectiveDate,
    note: '本机工作区估算；API未提供货币账单。不是公网个人配额。',
  }))
}
