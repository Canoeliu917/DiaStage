import { guardSceneApiRequest, sceneApiJson, withSceneApiHeaders } from '../scene-api-security'

export const AI_LIMITS = {
  jsonBytes: 1024 * 1024,
  requestTimeoutMs: 60_000,
  requestsPerMinute: 12,
  maxRateBuckets: 1000,
} as const

export interface ApiErrorBody {
  requestId: string
  error: {
    code:
      | 'UNSUPPORTED_FILE'
      | 'FILE_TOO_LARGE'
      | 'SCANNED_PDF'
      | 'CORRUPT_DOCUMENT'
      | 'AUDIO_UNSUPPORTED'
      | 'TRANSCRIPTION_FAILED'
      | 'PLAN_INVALID'
      | 'AMBIGUOUS_COMMAND'
      | 'RATE_LIMITED'
      | 'INTERNAL_ERROR'
    message: string
    retryable: boolean
  }
}

export class AiError extends Error {
  constructor(
    readonly code: ApiErrorBody['error']['code'],
    message: string,
    readonly status = 400,
    readonly retryable = false,
  ) {
    super(message)
    this.name = 'AiError'
  }
}

const rateBuckets = new Map<string, { count: number; resetAt: number }>()

export function takeAiRateLimit(key: string, now = Date.now()): number | null {
  for (const [id, bucket] of rateBuckets) {
    if (bucket.resetAt <= now) rateBuckets.delete(id)
  }
  const bucket = rateBuckets.get(key)
  if (bucket) {
    if (bucket.count >= AI_LIMITS.requestsPerMinute)
      return Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
    bucket.count++
    return null
  }
  // Do not evict active entries: rotating client IDs must not bypass the limit.
  if (rateBuckets.size >= AI_LIMITS.maxRateBuckets) return 60
  rateBuckets.set(key, { count: 1, resetAt: now + 60_000 })
  return null
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

export async function readBoundedBody(
  request: Request,
  maxBytes: number,
  signal: AbortSignal,
): Promise<Uint8Array<ArrayBuffer>> {
  signal.throwIfAborted()
  const tooLarge = () =>
    new AiError('FILE_TOO_LARGE', '提交内容超过大小限制，请缩短内容后重试。', 413)
  const declaredLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw tooLarge()
  if (!request.body) return new Uint8Array()
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  let complete = false
  try {
    while (true) {
      const chunk = await withAbort(reader.read(), signal)
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > maxBytes) throw tooLarge()
      chunks.push(chunk.value)
    }
    complete = true
  } finally {
    if (!complete) void reader.cancel().catch(() => {})
    reader.releaseLock()
  }
  const result = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

export async function readJsonBody(request: Request, signal: AbortSignal): Promise<unknown> {
  if (request.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json')
    throw new AiError('PLAN_INVALID', '请以 JSON 格式提交舞台口令。', 415)
  const bytes = await readBoundedBody(request, AI_LIMITS.jsonBytes, signal)
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    throw new AiError('PLAN_INVALID', '提交内容不是有效的 JSON。')
  }
}

function errorResponse(request: Request, requestId: string, error: AiError): Response {
  const body: ApiErrorBody = {
    requestId,
    error: { code: error.code, message: error.message, retryable: error.retryable },
  }
  return sceneApiJson(request, body, { status: error.status })
}

function accessError(status: number): AiError {
  return new AiError(
    'INTERNAL_ERROR',
    status === 401
      ? '当前会话未通过验证，请重新打开项目。'
      : status === 403
        ? '此来源不能访问舞台输入服务。'
        : '服务端尚未配置访问令牌，请联系网站管理员。',
    status,
  )
}

export function aiPreflight(request: Request): Response {
  const guard = guardSceneApiRequest(request, { skipRateLimit: true, skipAuth: true })
  if (guard) return errorResponse(request, crypto.randomUUID(), accessError(guard.status))
  return withSceneApiHeaders(request, new Response(null, { status: 204 }))
}

export async function handleAiRequest(
  request: Request,
  operation: (context: {
    requestId: string
    signal: AbortSignal
  }) => Promise<Record<string, unknown>>,
  options: { skipSceneAuth?: boolean } = {},
): Promise<Response> {
  const requestId = crypto.randomUUID()
  const guard = guardSceneApiRequest(request, {
    skipRateLimit: true,
    skipAuth: options.skipSceneAuth,
  })
  if (guard) return errorResponse(request, requestId, accessError(guard.status))
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  const retryAfter = takeAiRateLimit(ip.slice(0, 160))
  if (retryAfter !== null) {
    const response = errorResponse(
      request,
      requestId,
      new AiError('RATE_LIMITED', '操作过于频繁，请稍候再试。', 429, true),
    )
    response.headers.set('Retry-After', String(retryAfter))
    return response
  }
  const timeout = new AbortController()
  const timer = setTimeout(() => timeout.abort(), AI_LIMITS.requestTimeoutMs)
  const signal = AbortSignal.any([request.signal, timeout.signal])
  try {
    signal.throwIfAborted()
    const result = await withAbort(operation({ requestId, signal }), signal)
    signal.throwIfAborted()
    return sceneApiJson(request, { ...result, requestId })
  } catch (error) {
    const failure = request.signal.aborted
      ? new AiError('INTERNAL_ERROR', '操作已取消。', 499)
      : timeout.signal.aborted
        ? new AiError('INTERNAL_ERROR', '处理超时，请稍后重试。当前舞台未发生修改。', 504, true)
        : error instanceof AiError
          ? error
          : new AiError('INTERNAL_ERROR', '舞台输入服务暂时不可用，请稍后重试。', 500, true)
    return errorResponse(request, requestId, failure)
  } finally {
    clearTimeout(timer)
  }
}
