import type { z } from 'zod'
import {
  guardSceneApiRequest,
  sceneApiJson,
  sceneApiPreflight,
  withSceneApiHeaders,
} from '@/lib/scene-api-security'
import { RemoteVoiceSessionError } from './session-store'

const MAX_JSON_BYTES = 32 * 1024
const JOIN_ATTEMPTS_PER_MINUTE = 8
const MAX_JOIN_BUCKETS = 1_000
const joinBuckets = new Map<string, { count: number; resetAt: number }>()

export class RemoteVoiceApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

export const remoteVoicePreflight = sceneApiPreflight

export function ownerToken(request: Request): string | null {
  return request.headers.get('x-diastage-owner-token')
}

export function remoteToken(request: Request): string | null {
  return request.headers.get('x-diastage-remote-token')
}

export function clientKey(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  ).slice(0, 160)
}

export function takeRemoteJoinRateLimit(key: string, now = Date.now()): number | null {
  for (const [id, bucket] of joinBuckets) {
    if (bucket.resetAt <= now) joinBuckets.delete(id)
  }
  const bucket = joinBuckets.get(key)
  if (bucket) {
    if (bucket.count >= JOIN_ATTEMPTS_PER_MINUTE)
      return Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
    bucket.count++
    return null
  }
  if (joinBuckets.size >= MAX_JOIN_BUCKETS) return 60
  joinBuckets.set(key, { count: 1, resetAt: now + 60_000 })
  return null
}

export async function readRemoteJson<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  if (request.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json') {
    throw new RemoteVoiceApiError('INVALID_REQUEST', '请求格式无效。', 415)
  }
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_JSON_BYTES) {
    throw new RemoteVoiceApiError('REQUEST_TOO_LARGE', '请求内容过长。', 413)
  }
  if (!request.body) throw new RemoteVoiceApiError('INVALID_REQUEST', '请求内容为空。', 400)
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  let complete = false
  try {
    while (true) {
      const result = await withAbort(reader.read(), request.signal)
      if (result.done) break
      size += result.value.byteLength
      if (size > MAX_JSON_BYTES)
        throw new RemoteVoiceApiError('REQUEST_TOO_LARGE', '请求内容过长。', 413)
      chunks.push(result.value)
    }
    complete = true
  } finally {
    if (!complete) void reader.cancel().catch(() => {})
    reader.releaseLock()
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  let body: unknown
  try {
    body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    throw new RemoteVoiceApiError('INVALID_REQUEST', '请求内容不是有效 JSON。', 400)
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) throw new RemoteVoiceApiError('INVALID_REQUEST', '请求字段无效。', 400)
  return parsed.data
}

export async function handleRemoteVoiceRequest(
  request: Request,
  operation: () =>
    | Promise<{ body: unknown; status?: number } | Response>
    | { body: unknown; status?: number }
    | Response,
  options: { requireSceneAuth?: boolean } = {},
): Promise<Response> {
  const guard = guardSceneApiRequest(request, { skipAuth: !options.requireSceneAuth })
  if (guard) {
    const message =
      guard.status === 401
        ? '当前舞台端未通过验证，请重新打开项目。'
        : guard.status === 403
          ? '此页面来源不能建立手机连接。'
          : guard.status === 429
            ? '连接操作过于频繁，请稍后再试。'
            : '舞台端尚未配置安全访问，请联系管理员。'
    return sceneApiJson(
      request,
      { error: { code: 'ACCESS_DENIED', message } },
      { status: guard.status },
    )
  }
  try {
    const result = await operation()
    if (result instanceof Response) return withSceneApiHeaders(request, result)
    return sceneApiJson(request, result.body, { status: result.status ?? 200 })
  } catch (error) {
    if (error instanceof RemoteVoiceSessionError || error instanceof RemoteVoiceApiError) {
      return sceneApiJson(
        request,
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      )
    }
    if (request.signal.aborted) {
      return sceneApiJson(
        request,
        { error: { code: 'REQUEST_CANCELLED', message: '操作已取消。' } },
        { status: 499 },
      )
    }
    return sceneApiJson(
      request,
      { error: { code: 'INTERNAL_ERROR', message: '手机连接服务暂时不可用。' } },
      { status: 500 },
    )
  }
}

export function withAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener('abort', abort)
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
    }
    signal.addEventListener('abort', abort, { once: true })
    operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
    if (signal.aborted) abort()
  })
}
