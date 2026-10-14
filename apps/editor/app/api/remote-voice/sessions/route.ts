import { z } from 'zod'
import {
  handleRemoteVoiceRequest,
  RemoteVoiceApiError,
  readRemoteJson,
  remoteVoicePreflight,
} from '@/lib/remote-voice/api'
import { remoteVoiceSessions } from '@/lib/remote-voice/session-store'
import { getPrivateSceneAccess } from '@/lib/scene-store-server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const OPTIONS = remoteVoicePreflight

const createSchema = z.strictObject({
  label: z.string().trim().min(1).max(100).optional(),
  sceneId: z.string().min(1).max(100).optional(),
})

export function POST(request: Request): Promise<Response> {
  return handleRemoteVoiceRequest(request, async () => {
    const access = await getPrivateSceneAccess(request)
    if (access instanceof Response) return access
    const input = await readRemoteJson(request, createSchema)
    if (input.sceneId && !(await access.operations.loadStoredScene(input.sceneId))) {
      throw new RemoteVoiceApiError('SCENE_NOT_SAVED', '请先保存场景，再连接手机。', 409)
    }
    return {
      status: 201,
      body: {
        session: remoteVoiceSessions.create(input.label, input.sceneId),
        remotePath: '/remote-voice',
      },
    }
  })
}
