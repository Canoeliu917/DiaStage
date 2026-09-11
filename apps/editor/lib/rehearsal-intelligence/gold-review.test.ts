import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { ONTOLOGY_VERSION } from './dimensions'
import { EVAL_CASES } from './eval-cases'
import {
  appendGoldReview,
  type GoldReview,
  GoldReviewLogSchema,
  readGoldReviewLog,
  summarizeGoldReviews,
  writeGoldReviewLog,
} from './gold-review'

const empty = { schemaVersion: 1, reviews: [] }
// Synthetic storage fixture only; this is not an expert review or a Gold label.
const review: GoldReview = {
  caseId: 'objective-tactic-01',
  reviewer: 'synthetic-storage-test',
  reviewVersion: 1,
  ontologyVersion: ONTOLOGY_VERSION,
  status: 'accepted',
  acceptableInterpretations: ['合成解释范围一', '合成解释范围二'],
  acceptableActions: ['合成行动范围一', '合成行动范围二'],
  forbiddenClaims: ['合成禁止断言'],
  requiredEvidence: ['合成证据要求'],
  uncertaintyExpectation: '合成不确定性要求',
  humanAuthorityExpectation: '合成人工权限要求',
  notes: '只验证存储和汇总，不验证戏剧质量。',
  reviewedAt: '2026-09-11T00:00:00.000Z',
}

test('Gold starts at zero and latest human revision supersedes acceptance without losing history', () => {
  expect(summarizeGoldReviews(empty)).toMatchObject({
    candidateCases: 100,
    humanReviewed: 0,
    goldAlpha: 0,
    alphaTarget: 20,
  })
  const accepted = appendGoldReview(empty, review)
  expect(summarizeGoldReviews(accepted)).toMatchObject({ humanReviewed: 1, goldAlpha: 1 })
  const revised = appendGoldReview(accepted, {
    ...review,
    reviewVersion: 2,
    status: 'needs-revision',
    notes: '合成撤回测试',
  })
  expect(revised.reviews[0]).toEqual(review)
  expect(summarizeGoldReviews(revised)).toMatchObject({
    reviewRecords: 2,
    humanReviewed: 1,
    goldAlpha: 0,
    needsRevision: 1,
  })
  const rejected = appendGoldReview(revised, { ...review, reviewVersion: 3, status: 'rejected' })
  expect(summarizeGoldReviews(rejected)).toMatchObject({ goldAlpha: 0, rejected: 1 })
  expect(EVAL_CASES.every((item) => item.humanReviewed === false)).toBe(true)
  expect(empty.reviews).toHaveLength(0)
})

test('Gold requires known cases, complete range, identity, chronology and all prior versions', () => {
  for (const change of [
    { caseId: 'unknown' },
    { reviewer: ' ' },
    { reviewVersion: 2 },
    { status: 'pending' },
    { acceptableInterpretations: [] },
    { acceptableActions: [] },
    { requiredEvidence: [] },
    { uncertaintyExpectation: '' },
    { humanAuthorityExpectation: '' },
    { reviewedAt: 'invalid' },
  ])
    expect(() => appendGoldReview(empty, { ...review, ...change })).toThrow()
  const accepted = appendGoldReview(empty, review)
  expect(() => appendGoldReview(accepted, review)).toThrow('逐次递增')
  expect(() =>
    appendGoldReview(accepted, {
      ...review,
      reviewVersion: 2,
      reviewedAt: '2026-09-10T00:00:00.000Z',
    }),
  ).toThrow('早于')
  expect(GoldReviewLogSchema.safeParse({ ...empty, schemaVersion: 2 }).success).toBe(false)
  const historical = appendGoldReview(empty, { ...review, ontologyVersion: 'historical-version' })
  expect(summarizeGoldReviews(historical)).toMatchObject({ goldAlpha: 0, otherOntology: 1 })
})

test('validated review snapshots round-trip and cannot overwrite an existing history', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'diastage-gold-test-'))
  if (dirname(resolve(directory)) !== resolve(tmpdir())) throw new Error('无效测试目录')
  try {
    const first = join(directory, '1.json')
    const second = join(directory, '2.json')
    await writeGoldReviewLog(first, empty)
    const before = await readFile(first, 'utf8')
    const next = appendGoldReview(await readGoldReviewLog(first), review)
    await writeGoldReviewLog(second, next)
    expect(await readGoldReviewLog(second)).toEqual(next)
    await expect(writeGoldReviewLog(first, next)).rejects.toThrow('EEXIST')
    expect(await readFile(first, 'utf8')).toBe(before)
    await writeFile(join(directory, 'invalid.json'), '{broken')
    await expect(readGoldReviewLog(join(directory, 'invalid.json'))).rejects.toThrow()
  } finally {
    await rm(directory, { recursive: true })
  }
})
