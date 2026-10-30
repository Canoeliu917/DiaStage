import { z } from 'zod'
import discoveryResources from '../../../../DiaMotif/knowledge/domestic-discovery.json'
import regionalResources from '../../../../DiaMotif/knowledge/theatre-regional-intake-20261030.json'
import resources from '../../../../DiaMotif/knowledge/theatre-resources.json'
import { DIA_KNOWLEDGE, explainConcept } from '../rehearsal-intelligence/knowledge/retrieval'
import {
  isEntertainmentQuery,
  isProfessionalResource,
  type SearchCategory,
  SearchCategorySchema,
  type SearchResource,
  SearchResourceSchema,
} from './catalog'
import {
  type SearchTopic,
  SearchTopicSchema,
  topicFitsCategory,
  topicMatches,
} from './search-topics'
import { sourceRegion } from './source-scope'

export const SearchInputSchema = z
  .strictObject({
    query: z.string().trim().max(500).default(''),
    category: SearchCategorySchema.default('all'),
    topic: SearchTopicSchema.default('all'),
    useAi: z.boolean().default(false),
    useWeb: z.boolean().default(false),
    smart: z.boolean().default(false),
    offset: z.number().int().min(0).max(10000).default(0),
  })
  .refine(({ category, topic }) => topicFitsCategory(category, topic), {
    path: ['topic'],
    message: '细分方向须与检索分类一致。',
  })
export type SearchResponse = {
  query: string
  category: SearchCategory
  topic: SearchTopic
  results: SearchResource[]
  total: number
  offset: number
  answer: null | { text: string; citationIds: string[]; provider: string; model: string }
  aiStatus: 'disabled' | 'available' | 'answered' | 'unavailable'
  webStatus?: 'disabled' | 'searched' | 'unavailable'
  notice: string | null
}

const sourceTitles = new Map(DIA_KNOWLEDGE.sources.map((source) => [source.sourceId, source.title]))
const sources = new Map(
  DIA_KNOWLEDGE.sources.flatMap((source) => {
    const url = source.notes.match(/https?:\/\/[^\s]+/)?.[0] ?? null
    if (url ? !sourceRegion(url) : source.sourceType === 'example_source') return []
    return [[source.sourceId, { ...source, url }] as const]
  }),
)
const registered: SearchResource[] = [
  ...DIA_KNOWLEDGE.concepts.map((concept): SearchResource => {
    const authorityRefs = concept.authorityRefs.filter(({ url }) => sourceRegion(url))
    const sourceRefs = concept.sourceRefs
    return {
      id: `concept:${concept.id}`,
      title: concept.label,
      category: 'knowledge',
      topics: [...new Set([concept.canonicalLabel, ...concept.aliases])],
      summary: explainConcept(concept.id)!.statement,
      organization: 'Dia 知识整理',
      url: authorityRefs[0]?.url ?? sources.get(sourceRefs[0]?.sourceId ?? '')?.url ?? null,
      verifiedAt: null,
      access: 'public',
      rights: 'metadata-only',
      recordType: 'concept',
      theatreEvidence: `戏剧专业概念；${sourceRefs.map((ref) => `${sourceTitles.get(ref.sourceId)!}：${ref.locator}`).join('；')}`,
      status: 'registered',
      definitionStatus: concept.definitionStatus,
      sourceRefs: [
        ...concept.authorityRefs.map(({ title, url }) =>
          sourceRegion(url)
            ? { title, url }
            : { title, locator: '历史术语参考；区域外原站暂缓跳转' },
        ),
        ...sourceRefs.map((ref) => ({
          title: sourceTitles.get(ref.sourceId)!,
          locator: ref.locator,
        })),
      ],
    }
  }),
  ...[...sources.values()].map(
    (source): SearchResource => ({
      id: `source:${source.sourceId}`,
      title: source.title,
      category: 'knowledge',
      topics: [source.title],
      summary: '已登记的戏剧参考资料，仅提供来源记录；不提供全文，也不代表已掌握整本教材。',
      organization: 'Dia 来源登记',
      url: source.url,
      verifiedAt: null,
      access: 'mixed',
      rights: 'metadata-only',
      recordType: 'bibliography',
      theatreEvidence: `戏剧知识目录已登记来源：${source.title}；版本 ${source.version}。`,
      status: 'registered',
    }),
  ),
]
export const SEARCH_RESOURCES = SearchResourceSchema.array()
  .parse([
    ...[...resources, ...regionalResources, ...discoveryResources].filter((resource) =>
      sourceRegion(resource.url),
    ),
    ...registered,
  ])
  .filter(isProfessionalResource)
