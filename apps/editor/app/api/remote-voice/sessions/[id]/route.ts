import { z } from 'zod'
import {
  handleRemoteVoiceRequest,
  ownerToken,
  readRemoteJson,
  remoteToken,
  remoteVoicePreflight,
} from '@/lib/remote-voice/api'
import { remoteVoiceSessions } from '@/lib/remote-voice/session-store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const OPTIONS = remoteVoicePreflight

type RouteParams = { params: Promise<{ id: string }> }

export function PATCH(request: Request, { params }: RouteParams): Promise<Response> {
  return handleRemoteVoiceRequest(request, async () => {
    const { id } = await params
    const input = await readRemoteJson(
      request,
      z.strictObject({ mode: z.enum(['suggest', 'create', 'draft']) }),
    )
    remoteVoiceSessions.setMode(id, ownerToken(request), input.mode)
    return { body: { mode: input.mode } }
  })
}

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
    const owner = ownerToken(request)
    if (owner) remoteVoiceSessions.revoke(id, owner)
    else remoteVoiceSessions.revokeRemote(id, remoteToken(request))
    return { body: { revoked: true } }
  })
}
