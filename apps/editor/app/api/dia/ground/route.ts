import { aiPreflight, handleAiRequest, readJsonBody } from '@/lib/ai/api'
import { groundOpenLanguageWithModel } from '@/lib/rehearsal-intelligence/open-language-server'

export const runtime = 'nodejs'
export const OPTIONS = aiPreflight
export function POST(request: Request) {
  return handleAiRequest(request, async ({ signal }) =>
    groundOpenLanguageWithModel(await readJsonBody(request, signal), signal),
  )
}
