import {
  handleRemoteVoiceRequest,
  ownerToken,
  readRemoteJson,
  remoteToken,
  remoteVoicePreflight,
} from '@/lib/remote-voice/api'
import {
  RemoteDiaCommandInputSchema,
  RemoteDiaPatchSchema,
  SentDiaResponseSchema,
} from '@/lib/remote-voice/dia-protocol'
import { remoteDiaChannels } from '@/lib/remote-voice/dia-store'
import { remoteVoiceSessions } from '@/lib/remote-voice/session-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const OPTIONS = remoteVoicePreflight
type Context = { params: Promise<{ id: string }> }

export async function GET(request: Request, context: Context) {
  return handleRemoteVoiceRequest(request, async () => {
    const { id } = await context.params
    const owner = ownerToken(request)
    return {
      body: owner
        ? remoteDiaChannels.ownerStatus(id, owner)
        : remoteDiaChannels.remoteStatus(id, remoteToken(request)),
    }
  })
}

export async function POST(request: Request, context: Context) {
  return handleRemoteVoiceRequest(request, async () => {
    const { id } = await context.params
    const token = remoteToken(request)
    remoteVoiceSessions.sceneForRequest(id, token, 'remote')
    const input = await readRemoteJson(request, RemoteDiaCommandInputSchema)
    return {
      body: SentDiaResponseSchema.parse({ command: remoteDiaChannels.send(id, token, input) }),
      status: 202,
    }
  })
}

export async function PATCH(request: Request, context: Context) {
  return handleRemoteVoiceRequest(request, async () => {
    const { id } = await context.params
    const token = ownerToken(request)
    remoteVoiceSessions.sceneForRequest(id, token, 'owner')
    const input = await readRemoteJson(request, RemoteDiaPatchSchema, 128 * 1024)
    return { body: remoteDiaChannels.publish(id, token, input) }
  })
}
