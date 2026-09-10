import {
  handleRemoteVoiceRequest,
  ownerToken,
  RemoteVoiceApiError,
  remoteToken,
  remoteVoicePreflight,
} from '@/lib/remote-voice/api'
import { scanUploads } from '@/lib/remote-voice/scan-store'
import { remoteVoiceSessions } from '@/lib/remote-voice/session-store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const OPTIONS = remoteVoicePreflight
type Params = { params: Promise<{ id: string }> }

export function GET(request: Request, { params }: Params): Promise<Response> {
  return handleRemoteVoiceRequest(request, async () => {
    const { id } = await params
    const owner = ownerToken(request)
    remoteVoiceSessions.sceneForRequest(
      id,
      owner ?? remoteToken(request),
      owner ? 'owner' : 'remote',
    )
    return { body: { uploads: scanUploads.list(id) } }
  })
}

export function POST(request: Request, { params }: Params): Promise<Response> {
  return handleRemoteVoiceRequest(request, async () => {
    const { id } = await params
    const sceneId = remoteVoiceSessions.sceneForRequest(id, remoteToken(request), 'remote')
    let name: string
    try {
      name = decodeURIComponent(request.headers.get('x-scan-name') ?? '')
    } catch {
      throw new RemoteVoiceApiError('SCAN_INVALID', '扫描文件名编码不正确。', 400)
    }
    const upload = await scanUploads.upload(
      id,
      sceneId,
      {
        id: request.headers.get('x-scan-id') ?? '',
        name,
        bytes: Number(request.headers.get('x-scan-bytes')),
        sha256: request.headers.get('x-scan-sha256') ?? '',
      },
      request.body,
      request.signal,
      () => {
        remoteVoiceSessions.sceneForRequest(id, remoteToken(request), 'remote')
      },
    )
    return { body: { upload }, status: upload.state === 'failed' ? 422 : 202 }
  })
}
