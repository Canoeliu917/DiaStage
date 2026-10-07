import { aiPreflight, handleAiRequest, readJsonBody } from '@/lib/ai/api'
import { analyzePhotoStage } from '@/lib/photo-stage/analyze-server'

export const runtime = 'nodejs'

export const OPTIONS = aiPreflight

export function POST(request: Request): Promise<Response> {
  return handleAiRequest(request, async ({ signal }) => ({
    plan: await analyzePhotoStage(await readJsonBody(request, signal), signal),
  }))
}
