import { z } from 'zod'

export const SEARCH_CATEGORIES = [
  { id: 'all', label: '全部', description: '所有戏剧专业资料' },
  { id: 'scripts', label: '剧本', description: '剧作、版本、选段与文本来源' },
  { id: 'knowledge', label: '戏剧知识', description: '表演、导演、台词、声乐、舞美与戏剧理论' },
  { id: 'videos', label: '演出影像', description: '演出录像、剧目片段与创作纪录片' },
  { id: 'people', label: '演职人员', description: '戏剧演员、导演、编剧与舞台创作人员' },
  { id: 'venues', label: '剧场剧团', description: '剧场空间、剧院与演出团体' },
  { id: 'events', label: '演出票讯', description: '剧目排期、巡演与官方购票来源' },
  { id: 'admissions', label: '院校招生', description: '戏剧院校、专业、艺考与招生公告' },
  { id: 'opportunities', label: '招募招聘', description: '演员选角、试镜、剧组招募与剧院岗位' },
] as const

export type SearchCategory = (typeof SEARCH_CATEGORIES)[number]['id']
export const SearchCategorySchema = z.enum(SEARCH_CATEGORIES.map(({ id }) => id))
const sourceUrl = z.url().refine((value) => {
  const url = new URL(value)
  return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
})
export const SearchResourceSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  category: SearchCategorySchema.exclude(['all']),
  topics: z.array(z.string()),
  summary: z.string().min(1),
  organization: z.string().min(1),
  url: sourceUrl,
  verifiedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  access: z.enum(['public', 'subscription', 'institution', 'onsite', 'mixed']),
  rights: z.enum(['metadata-only', 'open-license']),
  recordType: z.enum(['resource', 'directory', 'production', 'person', 'concept', 'bibliography']),
  theatreEvidence: z.string().min(8),
  status: z.enum(['source-directory', 'verified', 'registered', 'web-candidate']),
  sourceRefs: z
    .array(
      z.object({ title: z.string(), url: sourceUrl.optional(), locator: z.string().optional() }),
    )
    .optional(),
  definitionStatus: z.string().optional(),
})
export type SearchResource = z.infer<typeof SearchResourceSchema>

export function isEntertainmentQuery(query: string) {
  // A quoted play title or a character's relationship is not a performer's private life.
  const text = query.normalize('NFKC').replace(/《[^》]*》/g, '')
  return /娱乐新闻|娛樂新聞|花边新闻|花邊新聞|八卦|绯闻|緋聞|狗仔|饭圈|飯圈|明星热搜|明星熱搜|(?:明星|艺人|藝人|演员|演員).{0,12}(?:恋情|戀情|私生活|隐私|隱私)|(?:恋情|戀情|私生活|隐私|隱私).{0,12}(?:明星|艺人|藝人|演员|演員)/.test(
    text,
  )
}

export function isTheatreResource(resource: SearchResource) {
  if (isEntertainmentQuery(`${resource.title} ${resource.summary}`)) return false
  if (
    !/剧|劇|戏|戲|舞台|演出|表演|theatr|drama|opera|ballet|\bplays?\b/i.test(
      resource.theatreEvidence,
    )
  )
    return false
  if (resource.recordType === 'person')
    return (
      resource.status === 'verified' &&
      /剧目|劇目|角色|剧团|劇團|剧院|劇院|舞台|演出|戏剧教学|戲劇教學/.test(
        resource.theatreEvidence,
      )
    )
  return true
}
