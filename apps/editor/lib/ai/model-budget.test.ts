import { expect, test } from 'bun:test'
import { compileStagePlan, parseStageText } from '@pascal-app/core/stage'
import { planFromPassages } from '../scripts/script-planner'
import { AI_TOKEN_LIMITS } from './config'
import { estimateCall, ModelBudgetError, reserveModelCall } from './model-budget'
import {
  estimateAudioCostCny,
  estimateTextCostCny,
  formatCostCny,
  QWEN_IMAGE_INPUT_TOKENS,
  QWEN_TRIAL_MODEL,
} from './model-pricing'
import { trackAiCall } from './usage'

test('reference RMB examples and cached input are counted once', () => {
  const text = estimateTextCostCny('gpt-5.6-luna', 3000, 0, 800)
  expect(text).toBeCloseTo(0.01092, 8)
  expect(estimateAudioCostCny(30)).toBeCloseTo(0.01575, 8)
  expect(text + estimateAudioCostCny(30)).toBeCloseTo(0.02667, 8)
  expect(text + estimateAudioCostCny(60)).toBeCloseTo(0.04242, 8)
  expect(estimateTextCostCny('gpt-5.6-luna', 8000, 0, 1500) * 10).toBeCloseTo(0.238, 8)
  expect(estimateTextCostCny('gpt-5.6-luna', 3000, 1000, 800)).toBeCloseTo(0.00966, 8)
  expect(formatCostCny(0.001)).toBe('不足1分')
  expect(() => estimateTextCostCny('unpriced-model', 1, 0, 1)).toThrow()
  expect(() => estimateTextCostCny('gpt-5.6-luna', 1, 2, 1)).toThrow()
  expect(() => estimateAudioCostCny(Number.NaN)).toThrow()
})
test('soft budget requires explicit consent before opening a paid reservation', async () => {
  const previous = process.env.DIASTAGE_AI_BETA_USER_IDS
  process.env.DIASTAGE_AI_BETA_USER_IDS = 'budget-test-user'
  try {
    await expect(
      reserveModelCall('never-reserved', 'request', 'stage-command', 0.06, 0, 'budget-test-user'),
    ).rejects.toMatchObject({ code: 'BUDGET_CONFIRMATION_REQUIRED' })
  } finally {
    if (previous === undefined) delete process.env.DIASTAGE_AI_BETA_USER_IDS
    else process.env.DIASTAGE_AI_BETA_USER_IDS = previous
  }
})
test('cache writes replace ordinary input rates and lifetime components are counted once', () => {
  expect(estimateTextCostCny('gpt-5.6-luna', 1000, 0, 0, 7, false, 1000)).toBeCloseTo(0.00175, 8)
  expect(estimateTextCostCny('gpt-5.6-luna', 12000, 4000, 0, 7, false, 7000, 4000)).toBeCloseTo(
    0.02121,
    8,
  )
  expect(estimateTextCostCny('gpt-5.6-luna', 1000, 0, 0, 7, true, 1000)).toBeCloseTo(0.0035, 8)
  expect(estimateTextCostCny('gpt-5.6-terra', 1000, 0, 0, 7, false, 1000)).toBeCloseTo(0.0175, 8)
  expect(estimateTextCostCny('gpt-5.6-terra', 1000, 0, 0, 7, false, 1000, 1000)).toBeCloseTo(
    0.035,
    8,
  )
  expect(estimateTextCostCny('gpt-5.6-luna', 3000, 1000, 800, 7, false, 0, 0)).toBeCloseTo(
    0.00966,
    8,
  )
  for (const [cached, writes, writes12h] of [
    [1, 1000, 0],
    [0, 10, 11],
    [0, -1, 0],
    [0, 1.5, 0],
    [0, Number.NaN, 0],
    [0, 1, Number.POSITIVE_INFINITY],
  ])
    expect(() =>
      estimateTextCostCny('gpt-5.6-luna', 1000, cached!, 0, 7, false, writes!, writes12h!),
    ).toThrow()
})

test('Qwen trial pricing uses conservative internal CNY tiers and never discounts cached input', () => {
  expect(estimateTextCostCny(QWEN_TRIAL_MODEL, 3000, 0, 800)).toBeCloseTo(0.00124, 8)
  for (const [input, output, inputRate, outputRate] of [
    [32_000, 10, 0.2, 0.8],
    [32_001, 10, 0.6, 2.4],
    [256_000, 10, 0.6, 2.4],
    [256_001, 10, 1.2, 4.8],
    [999_990, 10, 1.2, 4.8],
    [1_000_000, 0, 1.2, 4.8],
  ] as const)
    expect(estimateTextCostCny(QWEN_TRIAL_MODEL, input, 0, output)).toBeCloseTo(
      (input * inputRate + output * outputRate) / 1_000_000,
      8,
    )
  const ordinary = estimateTextCostCny(QWEN_TRIAL_MODEL, 3000, 0, 800)
  expect(estimateTextCostCny(QWEN_TRIAL_MODEL, 3000, 1000, 800, 1, true, 2000, 1000)).toBe(ordinary)
  expect(estimateTextCostCny(QWEN_TRIAL_MODEL, 3000, 3000, 800, 999)).toBe(ordinary)
})

