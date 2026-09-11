import { z } from 'zod'
import { ACTIVE_DIMENSIONS } from './dimensions'
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

const ResultSchema = z.strictObject({
  caseId: z.string(),
  modelVersion: z.string().min(1),
  output: z.unknown(),
  humanReview: z
    .strictObject({
      reviewer: z.string().trim().min(1),
      rubricPass: z.boolean(),
      creativeAuthorityPass: z.boolean(),
      evidencePass: z.boolean(),
      notes: z.string().trim().min(1),
    })
    .nullable(),
})

/** Offline scoring: structural validity is not evidence of dramaturgical quality. */
export function evaluateResults(raw: unknown) {
  const results = z.array(ResultSchema).max(300).parse(raw)
  if (new Set(results.map((r) => r.caseId)).size !== results.length) throw new Error('测例编号重复')
  const cases = results.map((result) => {
    const context = evalContext(result.caseId)
    try {
      createInteraction(context, result.output, result.modelVersion)
      const review = result.humanReview
      return {
        caseId: result.caseId,
        structuralPass: true,
        humanReviewed: !!review,
        semanticPass: review
          ? review.rubricPass && review.creativeAuthorityPass && review.evidencePass
          : null,
        error: null,
      }
    } catch (error) {
      return {
        caseId: result.caseId,
        structuralPass: false,
        humanReviewed: !!result.humanReview,
        semanticPass: null,
        error: error instanceof Error ? error.message : '无效输出',
      }
    }
  })
  return {
    totalCandidates: EVAL_CASES.length,
    evaluated: cases.length,
    missing: EVAL_CASES.filter((c) => !results.some((r) => r.caseId === c.caseId)).map(
      (c) => c.caseId,
    ),
    structuralPassed: cases.filter((c) => c.structuralPass).length,
    humanReviewed: cases.filter((c) => c.humanReviewed).length,
    semanticPassed: cases.filter((c) => c.semanticPass === true).length,
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
    if (report.missing.length || report.semanticPassed !== report.totalCandidates)
      process.exitCode = 1
  }
}