const normalize = (value: string) =>
  value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\p{P}]/gu, '')

function normalizeQuery(value: string) {
  const subject = value
    .replace(
      /^(?:[请請](?:[帮幫]我|[给給]我)?|[帮幫]我|我想)?(?:查(?:找|[询詢])?|找|搜索|了解|介[绍紹]|解[释釋])(?:一下)?/u,
      '',
    )
    .replace(/(?:是什[么麼](?:意思)?|什[么麼]意思|的(?:含义|含義|意思))[？?。！!]*$/u, '')
    .trim()
  return normalize(subject || value)
}

function relevance(resource: SearchResource, query: string, workTitles: string[]) {
  const title = normalize(resource.title)
  const terms = [title, ...resource.topics.map(normalize)].filter((term) => term.length >= 2)
  const text = normalize(
    `${resource.title} ${resource.topics.join(' ')} ${resource.summary} ${resource.organization}`,
  )
  if (workTitles.length && !workTitles.some((workTitle) => text.includes(workTitle))) return 0
  const englishWork = query.match(/^(.+?)(?:的)?英文(?:剧本|劇本|译本|譯本|文本)$/u)?.[1]
  if (
    englishWork &&
    (!/英文|english/.test(text) ||
      (!workTitles.length && !text.includes(englishWork.replace(/的$/u, ''))))
  )
    return 0
  const matchedTerms = terms.filter((term) => query.includes(term))
  const grams = [
    ...new Set(
      Array.from({ length: Math.max(0, query.length - 1) }, (_, i) => query.slice(i, i + 2)),
    ),
  ]
  const matchedGrams = grams.filter((gram) => text.includes(gram)).length
  // A shared short fragment must not erase the rest of a specific topic or work name.
  if (
    !text.includes(query) &&
    !matchedTerms.some((term) => term.length >= 3) &&
    matchedGrams < Math.ceil(grams.length * 0.6)
  )
    return 0
  let score = title === query ? 100 : 0
  for (const term of matchedTerms) score += 15 + Math.min(30, term.length)
  if (text.includes(query)) score += 25
  score += matchedGrams
  return score
}

export function searchDiaMotif(raw: unknown): SearchResponse {
  const { query, category, topic, offset } = SearchInputSchema.parse(raw)
  const base: SearchResponse = {
    query,
    category,
    topic,
    results: [],
    total: 0,
    offset,
    answer: null,
    aiStatus: 'disabled',
    notice: null,
  }
  if (isEntertainmentQuery(query))
    return {
      ...base,
      notice: 'Dia 只收录戏剧专业资料及AI影视创作信息，不检索八卦、绯闻或私生活。',
    }
  const normalized = normalizeQuery(query)
  const workTitles = [...query.matchAll(/《([^》]+)》/g)].map((match) => normalize(match[1]!))
  const ranked = SEARCH_RESOURCES.filter(
    (resource) =>
      (category === 'all' || resource.category === category) && topicMatches(resource, topic),
  )
    .map((resource, index) => ({
      resource,
      index,
      score: normalized
        ? relevance(resource, normalized, workTitles)
        : resource.status === 'registered'
          ? 0
          : 1,
    }))
    .filter(({ score }) => !normalized || score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
  return {
    ...base,
    results: ranked.slice(offset, offset + 24).map(({ resource }) => resource),
    total: ranked.length,
    notice: ranked.length
      ? null
      : '中国大陆及港澳的已收录资料中暂无匹配；国外资料与链接暂缓，未生成未经核实的推荐。',
  }
}
