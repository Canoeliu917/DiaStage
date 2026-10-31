import { z } from 'zod'

const IntakeItemSchema = z
  .object({
    id: z.string().regex(/^intake-[a-z0-9-]+$/),
    url: z.string().nullable(),
    title: z.string().min(1),
    opened: z.boolean(),
    decision: z.enum(['rejected', 'pending', 'already-in-corpus', 'formal']),
    reason: z.string().min(8),
    fullTextHosted: z.literal(false),
  })
  .strict()

export const DailyIntakeRoundSchema = z
  .object({
    roundId: z.string().min(1),
    ranAt: z.string().min(1),
    scope: z.string().min(1),
    counts: z
      .object({
        discovered: z.number().int().nonnegative(),
        openedAndRead: z.number().int().nonnegative(),
        indexOnly: z.number().int().nonnegative(),
        pending: z.number().int().nonnegative(),
        rejected: z.number().int().nonnegative(),
        alreadyInCorpus: z.number().int().nonnegative(),
        formalAdded: z.number().int().nonnegative(),
        fullTextsHosted: z.literal(0),
      })
      .strict(),
    items: z.array(IntakeItemSchema).min(1).max(60),
  })
  .strict()
  .refine(
    (round) => {
      const counts = {
        discovered: round.items.length,
        openedAndRead: round.items.filter((item) => item.opened).length,
        pending: round.items.filter((item) => item.decision === 'pending').length,
        rejected: round.items.filter((item) => item.decision === 'rejected').length,
        alreadyInCorpus: round.items.filter((item) => item.decision === 'already-in-corpus').length,
        formalAdded: round.items.filter((item) => item.decision === 'formal').length,
      }
      return (
        round.counts.discovered === counts.discovered &&
        round.counts.openedAndRead === counts.openedAndRead &&
        round.counts.pending === counts.pending &&
        round.counts.rejected === counts.rejected &&
        round.counts.alreadyInCorpus === counts.alreadyInCorpus &&
        round.counts.formalAdded === counts.formalAdded &&
        round.counts.discovered <= 60 &&
        round.counts.openedAndRead <= 20
      )
    },
    { message: '日课计数须与条目一致，且不超过每轮来源上限。' },
  )

export type DailyIntakeRound = z.infer<typeof DailyIntakeRoundSchema>

export function publicIntakePlan(round: DailyIntakeRound, writePublic = false) {
  const formal = round.items.filter((item) => item.decision === 'formal')
  return {
    dryRun: true,
    wrotePublicIndex: false,
    formalReady: formal.length,
    message:
      formal.length === 0
        ? '本轮没有可写入公开检索的完整剧本。待审条目保持在日课队列。'
        : writePublic
          ? '即使带上写入标志，本入口也不改正式目录。合格条目仍须手写 publicationReview。'
          : '未写入公开检索。去掉写入标志时只报告。',
  }
}
