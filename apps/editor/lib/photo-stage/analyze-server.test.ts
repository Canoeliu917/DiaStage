import { afterEach, expect, test } from 'bun:test'
import OpenAI from 'openai'
import { POST } from '../../app/api/photo-stage/analyze/route'
import { AI_LIMITS, handleAiRequest } from '../ai/api'
import { AVAILABLE_STAGE_SCENERY } from '../stage/prop-assets'
import { analyzePhotoStage, PHOTO_IMAGE_MAX_BYTES } from './analyze-server'

const imageDataUrl =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='
const originalKey = process.env.OPENAI_API_KEY
afterEach(() => {
  if (originalKey === undefined) delete process.env.OPENAI_API_KEY
  else process.env.OPENAI_API_KEY = originalKey
})

function modelPlan() {
  return {
    name: '照片布景',
    summary: '照片中一座方台，大小按比例估算。',
    stage: { width: 8, depth: 6 },
    uncertainties: [],
    objects: [
      {
        id: 'photo-cube',
        name: '方台',
        kind: 'neutral-block',
        assetId: 'SCN-CUBE-045',
        dimensions: { width: 0.45, height: 0.45, depth: 0.45 },
        position: [1, 0, 1],
        rotation: [0, 0, 0],
        color: null,
        stepCount: null,
        profile: null,
        hingeAngles: null,
      },
    ],
  }
}

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://127.0.0.1/api/photo-stage/analyze', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', 'x-real-ip': crypto.randomUUID(), ...headers },
  })
}

test('passes the uploaded image to vision with all 22 real assets and strict structured output', async () => {
  const signal = new AbortController().signal
  const plan = await analyzePhotoStage(
    { imageDataUrl, name: '此次照片' },
    signal,
    async (input, passedSignal) => {
      expect(passedSignal).toBe(signal)
      expect(input.store).toBe(false)
      expect(input.input[0]!.content[1]).toEqual({
        type: 'input_image',
        image_url: imageDataUrl,
        detail: 'high',
      })
      const context = JSON.parse(input.input[0]!.content[0]!.text!)
      expect(context.name).toBe('此次照片')
      expect(context.availableSceneryLibrary).toHaveLength(22)
      expect(
        context.availableSceneryLibrary.map((asset: { assetId: string }) => asset.assetId),
      ).toEqual(AVAILABLE_STAGE_SCENERY.map(({ asset }) => asset.id))
      for (const asset of context.availableSceneryLibrary) expect(asset.dimensions).toHaveLength(3)
      expect(input.instructions).toContain('原点在舞台地面中心')
      expect(input.instructions).toContain('Z 正向为台前和观众方向')
      expect(input.instructions).toContain('X 正向为观众看照片的画面右侧')
      expect(input.instructions).toContain('向台后升高的台阶应绕Y旋转π弧度')
      expect(input.instructions).toContain('弧度')
      expect(input.instructions).toContain('不可信')
      expect(input.text.format.strict).toBe(true)
      expect(JSON.stringify(input.text.format)).not.toContain('prefixItems')
      return modelPlan()
    },
  )
  expect(plan.objects).toHaveLength(1)
  expect(plan.objects[0]!.assetId).toBe('SCN-CUBE-045')
  expect(plan.objects[0]).not.toHaveProperty('color')
  expect(plan.uncertainties[0]).toContain('均为照片估算')
})

test('rejects malformed, remote and oversized inputs before invoking the provider', async () => {
  let calls = 0
  const model = async () => {
    calls++
    return modelPlan()
  }
  for (const input of [
    {},
    { imageDataUrl, name: 'x'.repeat(121) },
    { imageDataUrl, resourceUrl: 'https://example.com/image.png' },
    { imageDataUrl: 'https://example.com/image.png' },
    { imageDataUrl: 'data:image/svg+xml;base64,PHN2Zz4=' },
    { imageDataUrl: 'data:image/png;base64,bm90IGFuIGltYWdl' },
    { imageDataUrl: 'data:image/png;base64,iVBORw0KGgo=' },
    { imageDataUrl: imageDataUrl.slice(0, -1) },
  ]) {
    await expect(
      analyzePhotoStage(input, new AbortController().signal, model),
    ).rejects.toHaveProperty('code')
  }
  await expect(
    analyzePhotoStage(
      {
        imageDataUrl: `data:image/png;base64,${Buffer.alloc(PHOTO_IMAGE_MAX_BYTES + 1).toString('base64')}`,
      },
      new AbortController().signal,
      model,
    ),
  ).rejects.toMatchObject({ code: 'FILE_TOO_LARGE', status: 413 })
  expect(calls).toBe(0)
})

