import { readFile, writeFile } from 'node:fs/promises'
import { z } from 'zod'
import { ONTOLOGY_VERSION } from './dimensions'
import { EVAL_CASES } from './eval-cases'

const text = z.string().trim().min(1).max(2000)
const statements = z.array(text).max(32)
export const GOLD_ALPHA_TARGET = 20
export const GoldReviewSchema = z.strictObject({
  caseId: z.string().min(1).max(160),
  reviewer: z.string().trim().min(1).max(160),
  reviewVersion: z.number().int().positive(),
  ontologyVersion: z.string().trim().min(1).max(160),
  status: z.enum(['accepted', 'needs-revision', 'rejected']),
  acceptableInterpretations: statements,
  acceptableActions: statements,
  forbiddenClaims: statements,
  requiredEvidence: statements,
  uncertaintyExpectation: text,
  humanAuthorityExpectation: text,
  notes: z.string().max(4000),
  reviewedAt: z.iso.datetime(),
})
export type GoldReview = z.infer<typeof GoldReviewSchema>
export const GoldReviewLogSchema = z
  .strictObject({ schemaVersion: z.literal(1), reviews: z.array(GoldReviewSchema).max(10000) })
  .superRefine((log, ctx) => {
    const latest = new Map<string, GoldReview>()
    for (const [index, review] of log.reviews.entries()) {
      const previous = latest.get(review.caseId)
      if (!EVAL_CASES.some((item) => item.caseId === review.caseId))
        ctx.addIssue({ code: 'custom', path: ['reviews', index, 'caseId'], message: '未知测例' })
      if (review.reviewVersion !== (previous?.reviewVersion ?? 0) + 1)
        ctx.addIssue({
          code: 'custom',
          path: ['reviews', index, 'reviewVersion'],
          message: '人工审核版本必须从 1 开始逐次递增，保留全部旧版本',
        })
      if (previous && Date.parse(review.reviewedAt) < Date.parse(previous.reviewedAt))
        ctx.addIssue({
          code: 'custom',
          path: ['reviews', index, 'reviewedAt'],
          message: '新审核不能早于上一版本',
        })
      if (review.status === 'accepted')
        for (const field of [
          'acceptableInterpretations',
          'acceptableActions',
          'requiredEvidence',
        ] as const)
          if (!review[field].length)
            ctx.addIssue({
              code: 'custom',
              path: ['reviews', index, field],
              message: '接受案例须填写合理范围与证据要求；结构完整不代表戏剧判断正确',
            })
      latest.set(review.caseId, review)
    }
  })

export function appendGoldReview(rawLog: unknown, rawReview: unknown) {
  const log = GoldReviewLogSchema.parse(rawLog)
  return GoldReviewLogSchema.parse({ ...log, reviews: [...log.reviews, rawReview] })
}

export function summarizeGoldReviews(raw: unknown) {
  const log = GoldReviewLogSchema.parse(raw)
  const latest = [...new Map(log.reviews.map((review) => [review.caseId, review])).values()]
  return {
    schemaVersion: log.schemaVersion,
    ontologyVersion: ONTOLOGY_VERSION,
    candidateCases: EVAL_CASES.length,
    reviewRecords: log.reviews.length,
    humanReviewed: latest.length,
    goldAlpha: latest.filter(
      (review) => review.status === 'accepted' && review.ontologyVersion === ONTOLOGY_VERSION,
    ).length,
    alphaTarget: GOLD_ALPHA_TARGET,
    needsRevision: latest.filter((review) => review.status === 'needs-revision').length,
    rejected: latest.filter((review) => review.status === 'rejected').length,
    otherOntology: latest.filter((review) => review.ontologyVersion !== ONTOLOGY_VERSION).length,
    unreviewed: EVAL_CASES.filter((item) => !latest.some((r) => r.caseId === item.caseId)).map(
      (item) => item.caseId,
    ),
    latest,
  }
}

export async function readGoldReviewLog(path: string) {
  return GoldReviewLogSchema.parse(JSON.parse(await readFile(path, 'utf8')))
}

export async function writeGoldReviewLog(path: string, raw: unknown) {
  const log = GoldReviewLogSchema.parse(raw)
  // New snapshots preserve the previous file even if a write is interrupted.
  await writeFile(path, `${JSON.stringify(log, null, 2)}\n`, { flag: 'wx' })
  return log
}

if (import.meta.main) {
  const [command, file, reviewFile, outputFile] = process.argv.slice(2)
  let log
  if (command === '--init' && file)
    log = await writeGoldReviewLog(file, { schemaVersion: 1, reviews: [] })
  else if (command === '--append' && file && reviewFile && outputFile)
    log = await writeGoldReviewLog(
      outputFile,
      appendGoldReview(
        await readGoldReviewLog(file),
        JSON.parse(await readFile(reviewFile, 'utf8')),
      ),
    )
  else if (command === '--summary')
    log = file ? await readGoldReviewLog(file) : { schemaVersion: 1, reviews: [] }
  else
    throw new Error('用法：--init 新文件 | --append 旧日志 人工审核文件 新日志 | --summary [日志]')
  console.log(JSON.stringify(summarizeGoldReviews(log), null, 2))
}
