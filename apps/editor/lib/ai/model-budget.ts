import { AI_TOKEN_LIMITS } from './config'
import { estimateAudioCostCny, estimateTextCostCny, usdCnyReference } from './model-pricing'
import { usageLedger } from './usage-ledger'

export class ModelBudgetError extends Error {
  constructor(
    readonly code: 'BUDGET_CONFIRMATION_REQUIRED' | 'BUDGET_EXCEEDED',
    message: string,
    readonly estimateCny: number,
  ) {
    super(message)
    this.name = 'ModelBudgetError'
  }
}
export function budgetLimit(name: string, fallback: number) {
  const number = Number(process.env[name] ?? fallback)
  if (!Number.isFinite(number) || number <= 0) throw new Error(`预算配置无效：${name}`)
  return number
}
export function estimateCall(
  feature: string,
  model: string,
  payload: string,
  audioSeconds: number | null,
) {
  if (audioSeconds !== null) {
    if (model !== 'gpt-transcribe') throw new Error('转写模型缺少价格配置')
    return estimateAudioCostCny(audioSeconds, usdCnyReference())
  }
  // Byte-based conservative preflight only; never reported as actual provider tokens.
  const estimatedInput = new TextEncoder().encode(payload).byteLength
  return estimateTextCostCny(
    model,
    estimatedInput,
    0,
    feature === 'script-stage-plan'
      ? AI_TOKEN_LIMITS.scriptChunkOutput
      : AI_TOKEN_LIMITS.commandOutput,
    usdCnyReference(),
  )
}
export async function reserveModelCall(
  id: string,
  requestId: string,
  feature: string,
  estimate: number,
  approvedCny: number,
) {
  const script = feature === 'script-stage-plan'
  const soft = script
    ? budgetLimit('DIASTAGE_AI_SCRIPT_SOFT_LIMIT_CNY', 0.5)
    : feature === 'voice-transcription'
      ? budgetLimit('DIASTAGE_AI_VOICE_SOFT_LIMIT_CNY', 0.1)
      : budgetLimit('DIASTAGE_AI_COMMAND_SOFT_LIMIT_CNY', 0.05)
  if (estimate > soft && estimate > approvedCny)
    throw new ModelBudgetError(
      'BUDGET_CONFIRMATION_REQUIRED',
      `预计最多约 ¥${estimate.toFixed(4)}，超过本次软限额 ¥${soft.toFixed(4)}。请确认费用后重试；也可继续本地口令和手动置景。`,
      estimate,
    )
  try {
    await usageLedger().reserve(
      id,
      requestId,
      estimate,
      budgetLimit('DIASTAGE_AI_MONTHLY_USER_LIMIT_CNY', 10),
      script ? budgetLimit('DIASTAGE_AI_SCRIPT_HARD_LIMIT_CNY', 1) : Infinity,
    )
  } catch (error) {
    if (error instanceof Error && /BUDGET_EXCEEDED/.test(error.message))
      throw new ModelBudgetError(
        'BUDGET_EXCEEDED',
        '已达到本机工作区或本次剧本预算，停止付费调用；仍可使用本地口令、手动置景和复台。',
        estimate,
      )
    throw error
  }
}
