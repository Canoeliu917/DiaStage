import { expect, test } from 'bun:test'
import {
  AI_LIMITS,
  AiError,
  handleAiRequest,
  readBoundedBody,
  readJsonBody,
  takeAiRateLimit,
} from './api'

function request(body: string, headers: HeadersInit = {}): Request {
  return new Request('http://127.0.0.1/api/stage/plan', {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json', 'x-real-ip': crypto.randomUUID(), ...headers },
  })
}

test('body limits count real bytes even when content-length lies or is absent', async () => {
  for (const headers of [{}, { 'content-length': '1' }]) {
    await expect(
      readBoundedBody(request('123456', headers), 5, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' })
  }
  const result = await readBoundedBody(request('咫台'), 6, new AbortController().signal)
  expect(new TextDecoder().decode(result)).toBe('咫台')
  await expect(
    readJsonBody(request('not json'), new AbortController().signal),
  ).rejects.toMatchObject({ code: 'PLAN_INVALID' })
  await expect(
    readJsonBody(request('{}', { 'content-type': 'text/plain' }), new AbortController().signal),
  ).rejects.toMatchObject({ status: 415 })
})

test('streamed body can be cancelled while waiting for bytes', async () => {
  let cancelled = false
  const controller = new AbortController()
  const stream = new ReadableStream<Uint8Array>({
    cancel() {
      cancelled = true
    },
  })
  const input = new Request('http://127.0.0.1', { method: 'POST', body: stream, duplex: 'half' })
  const reading = readBoundedBody(input, 10, controller.signal)
  controller.abort()
  await expect(reading).rejects.toMatchObject({ name: 'AbortError' })
  expect(cancelled).toBe(true)
})

test('AI rate limits expire and keep a bounded map without evicting active clients', () => {
  const now = Date.now() + 120_000
  const key = crypto.randomUUID()
  for (let i = 0; i < AI_LIMITS.requestsPerMinute; i++) expect(takeAiRateLimit(key, now)).toBeNull()
  expect(takeAiRateLimit(key, now)).toBe(60)
  for (let i = 1; i < AI_LIMITS.maxRateBuckets; i++)
    expect(takeAiRateLimit(`${key}:${i}`, now)).toBeNull()
  expect(takeAiRateLimit(`${key}:overflow`, now)).toBe(60)
  expect(takeAiRateLimit(key, now + 60_000)).toBeNull()
})

test('responses carry request ID and safe errors without exposing provider details', async () => {
  const result = await handleAiRequest(request('{}'), async () => ({ plan: {} }))
  expect(result.status).toBe(200)
  expect((await result.json()).requestId).toBeString()
  expect(result.headers.get('cache-control')).toBe('no-store')
  const error = await handleAiRequest(request('{}'), async () => {
    throw new Error('secret provider body and stack')
  })
  expect(error.status).toBe(500)
  const body = await error.json()
  expect(body.requestId).toBeString()
  expect(body.error.code).toBe('INTERNAL_ERROR')
  expect(JSON.stringify(body)).not.toContain('secret')
  const known = await handleAiRequest(request('{}'), async () => {
    throw new AiError('PLAN_INVALID', '请明确台位。', 422, true)
  })
  expect(known.status).toBe(422)
  expect((await known.json()).error).toEqual({
    code: 'PLAN_INVALID',
    message: '请明确台位。',
    retryable: true,
  })
})

test('origin guard and cancelled request prevent execution', async () => {
  let called = false
  const response = await handleAiRequest(
    request('{}', { origin: 'https://untrusted.invalid' }),
    async () => {
      called = true
      return {}
    },
  )
  expect(response.status).toBe(403)
  expect((await response.json()).requestId).toBeString()
  expect(called).toBe(false)
  const controller = new AbortController()
  controller.abort()
  const aborted = new Request(request('{}'), { signal: controller.signal })
  const cancelled = await handleAiRequest(aborted, async () => {
    called = true
    return {}
  })
  expect(cancelled.status).toBe(499)
  expect(called).toBe(false)
})
