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

const commandSchema = z.strictObject({
  transcript: z.string().trim().min(1).max(10_000),
})
const acknowledgementSchema = z.strictObject({
  sequence: z.number().int().positive(),
  disposition: z.enum(['loaded', 'dismissed']),
})

export function POST(request: Request, { params }: RouteParams): Promise<Response> {
  return handleRemoteVoiceRequest(request, async () => {
    const { id } = await params
    const input = await readRemoteJson(request, commandSchema)
    const command = remoteVoiceSessions.sendCommand(id, remoteToken(request), input.transcript)
    return { status: 202, body: { command } }
  })
}

export function PATCH(request: Request, { params }: RouteParams): Promise<Response> {
  return handleRemoteVoiceRequest(request, async () => {
    const { id } = await params
    const input = await readRemoteJson(request, acknowledgementSchema)
    remoteVoiceSessions.acknowledgeCommand(
      id,
      ownerToken(request),
      input.sequence,
      input.disposition,
    )
    return { body: { acknowledged: input.sequence, disposition: input.disposition } }
  })
}
