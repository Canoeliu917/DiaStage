import { aiPreflight, handleAiRequest, readJsonBody } from '@/lib/ai/api'
import { proposeRehearsal } from '@/lib/rehearsal-intelligence/openai-server'

export const runtime = 'nodejs'
export const OPTIONS = aiPreflight
export function POST(request: Request) {
  return handleAiRequest(request, async ({ signal }) => ({
    interaction: await proposeRehearsal(await readJsonBody(request, signal), signal),
  }))
}