test('rejects hallucinated assets, kind conflicts, impossible transforms and arbitrary fields', async () => {
  const invalid = [
    { ...modelPlan(), command: 'execute' },
    { ...modelPlan(), objects: [{ ...modelPlan().objects[0], assetId: 'invented-asset' }] },
    { ...modelPlan(), objects: [{ ...modelPlan().objects[0], kind: 'chair' }] },
    { ...modelPlan(), objects: [{ ...modelPlan().objects[0], position: [0, -1, 0] }] },
    { ...modelPlan(), objects: [{ ...modelPlan().objects[0], rotation: [0, 90, 0] }] },
    {
      ...modelPlan(),
      objects: [{ ...modelPlan().objects[0], dimensions: { width: 0, height: 1, depth: 1 } }],
    },
    { ...modelPlan(), objects: [{ ...modelPlan().objects[0], geometry: 'custom' }] },
    { ...modelPlan(), objects: [modelPlan().objects[0], modelPlan().objects[0]] },
  ]
  for (const raw of invalid) {
    await expect(
      analyzePhotoStage({ imageDataUrl }, new AbortController().signal, async () => raw),
    ).rejects.toMatchObject({ code: 'PLAN_INVALID', status: 422 })
  }
  await expect(
    analyzePhotoStage({ imageDataUrl }, new AbortController().signal, async () => ({
      ...modelPlan(),
      objects: [],
    })),
  ).rejects.toThrow('未能识别')
})

test('cancellation prevents model use or discards an interrupted response', async () => {
  const controller = new AbortController()
  controller.abort()
  let called = false
  await expect(
    analyzePhotoStage({ imageDataUrl }, controller.signal, async () => {
      called = true
      return modelPlan()
    }),
  ).rejects.toMatchObject({ name: 'AbortError' })
  expect(called).toBe(false)
  const during = new AbortController()
  await expect(
    analyzePhotoStage({ imageDataUrl }, during.signal, async () => {
      during.abort()
      return modelPlan()
    }),
  ).rejects.toMatchObject({ name: 'AbortError' })
})

test('real route preserves bounded JSON, origin guard and honest missing-credential errors', async () => {
  delete process.env.OPENAI_API_KEY
  const oversized = await POST(request({}, { 'content-length': String(AI_LIMITS.jsonBytes + 1) }))
  expect(oversized.status).toBe(413)
  const denied = await POST(request({ imageDataUrl }, { origin: 'https://untrusted.invalid' }))
  expect(denied.status).toBe(403)
  const unsupported = await POST(request({ imageDataUrl: 'https://example.com/image.png' }))
  expect(unsupported.status).toBe(415)
  const missing = await POST(request({ imageDataUrl }))
  expect(missing.status).toBe(503)
  const body = await missing.json()
  expect(body.error.message).toContain('OPENAI_API_KEY')
  expect(body).not.toHaveProperty('plan')
  expect(body.requestId).toBeString()
  expect(missing.headers.get('cache-control')).toBe('no-store')
})

test('provider details remain private through the shared API error handler', async () => {
  const response = await handleAiRequest(request({ imageDataUrl }), async ({ signal }) => ({
    plan: await analyzePhotoStage({ imageDataUrl }, signal, async () => {
      throw new Error('private provider body / secret-key')
    }),
  }))
  expect(response.status).toBe(500)
  expect(JSON.stringify(await response.json())).not.toContain('secret-key')
})

test('connection failures and timeouts return an actionable 503 without provider details', async () => {
  for (const error of [
    new OpenAI.APIConnectionError({ message: 'secret-key: connection refused' }),
    new OpenAI.APIConnectionTimeoutError({ message: 'secret-key: timeout' }),
  ]) {
    const response = await handleAiRequest(request({ imageDataUrl }), async ({ signal }) => ({
      plan: await analyzePhotoStage({ imageDataUrl }, signal, async () => {
        throw error
      }),
    }))
    expect(response.status).toBe(503)
    const body = await response.json()
    expect(body.error.retryable).toBe(true)
    expect(body.error.message).toContain('网络连接')
    if (error instanceof OpenAI.APIConnectionTimeoutError)
      expect(body.error.message).toContain('超时')
    expect(JSON.stringify(body)).not.toContain('secret-key')
    expect(body).not.toHaveProperty('plan')
  }
})
