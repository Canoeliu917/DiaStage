import { AsyncLocalStorage } from 'node:async_hooks'
import { estimateCall, reserveModelCall } from './model-budget'
import { estimateTextCostCny, QWEN_TRIAL_MODEL, usdCnyReference } from './model-pricing'
import { usageLedger } from './usage-ledger'

export interface AiUsageRecord {
  requestId: string
  feature:
    | 'voice-transcription'
    | 'stage-command'
    | 'script-stage-plan'
    | 'rehearsal-proposal'
    | 'photo-stage-plan'
  model: string
  inputTokens: number | null
  cachedInputTokens: number | null
  cacheWriteTokens: number | null
  cacheWrite12hTokens: number | null
  outputTokens: number | null
  audioSeconds: number | null
  estimatedCostCny: number | null
  actualCostCny: number | null
  latencyMs: number
  path: 'local-parser' | 'model'
  status: 'succeeded' | 'failed' | 'cancelled'
  createdAt: string
  errorClass: string | null
}

export const aiRequestContext = new AsyncLocalStorage<{
  requestId: string
  userId?: string
  approvedCny?: number
}>()
const records: AiUsageRecord[] = []

export function recordAiUsage(record: AiUsageRecord) {
  // Explicit projection prevents future callers from accidentally logging source text.
  records.push({
    requestId: record.requestId,
    feature: record.feature,
    model: record.model,
    inputTokens: record.inputTokens,
    cachedInputTokens: record.cachedInputTokens,
    cacheWriteTokens: record.cacheWriteTokens,
    cacheWrite12hTokens: record.cacheWrite12hTokens,
    outputTokens: record.outputTokens,
    audioSeconds: record.audioSeconds,
    estimatedCostCny: record.estimatedCostCny,
    actualCostCny: record.actualCostCny,
    latencyMs: record.latencyMs,
    path: record.path,
    status: record.status,
    createdAt: record.createdAt,
    errorClass: record.errorClass,
  })
  // ponytail: bounded process diagnostics; durable budget accounting belongs in the server ledger.
  if (records.length > 1000) records.shift()
}

export function readAiUsage() {
  return records.map((record) => ({ ...record }))
}

type ProviderUsage = {
  input_tokens: number
  output_tokens: number
  input_tokens_details?: {
    cached_tokens?: number
    cache_write_tokens?: number
    cache_write_tokens_details?: { ttl_12h_tokens?: number }
  }
}

export async function trackAiCall<T>(
  feature: AiUsageRecord['feature'],
  model: string,
  signal: AbortSignal,
  operation: () => Promise<T>,
  usage: (result: T) => ProviderUsage | null | undefined,
  audioSeconds: number | null = null,
  payload?: string,
): Promise<T> {
  const start = performance.now()
  const record: AiUsageRecord = {
    requestId: aiRequestContext.getStore()?.requestId ?? crypto.randomUUID(),
    feature,
    model,
    inputTokens: null,
    cachedInputTokens: null,
    cacheWriteTokens: null,
    cacheWrite12hTokens: null,
    outputTokens: null,
    audioSeconds,
    estimatedCostCny: null,
    actualCostCny: null,
    latencyMs: 0,
    path: model === 'local-parser' ? 'local-parser' : 'model',
    status: 'succeeded',
    createdAt: new Date().toISOString(),
    errorClass: null,
  }
  const reservationId = crypto.randomUUID()
  const budgeted = model !== 'local-parser'
  let reserved = false
  try {
    signal.throwIfAborted()
    if (budgeted) {
      if (payload === undefined) throw new Error('付费调用缺少预算输入，已停止调用')
      record.estimatedCostCny = estimateCall(feature, model, payload, audioSeconds)
      await reserveModelCall(
        reservationId,
        record.requestId,
        feature,
        record.estimatedCostCny,
        aiRequestContext.getStore()?.approvedCny ?? 0,
        aiRequestContext.getStore()?.userId,
      )
      reserved = true
    }
    signal.throwIfAborted()
    const result = await operation()
    const actual = usage(result)
    if (actual) {
      record.inputTokens = actual.input_tokens
      record.cachedInputTokens = actual.input_tokens_details?.cached_tokens ?? 0
      record.cacheWriteTokens = actual.input_tokens_details?.cache_write_tokens ?? null
      record.cacheWrite12hTokens =
        actual.input_tokens_details?.cache_write_tokens_details?.ttl_12h_tokens ?? null
      record.outputTokens = actual.output_tokens
      record.estimatedCostCny = estimateTextCostCny(
        model,
        actual.input_tokens,
        actual.input_tokens_details?.cached_tokens ?? 0,
        actual.output_tokens,
        model === QWEN_TRIAL_MODEL ? 1 : usdCnyReference(),
        actual.input_tokens > 272_000,
        record.cacheWriteTokens ?? actual.input_tokens - record.cachedInputTokens,
        record.cacheWrite12hTokens ?? 0,
      )
    }
    signal.throwIfAborted()
    return result
  } catch (error) {
    record.status = signal.aborted ? 'cancelled' : 'failed'
    record.errorClass = error instanceof Error ? error.name : 'UnknownError'
    throw error
  } finally {
    record.latencyMs = Math.round(performance.now() - start)
    if (record.path === 'local-parser') record.estimatedCostCny = 0
    recordAiUsage(record)
    if (reserved)
      await usageLedger().reconcile(reservationId, record.estimatedCostCny, JSON.stringify(record))
  }
}
