import { aiPreflight, handleAiRequest, readJsonBody } from '@/lib/ai/api'
import { respondDiaDialogue } from '@/lib/rehearsal-intelligence/dialogue-server'

export const runtime = 'nodejs'
export const OPTIONS = aiPreflight
export function POST(request: Request) {
  return handleAiRequest(request, async ({ signal }) =>
    respondDiaDialogue(await readJsonBody(request, signal), signal),
  )
}
