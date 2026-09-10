import { z } from 'zod'

const BudgetResponse = z.object({
  error: z.object({
    code: z.literal('BUDGET_CONFIRMATION_REQUIRED'),
    message: z.string(),
    estimateCny: z.number().finite().positive().max(100),
  }),
})
export async function fetchAiWithBudgetConsent(url: string, init: RequestInit) {
  const response = await fetch(url, init)
  const headers = new Headers(init.headers)
  if (response.status !== 402 || headers.has('x-diastage-remote-token'))
    return { response, budgetApproved: false }
  const parsed = BudgetResponse.safeParse(await response.clone().json())
  if (
    !parsed.success ||
    init.signal?.aborted ||
    !window.confirm(`${parsed.data.error.message}\n仅同意本次调用费用，不授予额外场景编辑权限。`)
  )
    return { response, budgetApproved: false }
  headers.set('x-diastage-budget-consent', String(parsed.data.error.estimateCny))
  return { response: await fetch(url, { ...init, headers }), budgetApproved: true }
}
