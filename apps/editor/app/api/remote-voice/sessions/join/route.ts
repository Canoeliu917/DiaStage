import { z } from 'zod'
import {
  clientKey,
  handleRemoteVoiceRequest,
  readRemoteJson,
  remoteVoicePreflight,
  takeRemoteJoinRateLimit,
} from '@/lib/remote-voice/api'
import { RemoteVoiceSessionError, remoteVoiceSessions } from '@/lib/remote-voice/session-store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const OPTIONS = remoteVoicePreflight

const joinSchema = z.strictObject({
  code: z.string().trim().min(8).max(12),
})

export function POST(request: Request): Promise<Response> {
  return handleRemoteVoiceRequest(request, async () => {
    const retryAfter = takeRemoteJoinRateLimit(clientKey(request))
    if (retryAfter !== null) {
      throw new RemoteVoiceSessionError(
        'SESSION_LIMIT_REACHED',
        `尝试次数过多，请等待 ${retryAfter} 秒后再试。`,
        429,
      )
    }
    const input = await readRemoteJson(request, joinSchema)
    return { body: { session: remoteVoiceSessions.join(input.code) } }
  })
}
