import { AI_TOKEN_LIMITS } from './config'
import {
  estimateAudioCostCny,
  estimateTextCostCny,
  QWEN_IMAGE_INPUT_TOKENS,
  QWEN_TRIAL_MODEL,
  usdCnyReference,
} from './model-pricing'
import { usageLedger } from './usage-ledger'

export class ModelBudgetError extends Error {
  constructor(
    readonly code: 'BUDGET_CONFIRMATION_REQUIRED' | 'BUDGET_EXCEEDED' | 'AI_INVITE_REQUIRED',
    message: string,
    readonly estimateCny: number,
  ) {
    super(message)
    this.name = 'ModelBudgetError'
  }
}
export function betaBudgetPolicy() {
  const userIds = [
    ...new Set(
      (process.env.DIASTAGE_AI_BETA_USER_IDS ?? '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ]
  if (userIds.length > 20) throw new Error('AI 内测最多允许 20 个受邀账号')
  return {
    userIds,
    limits: { siteMonthlyCny: 100, userMonthlyCny: 5, userDailyCny: 1, taskCny: 1 },
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
  if (model === QWEN_TRIAL_MODEL) {
    // Text-only payload plus protocol allowance is an estimate, not a tokenizer guarantee.
    // The single-image allowance requires vl_high_resolution_images:true; exclude image base64.
    return estimateTextCostCny(
      model,
      estimatedInput + 1024 + (feature === 'photo-stage-plan' ? QWEN_IMAGE_INPUT_TOKENS : 0),
      0,
      (feature === 'script-stage-plan'
        ? AI_TOKEN_LIMITS.scriptChunkOutput
        : AI_TOKEN_LIMITS.commandOutput) + 10,
    )
  }
  return estimateTextCostCny(
    model,
    estimatedInput,
    0,
    feature === 'script-stage-plan'
      ? AI_TOKEN_LIMITS.scriptChunkOutput
      : AI_TOKEN_LIMITS.commandOutput,
    usdCnyReference(),
    estimatedInput > 272_000,
    estimatedInput,
  )
}
export async function reserveModelCall(
  id: string,
  requestId: string,
  feature: string,
  estimate: number,
  approvedCny: number,
  userId?: string,
) {
  const policy = betaBudgetPolicy()
  if (!userId || !policy.userIds.includes(userId))
    throw new ModelBudgetError(
      'AI_INVITE_REQUIRED',
      '付费 AI 暂仅向受邀内测账号开放，由网站承担费用；仍可使用本地口令和手动置景。',
      estimate,
    )
  const script = feature === 'script-stage-plan'
  const soft = script
    ? budgetLimit('DIASTAGE_AI_SCRIPT_SOFT_LIMIT_CNY', 0.5)
    : feature === 'voice-transcription'
      ? budgetLimit('DIASTAGE_AI_VOICE_SOFT_LIMIT_CNY', 0.1)
      : budgetLimit('DIASTAGE_AI_COMMAND_SOFT_LIMIT_CNY', 0.05)
  if (estimate > soft && estimate > approvedCny)
    throw new ModelBudgetError(
      'BUDGET_CONFIRMATION_REQUIRED',
      `本次预留估算约 ¥${estimate.toFixed(4)}，超过单次提醒额度 ¥${soft.toFixed(4)}。内测费用由网站承担，继续会占用你的 AI 额度；也可继续本地口令和手动置景。`,
      estimate,
    )
  try {
    await usageLedger().reserve(id, requestId, userId, estimate, {
      ...policy.limits,
      taskCny: script
        ? Math.min(policy.limits.taskCny, budgetLimit('DIASTAGE_AI_SCRIPT_HARD_LIMIT_CNY', 1))
        : policy.limits.taskCny,
    })
  } catch (error) {
    if (error instanceof Error && /BUDGET_EXCEEDED/.test(error.message))
      throw new ModelBudgetError(
        'BUDGET_EXCEEDED',
        '本账号今日、当月、单次任务或网站当月 AI 额度不足，已停止新的付费调用；仍可使用本地口令、手动置景和复台。',
        estimate,
      )
    throw error
  }
}
