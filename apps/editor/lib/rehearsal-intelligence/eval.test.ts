import { expect, test } from 'bun:test'
import { ONTOLOGY_VERSION, PROMPT_VERSION } from './dimensions'
import {
  type EvalResult,
  EvalResultSchema,
  evalContext,
  evaluateResults,
  HUMAN_REVIEW_CRITERIA,
  HumanReviewSchema,
  validateEvalOutput,
} from './eval'

function fixture(caseId = 'objective-tactic-01') {
  const input = evalContext(caseId)
  const rawStructuredOutput = {
    dramaticState: [],
    proposals: [
      {
        title: '合成结构校验方案',
        intention: '合成测试意图',
        rationale: '此固定输出仅用于结构回归测试。',
        suggestions: [
          {
            id: 's1',
            performerId: 'a',
            intention: '合成保持位置',
            movement: 'hold',
            targetPerformerId: null,
            zone: null,
            extent: 'small',
            pace: 'slow',
          },
        ],
        alternatives: [],
        evidence: [{ source: 'intention', quote: input.intention }],
        confidence: 0.99,
      },
    ],
  }
  const modelVersion = 'synthetic-test-fixture'
  return {
    provenance: 'synthetic',
    caseId,
    modelVersion,
    promptVersion: PROMPT_VERSION,
    ontologyVersion: ONTOLOGY_VERSION,
    input,
    rawStructuredOutput,
    latency: 0,
    inputTokens: null,
    outputTokens: null,
    estimatedCostCNY: null,
    validationResult: validateEvalOutput(input, rawStructuredOutput, modelVersion),
    humanReview: null,
  } satisfies EvalResult
}

function humanFixture() {
  return HumanReviewSchema.parse({
    reviewer: 'synthetic-rating-storage-test',
    reviewVersion: 1,
    reviewedAt: '2026-09-11T00:00:00.000Z',
    ...Object.fromEntries(
      HUMAN_REVIEW_CRITERIA.map((criterion) => [
        criterion,
        { rating: 'pass', reviewerNote: '仅测试评分字段，非实际人工审核。' },
      ]),
    ),
  })
}

test('structure and high model confidence never create human ratings or Gold labels', () => {
  const result = fixture()
  expect(evaluateResults([result])).toMatchObject({
    provenance: 'synthetic',
    evaluated: 1,
    structuralPassed: 1,
    humanReviewed: 0,
    humanReviewPassed: 0,
    cases: [{ humanReviewStatus: null, humanReview: null }],
  })
  expect(evaluateResults([result]).missing).toHaveLength(99)
  expect(evaluateResults([])).toMatchObject({ evaluated: 0, humanReviewed: 0 })
  expect(evaluateResults([result])).not.toHaveProperty('semanticPassed')
  expect(evaluateResults([result])).not.toHaveProperty('goldAlpha')
})

test('all eight explicit human ratings and notes survive pass, partial and fail summaries', () => {
  const review = humanFixture()
  expect(evaluateResults([{ ...fixture(), humanReview: review }])).toMatchObject({
    humanReviewed: 1,
    humanReviewPassed: 1,
    cases: [{ humanReview: review }],
  })
  for (const criterion of HUMAN_REVIEW_CRITERIA) {
    for (const rating of ['partial', 'fail'] as const) {
      const result = evaluateResults([
        {
          ...fixture(),
          humanReview: { ...review, [criterion]: { rating, reviewerNote: '合成评分说明' } },
        },
      ])
      expect(result.cases[0]!.humanReviewStatus).toBe(rating)
      expect(result.humanReviewPassed).toBe(0)
    }
    const incomplete = { ...review, [criterion]: undefined }
    expect(HumanReviewSchema.safeParse(incomplete).success).toBe(false)
  }
  expect(HumanReviewSchema.safeParse({ ...review, reviewer: ' ' }).success).toBe(false)
  expect(HumanReviewSchema.safeParse({ ...review, reviewVersion: 0 }).success).toBe(false)
})

test('unknown/mismatched inputs, versions, missing raw output and mixed provenance cannot be scored', () => {
  const result = fixture()
  for (const change of [
    { caseId: 'unknown' },
    { input: { ...result.input, intention: 'different input' } },
    { promptVersion: 'different-prompt' },
    { ontologyVersion: 'invented-38d' },
    { provenance: undefined },
    { rawStructuredOutput: undefined },
    { inputTokens: -1 },
    { estimatedCostCNY: Number.NaN },
  ])
    expect(EvalResultSchema.safeParse({ ...result, ...change }).success).toBe(false)
  expect(() => evaluateResults([result, result])).toThrow('重复')
  expect(() =>
    evaluateResults([result, { ...fixture('relationship-01'), provenance: 'real-model' }]),
  ).toThrow('分开汇总')
  expect(() =>
    evaluateResults([{ ...result, validationResult: { structuralPass: false, error: 'wrong' } }]),
  ).toThrow('不一致')
})

test('raw invalid JSON, invented evidence/actors and illegal coordinates remain failed outputs', () => {
  const result = fixture()
  const proposal = result.rawStructuredOutput.proposals[0]!
  const invalidOutputs: unknown[] = [
    null,
    '{invalid-json',
    { ...result.rawStructuredOutput, proposals: [{ ...proposal, position: [999, 0, 0] }] },
    {
      ...result.rawStructuredOutput,
      proposals: [{ ...proposal, evidence: [{ source: 'script', quote: '不存在的台词' }] }],
    },
    {
      ...result.rawStructuredOutput,
      proposals: [
        {
          ...proposal,
          suggestions: [{ ...proposal.suggestions[0], performerId: 'missing' }],
        },
      ],
    },
  ]
  for (const rawStructuredOutput of invalidOutputs) {
    const validationResult = validateEvalOutput(
      result.input,
      rawStructuredOutput,
      result.modelVersion,
    )
    expect(validationResult.structuralPass).toBe(false)
    expect(evaluateResults([{ ...result, rawStructuredOutput, validationResult }])).toMatchObject({
      structuralPassed: 0,
      humanReviewPassed: 0,
    })
  }
})
