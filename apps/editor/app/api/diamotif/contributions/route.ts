import {
  contributionDirectory,
  savePendingContribution,
} from '@/lib/diamotif-search/contribution-store'
import { ContributionError, contributionFromRequest } from '@/lib/diamotif-search/contributions'
import { guardSceneApiRequest, sceneApiJson } from '@/lib/scene-api-security'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const denied = guardSceneApiRequest(request, { skipAuth: true })
  if (denied) return denied
  try {
    const draft = await contributionFromRequest(request)
    const saved = await savePendingContribution(draft, contributionDirectory())
    return sceneApiJson(request, {
      id: saved.id,
      status: saved.status,
      publicSearch: saved.publicSearch,
    })
  } catch (error) {
    if (error instanceof ContributionError)
      return sceneApiJson(request, { error: error.message }, { status: error.status })
    return sceneApiJson(request, { error: '暂时无法保存投稿，请稍后再试。' }, { status: 500 })
  }
}
