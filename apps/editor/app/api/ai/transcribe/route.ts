import { aiPreflight, handleAiRequest } from '@/lib/ai/api'
import { readAudioUpload } from '@/lib/ai/audio-validation'
import { transcribeVoice } from '@/lib/ai/voice-transcriber'

export const runtime = 'nodejs'
export const OPTIONS = aiPreflight

export function POST(request: Request): Promise<Response> {
  return handleAiRequest(request, async ({ signal }) =>
    transcribeVoice(await readAudioUpload(request, signal), signal),
  )
}
