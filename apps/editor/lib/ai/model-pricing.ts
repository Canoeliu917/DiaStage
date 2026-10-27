export const QWEN_TRIAL_MODEL = 'qwen3.7-flash-2026-07-15'
export const QWEN_IMAGE_INPUT_TOKENS = 16_384

export const MODEL_PRICING = {
  effectiveDate: '2026-09-10',
  source:
    'DiaStage internal budget reference; cache-write rates verified 2026-10-25: https://developers.openai.com/api/docs/guides/prompt-caching',
  usdCnyReference: 7,
  text: {
    'gpt-5.6-luna': { input: 0.2, cached: 0.02, cacheWrite: 0.25, output: 1.2 },
    'gpt-5.6-terra': { input: 2, cached: 0.2, cacheWrite: null, output: 12 },
  },
  lunaLong: { input: 0.4, cached: 0.04, cacheWrite: 0.5, output: 1.8 },
  transcriptionUsdPerMinute: 0.0045,
} as const

export function usdCnyReference() {
  const value = Number(process.env.DIASTAGE_USD_CNY_REFERENCE ?? 7)
  if (!Number.isFinite(value) || value <= 0) throw new Error('人民币参考汇率配置无效')
  return value
}
export function estimateTextCostCny(
  model: string,
  input: number,
  cached: number,
  output: number,
  exchange = 7,
  longContext = false,
  cacheWriteTokens = 0,
  cacheWrite12hTokens = 0,
) {
  for (const count of [input, cached, output, cacheWriteTokens, cacheWrite12hTokens])
    if (!Number.isSafeInteger(count) || count < 0) throw new Error('用量无效')
  if (
    cached + cacheWriteTokens > input ||
    cacheWrite12hTokens > cacheWriteTokens ||
    !Number.isFinite(exchange) ||
    exchange <= 0
  )
    throw new Error('用量或汇率无效')
  if (model === QWEN_TRIAL_MODEL) {
    // Internal conservative limits; the official K/M units are not precisely defined.
    if (input + output > 1_000_000) throw new Error('Qwen 请求超过内部上下文预算限制')
    const price =
      input <= 32_000
        ? { input: 0.2, output: 0.8 }
        : input <= 256_000
          ? { input: 0.6, output: 2.4 }
          : { input: 1.2, output: 4.8 }
    // Trial accounting charges all input at the ordinary CNY rate, including cached input.
    return (input * price.input + output * price.output) / 1_000_000
  }
  const price =
    longContext && model === 'gpt-5.6-luna'
      ? MODEL_PRICING.lunaLong
      : model === 'gpt-5.6-luna'
        ? MODEL_PRICING.text['gpt-5.6-luna']
        : model === 'gpt-5.6-terra'
          ? MODEL_PRICING.text['gpt-5.6-terra']
          : null
  if (!price) throw new Error('此模型尚未配置人民币价格，已停止付费调用')
  // Reads and writes are disjoint subsets of input_tokens, not additional tokens.
  return (
    (((input - cached - cacheWriteTokens) * price.input +
      cached * price.cached +
      (cacheWriteTokens - cacheWrite12hTokens) * (price.cacheWrite ?? price.input * 1.25) +
      cacheWrite12hTokens * price.input * 2.5 +
      output * price.output) *
      exchange) /
    1_000_000
  )
}
export function estimateAudioCostCny(seconds: number, exchange = 7) {
  if (!Number.isFinite(seconds) || seconds < 0 || !Number.isFinite(exchange) || exchange <= 0)
    throw new Error('音频时长或汇率无效')
  return (seconds / 60) * MODEL_PRICING.transcriptionUsdPerMinute * exchange
}
export function formatCostCny(cost: number) {
  return cost > 0 && cost < 0.01 ? '不足1分' : `¥${cost.toFixed(4)}`
}