test('Qwen pricing rejects unknown snapshots, invalid counts and excess internal context', () => {
  for (const model of ['qwen3.7-flash', 'qwen3.7-flash-2026-07-16'])
    expect(() => estimateTextCostCny(model, 3000, 0, 800)).toThrow('尚未配置')
  for (const value of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(() => estimateTextCostCny(QWEN_TRIAL_MODEL, value, 0, 0)).toThrow()
    expect(() => estimateTextCostCny(QWEN_TRIAL_MODEL, 3000, 0, value)).toThrow()
    expect(() => estimateTextCostCny(QWEN_TRIAL_MODEL, 3000, value, 0)).toThrow()
    expect(() => estimateTextCostCny(QWEN_TRIAL_MODEL, 3000, 0, 0, 7, false, value)).toThrow()
  }
  expect(() => estimateTextCostCny(QWEN_TRIAL_MODEL, 3000, 3001, 0)).toThrow()
  expect(() => estimateTextCostCny(QWEN_TRIAL_MODEL, 1_000_000, 0, 1)).toThrow('上下文')
  expect(() => estimateTextCostCny(QWEN_TRIAL_MODEL, 1_000_001, 0, 0)).toThrow('上下文')
})

test('Qwen reservations include UTF8 text, protocol allowance, output slack and single-image bound', () => {
  const payload = '舞台🎭'
  const textTokens = new TextEncoder().encode(payload).byteLength + 1024
  const output = AI_TOKEN_LIMITS.commandOutput + 10
  expect(estimateCall('stage-command', QWEN_TRIAL_MODEL, payload, null)).toBeCloseTo(
    (textTokens * 0.2 + output * 0.8) / 1_000_000,
    8,
  )
  expect(estimateCall('script-stage-plan', QWEN_TRIAL_MODEL, payload, null)).toBeCloseTo(
    (textTokens * 0.2 + (AI_TOKEN_LIMITS.scriptChunkOutput + 10) * 0.8) / 1_000_000,
    8,
  )
  expect(estimateCall('photo-stage-plan', QWEN_TRIAL_MODEL, payload, null)).toBeCloseTo(
    ((textTokens + QWEN_IMAGE_INPUT_TOKENS) * 0.2 + output * 0.8) / 1_000_000,
    8,
  )
  expect(QWEN_IMAGE_INPUT_TOKENS).toBe(16_384)
  const boundary = 'a'.repeat(32_000 - 1024 - QWEN_IMAGE_INPUT_TOKENS)
  expect(estimateCall('photo-stage-plan', QWEN_TRIAL_MODEL, boundary, null)).toBeCloseTo(
    (32_000 * 0.2 + output * 0.8) / 1_000_000,
    8,
  )
  expect(estimateCall('photo-stage-plan', QWEN_TRIAL_MODEL, `${boundary}a`, null)).toBeCloseTo(
    (32_001 * 0.6 + output * 2.4) / 1_000_000,
    8,
  )
})

test('Qwen photo context overflow stops before invoking any provider', async () => {
  let calls = 0
  const output = AI_TOKEN_LIMITS.commandOutput + 10
  const boundary = 'a'.repeat(1_000_000 - 1024 - QWEN_IMAGE_INPUT_TOKENS - output)
  expect(() => estimateCall('photo-stage-plan', QWEN_TRIAL_MODEL, boundary, null)).not.toThrow()
  await expect(
    trackAiCall(
      'photo-stage-plan',
      QWEN_TRIAL_MODEL,
      new AbortController().signal,
      async () => {
        calls++
        return null
      },
      () => null,
      null,
      `${boundary}a`,
    ),
  ).rejects.toThrow('上下文')
  expect(calls).toBe(0)
  expect(() => estimateCall('voice-transcription', QWEN_TRIAL_MODEL, '', 30)).toThrow('转写模型')
})

test('synthetic chunk provider: budget exhaustion preserves partial evidence but produces no executable batch', async () => {
  const context = { documentVersion: 0, venue: null, objects: [], selectedObjectIds: [] }
  const passages = Array.from({ length: 6 }, (_, n) => ({
    id: `budget-${n}`,
    page: n + 1,
    paragraph: 1,
    text: `舞台中央摆着双人沙发${'中'.repeat(2800)}`,
  }))
  let calls = 0
  const partial = await planFromPassages(
    passages,
    new AbortController().signal,
    {},
    async (request) => {
      if (++calls > 1) throw new ModelBudgetError('BUDGET_EXCEEDED', '合成预算异常', 1)
      const plan = parseStageText('建立宽8米深6米的舞台。添加双人沙发', context)!
      const passage = request.passages[0]!
      plan.source = 'script'
      plan.evidence = [
        {
          id: `${passage.id}:e0`,
          page: passage.page,
          paragraph: passage.paragraph,
          excerpt: '舞台中央摆着双人沙发',
          certainty: 'stated',
        },
      ]
      plan.items[0]!.evidenceIds = [plan.evidence[0]!.id]
      return plan
    },
  )
  expect(calls).toBe(2)
  expect(partial.items).toHaveLength(1)
  expect(partial.questions.some((question) => question.id === 'budget-incomplete')).toBe(true)
  expect(
    compileStagePlan(partial, context, {
      transactionId: 'partial-budget',
      issuedAt: new Date().toISOString(),
    }).commands,
  ).toHaveLength(0)
})
