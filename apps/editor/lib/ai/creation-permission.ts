import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import type { CreationLease } from '../stage/creation-policy'

export const CreationRequestSchema = z.strictObject({
  projectId: z.string().min(1).max(160),
  action: z.enum(['grant', 'check', 'revoke']),
  mode: z.enum(['create', 'draft']).optional(),
  explainedAndConfirmed: z.literal(true).optional(),
})
const leases = new Map<string, CreationLease>()
const COOKIE = 'diastage_ai_owner'
export function creationSession(request: Request) {
  return (
    request.headers
      .get('cookie')
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${COOKIE}=`))
      ?.slice(COOKIE.length + 1) ?? null
  )
}

export function handleCreationPermission(
  request: Request,
  input: z.infer<typeof CreationRequestSchema>,
  now = Date.now(),
) {
  const url = new URL(request.url)
  const origin = request.headers.get('origin')
  // The repository has no multi-user owner identity. Never treat a shared API token as ownership.
  if (
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    origin !== url.origin ||
    request.headers.has('x-diastage-remote-token')
  )
    return {
      status: 403,
      body: {
        error: {
          code: 'OWNER_REQUIRED',
          message: '连续制景目前仅供本机工作区拥有者使用；公网项目需要先接入拥有者身份验证。',
        },
      },
    }
  for (const [key, lease] of leases) if (lease.expiresAt <= now) leases.delete(key)
  const session = creationSession(request)
  if (input.action === 'revoke') {
    if (session) leases.delete(session)
    return {
      status: 200,
      body: { lease: null },
      cookie: `${COOKIE}=; Path=/api; HttpOnly; SameSite=Strict; Max-Age=0`,
    }
  }
  const minutes = Number(process.env.DIASTAGE_AI_CREATE_MODE_TTL_MINUTES ?? 30)
  const ttl = (Number.isFinite(minutes) && minutes > 0 && minutes <= 30 ? minutes : 30) * 60_000
  if (input.action === 'grant') {
    if (!input.mode || !input.explainedAndConfirmed)
      return {
        status: 403,
        body: { error: { code: 'CONSENT_REQUIRED', message: '请先阅读并确认授权范围。' } },
      }
    if (leases.size >= 128 && (!session || !leases.has(session)))
      return {
        status: 429,
        body: { error: { code: 'RATE_LIMITED', message: '授权会话已满，请稍后重试。' } },
      }
    if (session) leases.delete(session)
    const id = randomBytes(32).toString('base64url')
    const lease: CreationLease = {
      projectId: input.projectId,
      userId: 'local-workspace-owner',
      sessionId: crypto.randomUUID(),
      mode: input.mode,
      expiresAt: now + ttl,
    }
    leases.set(id, lease)
    return {
      status: 200,
      body: { lease },
      cookie: `${COOKIE}=${id}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=1800${url.protocol === 'https:' ? '; Secure' : ''}`,
    }
  }
  const lease = session ? leases.get(session) : null
  if (!lease || lease.projectId !== input.projectId)
    return {
      status: 403,
      body: {
        error: {
          code: 'PERMISSION_EXPIRED',
          message: '授权已过期或项目已切换，方案保留为建议预览。',
        },
      },
    }
  lease.expiresAt = now + ttl
  return { status: 200, body: { lease: { ...lease } } }
}
