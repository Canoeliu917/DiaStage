import { aiPreflight, handleAiRequest, readJsonBody } from '@/lib/ai/api'
import { CreationRequestSchema, handleCreationPermission } from '@/lib/ai/creation-permission'

export const runtime = 'nodejs'
export const OPTIONS = aiPreflight
export function POST(request: Request) {
  let cookie: string | undefined
  let status = 200
  return handleAiRequest(request, async ({ signal }) => {
    const input = CreationRequestSchema.parse(await readJsonBody(request, signal))
    const result = handleCreationPermission(request, input)
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
