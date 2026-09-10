import { z } from 'zod'
import {
  handleRemoteVoiceRequest,
  readRemoteJson,
  remoteVoicePreflight,
} from '@/lib/remote-voice/api'
import { remoteVoiceSessions } from '@/lib/remote-voice/session-store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const OPTIONS = remoteVoicePreflight

const createSchema = z.strictObject({
  label: z.string().trim().min(1).max(100).optional(),
})

export function POST(request: Request): Promise<Response> {
  return handleRemoteVoiceRequest(
    request,
    async () => {
      const input = await readRemoteJson(request, createSchema)
      return {
        status: 201,
        body: {
          session: remoteVoiceSessions.create(input.label),
          remotePath: '/remote-voice',
        },
      }
    },
    { requireSceneAuth: true },
  )
}
