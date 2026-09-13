import { z } from 'zod'
import {
  handleRemoteVoiceRequest,
  ownerToken,
  readRemoteJson,
  remoteToken,
  remoteVoicePreflight,
} from '@/lib/remote-voice/api'
import { scanUploads } from '@/lib/remote-voice/scan-store'
import { remoteVoiceSessions } from '@/lib/remote-voice/session-store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const OPTIONS = remoteVoicePreflight
type Params = { params: Promise<{ id: string; uploadId: string }> }

export function GET(request: Request, { params }: Params): Promise<Response> {
  return handleRemoteVoiceRequest(request, async () => {
    const { id, uploadId } = await params
    remoteVoiceSessions.sceneForRequest(id, ownerToken(request), 'owner')
    return scanUploads.download(id, uploadId)
  })
}

export function PATCH(request: Request, { params }: Params): Promise<Response> {
  return handleRemoteVoiceRequest(request, async () => {
    const { id, uploadId } = await params
    remoteVoiceSessions.sceneForRequest(id, ownerToken(request), 'owner')
    const { state } = await readRemoteJson(
      request,
      z.strictObject({ state: z.enum(['imported', 'rejected']) }),
    )
    return { body: { upload: await scanUploads.finish(id, uploadId, state) } }
  })
}

export function DELETE(request: Request, { params }: Params): Promise<Response> {
  return handleRemoteVoiceRequest(request, async () => {
    const { id, uploadId } = await params
    const owner = ownerToken(request)
    remoteVoiceSessions.sceneForRequest(
      id,
      owner ?? remoteToken(request),
      owner ? 'owner' : 'remote',
    )
    return { body: { upload: await scanUploads.finish(id, uploadId, 'rejected') } }
  })
}
