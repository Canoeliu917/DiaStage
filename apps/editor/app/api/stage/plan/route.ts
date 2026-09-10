import { aiPreflight, handleAiRequest, readJsonBody } from '@/lib/ai/api'
import { planStageRequest } from '@/lib/ai/stage-planner'

export const runtime = 'nodejs'

export const OPTIONS = aiPreflight

export function POST(request: Request): Promise<Response> {
  return handleAiRequest(request, async ({ signal }) => ({
    plan: await planStageRequest(await readJsonBody(request, signal), signal),
  }))
}
