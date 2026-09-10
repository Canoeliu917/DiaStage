import {
  handleRemoteVoiceRequest,
  ownerToken,
  remoteToken,
  remoteVoicePreflight,
} from '@/lib/remote-voice/api'
import { remoteVoiceSessions } from '@/lib/remote-voice/session-store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const OPTIONS = remoteVoicePreflight

type RouteParams = { params: Promise<{ id: string }> }

export function GET(request: Request, { params }: RouteParams): Promise<Response> {
  return handleRemoteVoiceRequest(request, async () => {
    const { id } = await params
    const owner = ownerToken(request)
    return owner
      ? { body: { role: 'owner', status: remoteVoiceSessions.ownerStatus(id, owner) } }
      : {
          body: {
            role: 'remote',
            status: remoteVoiceSessions.remoteStatus(id, remoteToken(request)),
          },
        }
  })
}

export function DELETE(request: Request, { params }: RouteParams): Promise<Response> {
  return handleRemoteVoiceRequest(request, async () => {
    const { id } = await params
    remoteVoiceSessions.revoke(id, ownerToken(request))
    return { body: { revoked: true } }
  })
}
