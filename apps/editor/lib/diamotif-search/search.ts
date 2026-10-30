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
      organization: 'DiaMotif 知识整理',
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
      organization: 'DiaMotif 来源登记',
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

function relevance(resource: SearchResource, query: string) {
  const title = normalize(resource.title)
  const terms = [title, ...resource.topics.map(normalize)].filter((term) => term.length >= 2)
  let score = title === query ? 100 : 0
  for (const term of terms) if (query.includes(term)) score += 15 + Math.min(30, term.length)
  const text = normalize(
    `${resource.title} ${resource.topics.join(' ')} ${resource.summary} ${resource.organization}`,
  )
  if (text.includes(query)) score += 25
  const grams = [
    ...new Set(
      Array.from({ length: Math.max(0, query.length - 1) }, (_, i) => query.slice(i, i + 2)),
    ),
  ]
  score += grams.filter((gram) => text.includes(gram)).length
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
        'DiaMotif 只收录戏剧专业资料，不检索演员八卦、绯闻或私生活；可查询剧目、角色、创作与教学。',
    }
  const normalized = normalize(query)
  const ranked = SEARCH_RESOURCES.filter(
    (resource) => category === 'all' || resource.category === category,
  )
    .map((resource, index) => ({
      resource,
      index,
      score: normalized
        ? relevance(resource, normalized)
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
