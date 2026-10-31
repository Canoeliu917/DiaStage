import { AiError, handleAiRequest, readBoundedBody } from '@/lib/ai/api'
import { isAiProviderConfigured } from '@/lib/ai/provider-config'
import { answerDiaMotifSearch } from '@/lib/diamotif-search/answer-server'
import { isEntertainmentQuery, isExcludedMedia } from '@/lib/diamotif-search/catalog'
import {
  describeQwenFailure,
  describeSmartSearchResult,
  QWEN_NOTICES,
} from '@/lib/diamotif-search/qwen-search'
import { SearchInputSchema, searchDiaMotif } from '@/lib/diamotif-search/search'
import { searchDiaMotifWeb } from '@/lib/diamotif-search/web-search-server'
import { guardSceneApiRequest, sceneApiJson, sceneApiPreflight } from '@/lib/scene-api-security'

export const runtime = 'nodejs'
export const OPTIONS = sceneApiPreflight

export function GET(request: Request) {
  const denied = guardSceneApiRequest(request, { skipAuth: true })
  if (denied) return denied
  const url = new URL(request.url)
  const input = SearchInputSchema.safeParse({
    query: url.searchParams.get('q') ?? '',
    category: url.searchParams.get('category') ?? 'all',
    topic: url.searchParams.get('topic') ?? 'all',
    offset: Number(url.searchParams.get('offset') ?? 0),
  })
  if (!input.success)
    return sceneApiJson(
      request,
      { error: '请输入500字以内的查询、有效分类和分页位置。' },
      { status: 400 },
    )
  return sceneApiJson(request, searchDiaMotif(input.data))
}

export async function POST(request: Request) {
  const denied = guardSceneApiRequest(request, { skipAuth: true })
  if (denied) return denied
  let input: ReturnType<typeof SearchInputSchema.parse>
  try {
    if (request.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json')
      throw new Error('json required')
    const bytes = await readBoundedBody(request, 8192, request.signal)
    input = SearchInputSchema.parse(
      JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
    )
  } catch (error) {
    return sceneApiJson(
      request,
      { error: '请提交有效 JSON，查询最多500字；分类和分页位置须有效。' },
      { status: error instanceof AiError ? error.status : 400 },
    )
  }
  const search = searchDiaMotif(input)
  if (input.smart && (!input.useAi || !input.useWeb))
    return sceneApiJson(request, { error: '智能搜索须同时启用联网与 AI。' }, { status: 400 })
  if (input.useWeb && (!input.useAi || !input.query || input.offset !== 0))
    return sceneApiJson(
      request,
      { error: '联网检索须明确启用 AI、填写查询并从第一页开始。' },
      { status: 400 },
    )
  if (
    isEntertainmentQuery(input.query) ||
    isExcludedMedia(input.query.replace(/《[^》]*》/g, '')) ||
    !input.useAi ||
    !input.query
  )
    return sceneApiJson(request, search)
  if (!input.useWeb && !search.results.length)
    return sceneApiJson(request, { ...search, notice: QWEN_NOTICES.emptyLibrary })
  if (input.offset !== 0)
    return sceneApiJson(request, {
      ...search,
      notice: 'AI 回答使用查询第一页的相关资料；请返回第一页再问 DIA。',
    })
  if (!isAiProviderConfigured())
    return sceneApiJson(request, {
      ...search,
      aiStatus: 'unavailable',
      ...(input.useWeb ? { webStatus: 'unavailable' } : {}),
      notice: search.results.length
        ? `${QWEN_NOTICES.keyMissing}${QWEN_NOTICES.localStillOpen}`
        : `${QWEN_NOTICES.emptyLibrary}${QWEN_NOTICES.keyMissing}`,
    })
  const paid = await handleAiRequest(request, async ({ signal }) => {
    if (input.useWeb) {
      const evidence = input.smart ? search.results.slice(0, 8) : undefined
      const web = await searchDiaMotifWeb(
        input.query,
        input.category,
        signal,
        input.topic,
        evidence,
      )
      const results = [
        ...(evidence ?? []),
        ...web.results.filter((source) => !evidence?.some((item) => item.url === source.url)),
      ]
      const localIds = new Set((evidence ?? []).map((item) => item.id))
      const answer = web.answer?.citationIds.some((id) => localIds.has(id)) ? web.answer : null
      return {
        ...search,
        results,
        total: results.length,
        answer,
        aiStatus: input.smart ? (answer ? 'answered' : 'unavailable') : search.aiStatus,
        webStatus: 'searched',
        notice: input.smart
          ? describeSmartSearchResult({
              localCount: localIds.size,
              webCount: web.results.length,
              answered: Boolean(answer),
            })
          : results.length
            ? '以下为大陆及港澳来源站点的联网候选，正文、内容地区、时效与许可待核验；未自动入库，请打开原站确认。'
            : `${QWEN_NOTICES.emptyLibrary}${QWEN_NOTICES.noWebCandidates}`,
      }
    }
    return { ...search, answer: await answerDiaMotifSearch(search, signal), aiStatus: 'answered' }
  })
  if (paid.ok) return paid
  const failure = await paid.json()
  return sceneApiJson(request, {
    ...search,
    aiStatus: 'unavailable',
    ...(input.useWeb ? { webStatus: 'unavailable' } : {}),
    notice: describeQwenFailure({
      httpStatus: paid.status,
      code: failure.error?.code,
      message: failure.error?.message,
      localCount: search.results.length,
    }),
  })
}
