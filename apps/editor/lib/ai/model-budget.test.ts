import { expect, test } from 'bun:test'
import { compileStagePlan, parseStageText } from '@pascal-app/core/stage'
import { planFromPassages } from '../scripts/script-planner'
import { ModelBudgetError, reserveModelCall } from './model-budget'
import { estimateAudioCostCny, estimateTextCostCny, formatCostCny } from './model-pricing'
import { UsageLedger } from './usage-ledger'

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
  await expect(
    reserveModelCall('never-reserved', 'request', 'stage-command', 0.06, 0),
  ).rejects.toBeInstanceOf(ModelBudgetError)
})
test('SQLite atomic reservations enforce task/month caps and reconcile real usage without rounding cents', async () => {
  const ledger = new UsageLedger(':memory:')
  try {
    await ledger.reserve('a', 'task', 0.6, 10, 1)
    await expect(ledger.reserve('b', 'task', 0.5, 10, 1)).rejects.toThrow('TASK_BUDGET_EXCEEDED')
    expect((await ledger.summary()).costCny).toBe(0.6)
    await ledger.reconcile('a', 0.01092, '{}')
    expect((await ledger.summary()).costCny).toBeCloseTo(0.01092, 8)
    await ledger.reserve('b', 'task', 0.5, 10, 1)
    await expect(ledger.reserve('c', 'other', 9.5, 10, 10)).rejects.toThrow(
      'MONTHLY_BUDGET_EXCEEDED',
    )
    const attempts = await Promise.allSettled([
      ledger.reserve('d', 'parallel', 0.6, 10, 1),
      ledger.reserve('e', 'parallel', 0.6, 10, 1),
    ])
    expect(attempts.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    await expect(ledger.reserve('f', 'invalid', Number.NaN, 10, 1)).rejects.toThrow()
  } finally {
    await ledger.close()
  }
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
