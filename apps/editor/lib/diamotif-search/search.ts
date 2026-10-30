import { z } from 'zod'
import resources from '../../../../DiaMotif/knowledge/theatre-resources.json'
import { DIA_KNOWLEDGE, explainConcept } from '../rehearsal-intelligence/knowledge/retrieval'
import {
  isEntertainmentQuery,
  isTheatreResource,
  type SearchCategory,
  SearchCategorySchema,
  type SearchResource,
  SearchResourceSchema,
} from './catalog'

export const SearchInputSchema = z.strictObject({
  query: z.string().trim().max(500).default(''),
  category: SearchCategorySchema.default('all'),
  useAi: z.boolean().default(false),
  useWeb: z.boolean().default(false),
  offset: z.number().int().min(0).max(10000).default(0),
})
export type SearchResponse = {
  query: string
  category: SearchCategory
  results: SearchResource[]
  total: number
  offset: number
  answer: null | { text: string; citationIds: string[]; provider: string; model: string }
  aiStatus: 'disabled' | 'available' | 'answered' | 'unavailable'
  webStatus?: 'disabled' | 'searched' | 'unavailable'
  notice: string | null
}

const recordUrl =
  'https://github.com/Canoeliu917/DiaStage/blob/codex/path9-desktop-ui/DiaMotif/references/theatre-books-and-sources.md'
const sources = new Map(DIA_KNOWLEDGE.sources.map((source) => [source.sourceId, source]))
const registered: SearchResource[] = [
  ...DIA_KNOWLEDGE.concepts.map(
    (concept): SearchResource => ({
      id: `concept:${concept.id}`,
      title: concept.label,
      category: 'knowledge',
      topics: [...new Set([concept.canonicalLabel, ...concept.aliases])],
      summary: explainConcept(concept.id)!.statement,
      organization: 'Dia 知识整理',
      url: concept.authorityRefs[0]?.url ?? recordUrl,
      verifiedAt: null,
      access: 'public',
      rights: 'metadata-only',
      recordType: 'concept',
      theatreEvidence: `戏剧专业概念；${concept.sourceRefs.map((ref) => `${sources.get(ref.sourceId)!.title}：${ref.locator}`).join('；')}`,
      status: 'registered',
      definitionStatus: concept.definitionStatus,
      sourceRefs: [
        ...concept.authorityRefs.map(({ title, url }) => ({ title, url })),
        ...concept.sourceRefs.map((ref) => ({
          title: sources.get(ref.sourceId)!.title,
          locator: ref.locator,
        })),
      ],
    }),
  ),
  ...DIA_KNOWLEDGE.sources.map(
    (source): SearchResource => ({
      id: `source:${source.sourceId}`,
      title: source.title,
      category: source.sourceType === 'example_source' ? 'scripts' : 'knowledge',
      topics: [source.title],
      summary: '已登记的戏剧参考资料，仅提供来源记录；不提供全文，也不代表已掌握整本教材。',
      organization: 'Dia 来源登记',
      url: source.notes.match(/https?:\/\/[^\s]+/)?.[0] ?? recordUrl,
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
  .parse([...resources, ...registered])
  .filter(isTheatreResource)
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
  const { query, category, offset } = SearchInputSchema.parse(raw)
  const base: SearchResponse = {
    query,
    category,
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
      notice:
        'Dia 只收录戏剧专业资料，不检索演员八卦、绯闻或私生活；可查询剧目、角色、创作与教学。',
    }
  const normalized = normalizeQuery(query)
  const workTitles = [...query.matchAll(/《([^》]+)》/g)].map((match) => normalize(match[1]!))
  const ranked = SEARCH_RESOURCES.filter(
    (resource) => category === 'all' || resource.category === category,
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
      ? '检索已登记资料与官方入口；目录不代表实时场次、余票或招生名额，全文访问以来源许可为准。'
      : '当前收录范围内没有匹配资料；未进行全网搜索，也未生成未经核实的推荐。',
  }
}
