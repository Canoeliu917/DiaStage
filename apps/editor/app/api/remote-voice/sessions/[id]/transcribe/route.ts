import { aiPreflight, handleAiRequest } from '@/lib/ai/api'
import { readAudioUpload } from '@/lib/ai/audio-validation'
import { transcribeVoice } from '@/lib/ai/voice-transcriber'
import { handleRemoteVoiceRequest, remoteToken } from '@/lib/remote-voice/api'
import { remoteVoiceSessions } from '@/lib/remote-voice/session-store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const OPTIONS = aiPreflight

type RouteParams = { params: Promise<{ id: string }> }

export function POST(request: Request, { params }: RouteParams): Promise<Response> {
  return handleRemoteVoiceRequest(request, async () => {
    const { id } = await params
    remoteVoiceSessions.authorizeRemoteRequest(id, remoteToken(request))
    const response = await handleAiRequest(
      request,
      async ({ signal }) => transcribeVoice(await readAudioUpload(request, signal), signal),
      { skipSceneAuth: true },
    )
    return {
      status: response.status,
      body: await response.json(),
    }
  })
}
