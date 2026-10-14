import { AiError, aiPreflight, handleAiRequest, readJsonBody } from '@/lib/ai/api'
import { CreationRequestSchema, handleCreationPermission } from '@/lib/ai/creation-permission'
import { getPrivateSceneAccess } from '@/lib/scene-store-server'

export const runtime = 'nodejs'
export const OPTIONS = aiPreflight
export async function POST(request: Request) {
  const access = await getPrivateSceneAccess(request)
  if (access instanceof Response) return access
  let cookie: string | undefined
  let status = 200
  return handleAiRequest(request, async ({ signal }) => {
    const input = CreationRequestSchema.safeParse(await readJsonBody(request, signal))
    if (!input.success) throw new AiError('PLAN_INVALID', '授权请求格式无效，请重新选择模式。', 422)
    if (!(await access.operations.loadStoredScene(input.data.projectId))) {
      status = 404
      return { error: { code: 'NOT_FOUND', message: '剧目不存在或不属于当前账号。' } }
    }
    const result = handleCreationPermission(request, input.data, access.user.id)
    cookie = result.cookie
    status = result.status
    return result.body
  }).then((response) => {
    if (response.ok && status !== 200)
      return new Response(response.body, { status, headers: response.headers })
    if (cookie) response.headers.set('Set-Cookie', cookie)
    return response
  })
}
