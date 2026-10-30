import { AiError, handleAiRequest, readBoundedBody } from '@/lib/ai/api'
import { isAiProviderConfigured } from '@/lib/ai/provider-config'
import { answerDiaMotifSearch } from '@/lib/diamotif-search/answer-server'
import { isEntertainmentQuery } from '@/lib/diamotif-search/catalog'
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
  if (input.useWeb && (!input.useAi || !input.query || input.offset !== 0))
    return sceneApiJson(
      request,
      { error: '联网检索须明确启用 AI、填写查询并从第一页开始。' },
      { status: 400 },
    )
  if (
    isEntertainmentQuery(input.query) ||
    !input.useAi ||
    !input.query ||
    (!input.useWeb && !search.results.length)
  )
    return sceneApiJson(request, search)
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
      notice: 'AI 回答尚未配置，以下资料仍可检索与打开。',
    })
  const paid = await handleAiRequest(request, async ({ signal }) => {
    if (input.useWeb) {
      const results = await searchDiaMotifWeb(input.query, input.category, signal)
      return {
        ...search,
        results,
        total: results.length,
        webStatus: 'searched',
        notice: results.length
          ? '以下为大陆及港澳来源站点的联网候选，正文、内容地区、时效与许可待核验；未自动入库，请打开原站确认。'
          : '联网服务未返回符合大陆及港澳戏剧收录范围的结构化来源；没有补写链接或答案。',
      }
    }
    return { ...search, answer: await answerDiaMotifSearch(search, signal), aiStatus: 'answered' }
  })
  if (paid.ok) return paid
  const failure = await paid.json()
  const code = failure.error?.code
  const notice =
    paid.status === 401
      ? '请先登录后使用 AI 回答；资料检索不受影响。'
      : code === 'AI_INVITE_REQUIRED'
        ? 'AI 回答暂向受邀内测账号开放；资料检索不受影响。'
        : code === 'BUDGET_EXCEEDED'
          ? '当前 AI 额度不足，未开始新的付费调用；资料检索不受影响。'
          : code === 'BUDGET_CONFIRMATION_REQUIRED'
            ? '本次 AI 预留估算超过提醒额度，未开始调用；资料检索仍可使用。'
            : 'AI 回答暂时不可用，本次没有返回 AI 答案；以下资料仍可使用。'
  return sceneApiJson(request, {
    ...search,
    aiStatus: 'unavailable',
    ...(input.useWeb ? { webStatus: 'unavailable' } : {}),
    notice: input.useWeb ? `联网检索未完成，未返回在线来源。${notice}` : notice,
  })
}
