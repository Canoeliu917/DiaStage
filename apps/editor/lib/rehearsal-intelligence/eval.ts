import { z } from 'zod'
import { ACTIVE_DIMENSIONS, ONTOLOGY_VERSION, PROMPT_VERSION } from './dimensions'
import { EVAL_CASES } from './eval-cases'
import { createInteraction } from './proposal-generator'
import { type RehearsalContext, RehearsalContextSchema } from './schema'

export function evalContext(caseId: string): RehearsalContext {
  const item = EVAL_CASES.find((c) => c.caseId === caseId)
  if (!item) throw new Error(`未知测例 ${caseId}`)
  return RehearsalContextSchema.parse({
    sceneId: 'eval-private-synthetic',
    productionId: 'eval-only',
    script: '',
    intention: item.intention,
    directorIntention: '',
    selectedPerformerId: 'a',
    activeDimensions: [...ACTIVE_DIMENSIONS],
    venue: {
      id: 'stage',
      name: '合成测试舞台',
      type: 'black-box',
      origin: [0, 0, 0],
      width: 8,
      depth: 6,
      height: 4,
    },
    performers: [
      { id: 'a', name: '甲', position: [-2, 0, 0], facing: 0, color: '#888888', visible: true },
      { id: 'b', name: '乙', position: [2, 0, 0], facing: 0, color: '#aaaaaa', visible: true },
    ],
    paths: [],
    durationSeconds: 20,
    obstacles: [],
  })
}

const ReviewItemSchema = z.strictObject({
  rating: z.enum(['pass', 'partial', 'fail']),
  reviewerNote: z.string().max(2000),
})
export const HUMAN_REVIEW_CRITERIA = [
  'grounding',
  'actionability',
  'plurality',
  'humanAuthority',
  'spatialFeasibility',
  'dramaticRelevance',
  'evidenceQuality',
  'hallucination',
] as const
export const HumanReviewSchema = z.strictObject({
  reviewer: z.string().trim().min(1).max(160),
  reviewVersion: z.number().int().positive(),
  reviewedAt: z.iso.datetime(),
  grounding: ReviewItemSchema,
  actionability: ReviewItemSchema,
  plurality: ReviewItemSchema,
  humanAuthority: ReviewItemSchema,
  spatialFeasibility: ReviewItemSchema,
  dramaticRelevance: ReviewItemSchema,
  evidenceQuality: ReviewItemSchema,
  hallucination: ReviewItemSchema,
})
const ValidationResultSchema = z.strictObject({
  structuralPass: z.boolean(),
  error: z.string().nullable(),
})
export const EvalResultSchema = z
  .strictObject({
    provenance: z.enum(['real-model', 'synthetic']),
    caseId: z.string().min(1),
    modelVersion: z.string().trim().min(1).max(160),
    promptVersion: z.literal(PROMPT_VERSION),
    ontologyVersion: z.literal(ONTOLOGY_VERSION),
    input: RehearsalContextSchema,
    rawStructuredOutput: z.unknown().refine((value) => value !== undefined, '必须记录原始输出'),
    latency: z.number().finite().nonnegative(),
    inputTokens: z.number().int().nonnegative().nullable(),
    outputTokens: z.number().int().nonnegative().nullable(),
    estimatedCostCNY: z.number().finite().nonnegative().nullable(),
    validationResult: ValidationResultSchema,
    humanReview: HumanReviewSchema.nullable(),
  })
  .superRefine((result, ctx) => {
    if (!EVAL_CASES.some((item) => item.caseId === result.caseId))
      ctx.addIssue({ code: 'custom', path: ['caseId'], message: '未知测例' })
    else if (JSON.stringify(result.input) !== JSON.stringify(evalContext(result.caseId)))
      ctx.addIssue({ code: 'custom', path: ['input'], message: '输入与版本化测例不匹配' })
  })
export type EvalResult = z.infer<typeof EvalResultSchema>

export function validateEvalOutput(
  input: unknown,
  rawStructuredOutput: unknown,
  modelVersion: string,
): z.infer<typeof ValidationResultSchema> {
  try {
    createInteraction(input, rawStructuredOutput, modelVersion)
    return { structuralPass: true, error: null }
  } catch (error) {
    return {
      structuralPass: false,
      error: error instanceof Error ? error.message : '无效输出',
    }
  }
}

/** Validate structure; summarize only the ratings supplied by human reviewers. */
export function evaluateResults(raw: unknown) {
  const results = z.array(EvalResultSchema).max(100).parse(raw)
  if (new Set(results.map((r) => r.caseId)).size !== results.length) throw new Error('测例编号重复')
  if (new Set(results.map((r) => r.provenance)).size > 1)
    throw new Error('真实模型结果与合成结果必须分开汇总')
  const cases = results.map((result) => {
    const validation = validateEvalOutput(
      result.input,
      result.rawStructuredOutput,
      result.modelVersion,
    )
    if (
      validation.structuralPass !== result.validationResult.structuralPass ||
      validation.error !== result.validationResult.error
    )
      throw new Error(`测例 ${result.caseId} 的已存校验结果与本次校验不一致`)
    const ratings = result.humanReview
      ? HUMAN_REVIEW_CRITERIA.map((criterion) => result.humanReview![criterion].rating)
      : []
    return {
      caseId: result.caseId,
      ...validation,
      humanReviewed: result.humanReview !== null,
      humanReviewStatus: !ratings.length
        ? null
        : ratings.includes('fail')
          ? 'fail'
          : ratings.includes('partial')
            ? 'partial'
            : 'pass',
      humanReview: result.humanReview,
    }
  })
  return {
    provenance: results[0]?.provenance ?? null,
    totalCandidates: EVAL_CASES.length,
    evaluated: cases.length,
    missing: EVAL_CASES.filter((c) => !results.some((r) => r.caseId === c.caseId)).map(
      (c) => c.caseId,
    ),
    structuralPassed: cases.filter((c) => c.structuralPass).length,
    humanReviewed: cases.filter((c) => c.humanReviewed).length,
    humanReviewPassed: cases.filter((c) => c.humanReviewStatus === 'pass').length,
    humanReviewPartial: cases.filter((c) => c.humanReviewStatus === 'partial').length,
    humanReviewFailed: cases.filter((c) => c.humanReviewStatus === 'fail').length,
    cases,
  }
}

if (import.meta.main) {
  const file = process.argv[2]
  if (!file || file === '--manifest')
    console.log(
      JSON.stringify(
        EVAL_CASES.map((c) => ({ ...c, input: evalContext(c.caseId) })),
        null,
        2,
      ),
    )
  else {
    const { readFile } = await import('node:fs/promises')
    const report = evaluateResults(JSON.parse(await readFile(file, 'utf8')))
    console.log(JSON.stringify(report, null, 2))
    if (!report.evaluated || report.structuralPassed !== report.evaluated) process.exitCode = 1
  }
}
