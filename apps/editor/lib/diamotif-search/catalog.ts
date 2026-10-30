import { z } from 'zod'

export const SEARCH_CATEGORIES = [
  { id: 'all', label: '全部', description: '所有戏剧专业资料' },
  {
    id: 'scripts',
    label: '剧本',
    description: '剧本文本、译本、选段与版本来源；剧情简介和演出录像另分',
  },
  {
    id: 'knowledge',
    label: '戏剧知识',
    description: '表演、导演、台词声乐、舞美、构作与制作理论；书目和观点标明出处',
  },
  {
    id: 'videos',
    label: '演出影像',
    description: '舞台录像、剧目片段、创作纪录及专业访谈；不含影视剧和娱乐视频',
  },
  {
    id: 'people',
    label: '演职人员',
    description: '有可核实戏剧作品、角色或创作教学经历的演员、导演、编剧及舞台创作人员',
  },
  {
    id: 'venues',
    label: '剧场剧团',
    description: '剧场空间、剧院机构、剧团与演出团体；单场排期和票务另分',
  },
  {
    id: 'events',
    label: '演出票讯',
    description: '具体演出版本、城市、场次、巡演与官方购票；历史影像和节展总览另分',
  },
  {
    id: 'admissions',
    label: '院校招生',
    description: '院校、戏剧专业、招生简章、申请与录取要求；统考政策另分',
  },
  {
    id: 'opportunities',
    label: '招募招聘',
    description: '有发布主体和角色或岗位的选角、试镜、演职招募及剧院招聘；课程招生另分',
  },
  {
    id: 'arts-exams',
    label: '艺考资讯',
    description: '戏剧相关统考、校考、报名、成绩与考试政策；按地区和适用年份核验',
  },
  {
    id: 'festivals',
    label: '戏剧节与工作坊',
    description: '大小戏剧节、展演单元、专业工作坊及征集报名；保留届次和有效状态',
  },
] as const

export type SearchCategory = (typeof SEARCH_CATEGORIES)[number]['id']
export const SEARCH_CATEGORY_GROUPS = [
  { id: 'all', label: '全部', categories: ['all'] },
  { id: 'works', label: '剧本影像', categories: ['scripts', 'videos'] },
  { id: 'knowledge', label: '戏剧知识', categories: ['knowledge'] },
  { id: 'people-venues', label: '演职与剧场', categories: ['people', 'venues'] },
  { id: 'events-activities', label: '演出活动', categories: ['events', 'festivals'] },
  { id: 'study', label: '艺考咨询', categories: ['admissions', 'arts-exams'] },
  { id: 'opportunities', label: '招募招聘', categories: ['opportunities'] },
] as const satisfies readonly { id: string; label: string; categories: readonly SearchCategory[] }[]
export const SearchCategorySchema = z.enum(SEARCH_CATEGORIES.map(({ id }) => id))
const sourceUrl = z.url().refine((value) => {
  const url = new URL(value)
  return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
})
export const SearchResourceSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    category: SearchCategorySchema.exclude(['all']).nullable(),
    topics: z.array(z.string()),
    summary: z.string().min(1),
    organization: z.string().min(1),
    url: sourceUrl.nullable(),
    verifiedAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    access: z.enum(['public', 'subscription', 'institution', 'onsite', 'mixed']),
    rights: z.enum(['metadata-only', 'open-license']),
    recordType: z.enum([
      'resource',
      'directory',
      'production',
      'person',
      'concept',
      'bibliography',
    ]),
    theatreEvidence: z.string().min(8),
    status: z.enum(['source-directory', 'verified', 'registered', 'web-candidate']),
    sourceRefs: z
      .array(
        z.object({ title: z.string(), url: sourceUrl.optional(), locator: z.string().optional() }),
      )
      .optional(),
    definitionStatus: z.string().optional(),
  })
  .refine((resource) => resource.category !== null || resource.status === 'web-candidate', {
    path: ['category'],
    message: '正式资料必须有明确分类，联网候选可等待分类核验。',
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
