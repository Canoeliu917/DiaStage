import { z } from 'zod'

export const PRIORITY_MAINLAND_PLAYWRIGHTS = [
  '曹禺',
  '老舍',
  '田汉',
  '夏衍',
  '郭沫若',
  '丁西林',
] as const

const bibliographicUrl = z
  .string()
  .trim()
  .max(500)
  .refine((value) => {
    try {
      const url = new URL(value)
      return url.protocol === 'https:' && !url.username && !url.password
    } catch {
      return false
    }
  }, '来源链接须是不带账号的 https 地址。')

const HundredPlayCardSchema = z
  .object({
    id: z.string().regex(/^hundred-[a-z0-9-]+$/),
    playwright: z.string().trim().min(1).max(40),
    title: z.string().trim().min(1).max(80),
    region: z.literal('mainland'),
    workKind: z.literal('spoken-drama'),
    reviewStatus: z.literal('candidate'),
    hosting: z.literal('metadata-only'),
    publicSearch: z.literal(false),
    fullText: z.null(),
    firstPublishedYear: z.number().int().min(1900).max(2026).nullable(),
    copyrightStatus: z.literal('hosting-not-cleared'),
    sourceUrl: bibliographicUrl.nullable(),
    sourceLabel: z.string().trim().min(1).max(80).nullable(),
    note: z.string().trim().min(8).max(200),
  })
  .strict()
  .refine((card) => (card.sourceUrl === null) === (card.sourceLabel === null), {
    path: ['sourceUrl'],
    message: '有来源链接时要写来源名称；没有链接时不要写来源名称。',
  })

export const HundredPlayChecklistSchema = z
  .object({
    schema: z.literal('diamotif.hundred-play-card/1'),
    program: z.literal('话剧百部'),
    purpose: z.string().trim().min(1),
    policy: z.string().trim().min(1),
    cards: z.array(HundredPlayCardSchema).min(1).max(40),
  })
  .strict()
  .refine((doc) => new Set(doc.cards.map((card) => card.id)).size === doc.cards.length, {
    path: ['cards'],
    message: '百部卡片编号不能重复。',
  })

export type HundredPlayChecklist = z.infer<typeof HundredPlayChecklistSchema>

export function summarizeHundredCards(doc: HundredPlayChecklist) {
  return {
    listedCards: doc.cards.length,
    withYear: doc.cards.filter((card) => card.firstPublishedYear !== null).length,
    withSourceUrl: doc.cards.filter((card) => card.sourceUrl !== null).length,
    reviewedFullTexts: 0,
    publicSearchCards: doc.cards.filter((card) => card.publicSearch).length,
  }
}

export function intakeCommandRefusal(argv: readonly string[]) {
  const hit = argv.find((arg) => arg === '--promote' || arg === '--scrape' || arg === '--index')
  if (!hit) return null
  return `拒绝 ${hit}：百部清单和投稿都不得自动写入公开检索。请按人工核准说明处理，不要恢复高量抓取。`
}
