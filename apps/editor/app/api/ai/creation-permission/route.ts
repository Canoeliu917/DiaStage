import { AiError, aiPreflight, handleAiRequest, readJsonBody } from '@/lib/ai/api'
import { CreationRequestSchema, handleCreationPermission } from '@/lib/ai/creation-permission'

export const runtime = 'nodejs'
export const OPTIONS = aiPreflight
export function POST(request: Request) {
  let cookie: string | undefined
  let status = 200
  return handleAiRequest(request, async ({ signal }) => {
    const input = CreationRequestSchema.safeParse(await readJsonBody(request, signal))
    if (!input.success) throw new AiError('PLAN_INVALID', '授权请求格式无效，请重新选择模式。', 422)
    const result = handleCreationPermission(request, input.data)
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
