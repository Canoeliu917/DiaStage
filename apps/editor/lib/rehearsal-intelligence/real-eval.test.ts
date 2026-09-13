import { expect, test } from 'bun:test'
import { realEvalCases, runRealEval } from './real-eval'

test('real evaluation samples 10 categories, caps at 20 and never fakes a missing-key run', async () => {
  expect(new Set(realEvalCases(10).map((item) => item.category)).size).toBe(10)
  expect(new Set(realEvalCases(20).map((item) => item.caseId)).size).toBe(20)
  for (const count of [0, 9, 21, 10.5, NaN]) expect(() => realEvalCases(count)).toThrow()
  const key = process.env.OPENAI_API_KEY
  try {
    delete process.env.OPENAI_API_KEY
    expect(await runRealEval()).toEqual({
      REAL_MODEL_EVAL: 'NOT_RUN',
      reason: 'OPENAI_API_KEY_NOT_CONFIGURED',
      attempted: 0,
    })
  } finally {
    if (key === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = key
  }
})
