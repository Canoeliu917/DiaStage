import { expect, test } from 'bun:test'
import { compileStagePlan, parseStageText } from '@pascal-app/core/stage'
import { planFromPassages } from '../scripts/script-planner'
import { ModelBudgetError, reserveModelCall } from './model-budget'
import { estimateAudioCostCny, estimateTextCostCny, formatCostCny } from './model-pricing'

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
