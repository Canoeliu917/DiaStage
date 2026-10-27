import { afterEach, beforeEach, expect, mock, test } from 'bun:test'
import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import type { AutoParseableTextFormat } from 'openai/lib/parser'
import { z } from 'zod'
import { StageModelPlanSchema } from '../../apps/editor/lib/ai/stage-model-schema'
import { analyzePhotoStage } from '../../apps/editor/lib/photo-stage/analyze-server'
import { PhotoStagePlanSchema } from '../../apps/editor/lib/photo-stage/plan'
import { StructuredGroundingSchema } from '../../apps/editor/lib/rehearsal-intelligence/open-language'
import { AgentOutputSchema } from '../../apps/editor/lib/rehearsal-intelligence/schema'
import { scriptModelFormat } from '../../apps/editor/lib/scripts/script-planner'
import { ALIYUN_TRIAL_MODEL, requestAliyunStructured } from './aliyun-chat'

const imageDataUrl =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='
const originalFetch = globalThis.fetch
let fallbackFetch: ReturnType<typeof mock>
beforeEach(() => {
  fallbackFetch = mock(async () => {
    throw new Error('Real network is forbidden')
  })
  globalThis.fetch = fallbackFetch as unknown as typeof fetch
})
afterEach(() => {
  globalThis.fetch = originalFetch
  expect(fallbackFetch).not.toHaveBeenCalled()
})

const stage = {
  schemaVersion: 1,
  source: 'typed-command',
  venue: null,
  items: [
    {
      proposalId: 'table',
      existingNodeId: null,
      kind: 'round-table',
      displayName: '圆桌',
      libraryAssetId: null,
      dimensionsMeters: { width: 0.9, height: 0.75, depth: 0.9 },
      transform: { position: { x: 0, y: 0, z: 2 }, rotationDegrees: { x: 0, y: 0, z: 0 } },
      certainty: 'stated',
      assumptionIds: [],
      evidenceIds: [],
    },
  ],
  relations: [],
  assumptions: [],
  questions: [],
  evidence: [],
  warnings: [],
}
const rehearsal = {
  dramaticState: [],
  proposals: [
    {
      title: '保持距离',
      intention: '比较站位',
      rationale: '这是合成测试方案。',
      suggestions: [
        {
          id: 'hold-a',
          performerId: 'a',
          intention: '保持位置',
          movement: 'hold',
          targetPerformerId: null,
          targetObjectId: null,
          zone: null,
          extent: 'small',
          pace: 'slow',
        },
      ],
      alternatives: [],
      evidence: [],
      confidence: 0.8,
    },
  ],
}
const grounding = {
  grounding: {
    rawUtterance: '开放一点',
    subjects: [],
    references: [],
    intents: [],
    constraints: [],
    modifiers: [],
    ambiguities: ['请明确需要调整的物件。'],
    confidence: 0.2,
    requiresClarification: true,
    groundingVersion: 'open-language-v01',
    minimumWidthMeters: null,
    angleDegrees: null,
    knowledgeConceptIds: [],
  },
  reply: '请明确需要调整的物件。',
}
const cases: {
  name: string
  format: AutoParseableTextFormat<unknown>
  valid: unknown
  invalid: unknown
}[] = [
  {
    name: 'stage',
    format: zodTextFormat(StageModelPlanSchema, 'stage_plan'),
    valid: stage,
    invalid: { ...stage, execute: true },
  },
  {
    name: 'script',
    format: scriptModelFormat(),
    valid: { ...stage, source: 'script' },
    invalid: { ...stage, source: 'script', items: [{ ...stage.items[0], collisionGeometry: [] }] },
  },
  {
    name: 'rehearsal',
    format: zodTextFormat(AgentOutputSchema, 'rehearsal_possibilities'),
    valid: rehearsal,
    invalid: { ...rehearsal, proposals: [] },
  },
  {
    name: 'grounding',
    format: zodTextFormat(
      z.strictObject({ grounding: StructuredGroundingSchema, reply: z.string().max(2000) }),
      'dia_structured_grounding',
    ),
    valid: grounding,
    invalid: { ...grounding, grounding: { ...grounding.grounding, angleDegrees: 45 } },
  },
]

function completion(content: unknown) {
  return {
    id: 'synthetic-completion',
    object: 'chat.completion',
    created: 0,
    model: ALIYUN_TRIAL_MODEL,
    choices: [
      {
        index: 0,
        finish_reason: 'stop',
        logprobs: null,
        message: {
          role: 'assistant',
          content: typeof content === 'string' ? content : JSON.stringify(content),
          refusal: null,
        },
      },
    ],
    usage: {
      prompt_tokens: 3000,
      completion_tokens: 800,
      total_tokens: 3800,
      prompt_tokens_details: { cached_tokens: 1000 },
    },
  }
}
function transport(reply: unknown, status = 200) {
  const requests: { url: string; body: Record<string, unknown> }[] = []
  const fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    requests.push({ url: request.url, body: (await request.json()) as Record<string, unknown> })
    return Response.json(reply, { status })
  })
  const client = new OpenAI({
    apiKey: 'synthetic-offline-key',
    baseURL: 'https://aliyun-offline.invalid/compatible-mode/v1',
    fetch,
  })
  return { client, requests, fetch }
}
function request<T>(client: OpenAI, format: AutoParseableTextFormat<T>) {
  return {
    client,
    instructions: '只输出所需的结构化合成测试结果。',
    inputText: 'synthetic input',
    maxOutputTokens: 6000,
    format,
    signal: new AbortController().signal,
  }
}

for (const item of cases) {
  test(`${item.name}: actual SDK serializes strict Chat schema and parses the existing shape`, async () => {
    const wire = transport(completion(item.valid))
    const result = await requestAliyunStructured(request(wire.client, item.format))
    expect(result.output_parsed).toEqual(item.valid)
    expect(result.status).toBe('completed')
    expect(wire.requests).toHaveLength(1)
    expect(wire.requests[0]?.url).toBe(
      'https://aliyun-offline.invalid/compatible-mode/v1/chat/completions',
    )
    expect(wire.requests[0]?.body).toMatchObject({
      model: ALIYUN_TRIAL_MODEL,
      enable_thinking: false,
      stream: false,
      max_completion_tokens: 6000,
      response_format: {
        type: 'json_schema',
        json_schema: { name: item.format.name, strict: true, schema: item.format.schema },
      },
    })
    expect(wire.requests[0]?.body).not.toHaveProperty('max_tokens')
    expect(wire.requests[0]?.body).not.toHaveProperty('tools')
    expect(wire.requests[0]?.body).not.toHaveProperty('vl_high_resolution_images')
    if (item.name === 'script')
      expect(JSON.stringify(wire.requests[0]?.body.response_format)).not.toContain(
        'collisionGeometry',
      )
    expect(result.usage).toEqual({
      input_tokens: 3000,
      output_tokens: 800,
      input_tokens_details: {
        cached_tokens: 1000,
        cache_write_tokens: 0,
        cache_write_tokens_details: { ttl_12h_tokens: 0 },
      },
    })
  })
  test(`${item.name}: existing schema rejects invalid output`, async () => {
    const wire = transport(completion(item.invalid))
    await expect(requestAliyunStructured(request(wire.client, item.format))).rejects.toThrow(
      'invalid structured output',
    )
    expect(wire.fetch).toHaveBeenCalledTimes(1)
  })
}

function photo() {
  return {
    name: '照片合成测试',
    summary: '按照片比例估算的方台。',
    stage: { width: 8, depth: 6 },
    uncertainties: [],
    objects: [
      {
        id: 'cube',
        name: '方台',
        kind: 'neutral-block',
        assetId: 'SCN-CUBE-045',
        dimensions: { width: 0.45, height: 0.45, depth: 0.45 },
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        color: null,
        stepCount: null,
        profile: null,
        hingeAngles: null,
      },
    ],
  }
}
for (const invalid of [false, true]) {
  test(`photo: captured production model format ${invalid ? 'rejects an invalid asset' : 'maps one data URL and high-resolution cap'}`, async () => {
    const raw = photo()
    if (invalid) raw.objects[0]!.assetId = 'invented-asset'
    const wire = transport(completion(raw))
    const result = analyzePhotoStage(
      { imageDataUrl },
      new AbortController().signal,
      async (model, signal) => {
        const result = await requestAliyunStructured({
          ...request(wire.client, model.text.format),
          instructions: model.instructions,
          inputText: model.input[0]!.content[0]!.text!,
          imageDataUrl: model.input[0]!.content[1]!.image_url,
          maxOutputTokens: model.max_output_tokens,
          signal,
        })
        return result.output_parsed
      },
    )
    if (invalid) await expect(result).rejects.toThrow('invalid structured output')
    else {
      const plan = await result
      expect(PhotoStagePlanSchema.safeParse(plan).success).toBe(true)
      expect(plan.objects[0]?.assetId).toBe('SCN-CUBE-045')
      expect(wire.requests[0]?.body).toMatchObject({
        vl_high_resolution_images: true,
        messages: [
          { role: 'system' },
          {
            role: 'user',
            content: [{ type: 'text' }, { type: 'image_url', image_url: { url: imageDataUrl } }],
          },
        ],
      })
      expect(wire.requests[0]?.body).not.toHaveProperty('max_pixels')
    }
    expect(wire.fetch).toHaveBeenCalledTimes(1)
  })
}

test('missing or malformed usage is never accepted as successful zero-cost output', async () => {
  const valid = completion(stage)
  const usages: unknown[] = [
    undefined,
    null,
    {},
    { prompt_tokens: 0, completion_tokens: 800, total_tokens: 800 },
    { prompt_tokens: 3000, completion_tokens: 0, total_tokens: 3000 },
    { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    { ...valid.usage, prompt_tokens: -1 },
    { ...valid.usage, completion_tokens: 0.5 },
    { ...valid.usage, prompt_tokens: '3000' },
    { ...valid.usage, total_tokens: 3801 },
    { ...valid.usage, prompt_tokens_details: null },
    { ...valid.usage, prompt_tokens_details: { cached_tokens: -1 } },
    { ...valid.usage, prompt_tokens_details: { cached_tokens: 3001 } },
    { ...valid.usage, prompt_tokens_details: { cached_tokens: null } },
  ]
  for (const usage of usages) {
    const wire = transport({ ...valid, usage })
    await expect(requestAliyunStructured(request(wire.client, cases[0]!.format))).rejects.toThrow(
      'invalid token usage',
    )
  }
  const wire = transport({
    ...valid,
    usage: { prompt_tokens: 3000, completion_tokens: 800, total_tokens: 3800 },
  })
  const result = await requestAliyunStructured(request(wire.client, cases[0]!.format))
  expect(result.usage.input_tokens_details.cached_tokens).toBe(0)
})

test('refusal, truncation, extra choices, tools, empty content and invalid JSON all fail closed', async () => {
  const valid = completion(stage)
  const choice = valid.choices[0]!
  const replies = [
    { ...valid, choices: [] },
    { ...valid, choices: [choice, choice] },
    ...['length', 'content_filter', 'tool_calls'].map((finish_reason) => ({
      ...valid,
      choices: [{ ...choice, finish_reason }],
    })),
    ...[
      { ...choice.message, refusal: 'synthetic refusal' },
      { ...choice.message, content: '' },
      { ...choice.message, content: '```json\n{}\n```' },
      { ...choice.message, content: '{invalid' },
      {
        ...choice.message,
        tool_calls: [{ id: 'x', type: 'function', function: { name: 'execute', arguments: '{}' } }],
      },
      { ...choice.message, function_call: { name: 'execute', arguments: '{}' } },
      { ...choice.message, tool_calls: {} },
    ].map((message) => ({ ...valid, choices: [{ ...choice, message }] })),
  ]
  for (const reply of replies) {
    const wire = transport(reply)
    await expect(requestAliyunStructured(request(wire.client, cases[0]!.format))).rejects.toThrow()
    expect(wire.fetch).toHaveBeenCalledTimes(1)
  }
})

test('image callers cannot override the snapshot or fixed single-image resolution policy', async () => {
  const wire = transport(completion(stage))
  const input = {
    ...request(wire.client, cases[0]!.format),
    imageDataUrl,
    model: 'unapproved-model',
    vl_high_resolution_images: false,
    max_pixels: 1,
  }
  await requestAliyunStructured(input)
  expect(wire.requests[0]?.body).toMatchObject({
    model: ALIYUN_TRIAL_MODEL,
    vl_high_resolution_images: true,
  })
  expect(JSON.stringify(wire.requests[0]?.body)).not.toContain('max_pixels')
  await expect(
    requestAliyunStructured({
      ...input,
      imageDataUrl: [imageDataUrl, imageDataUrl] as unknown as string,
    }),
  ).rejects.toThrow('one image data URL')
  expect(wire.fetch).toHaveBeenCalledTimes(1)
})

test('reported output must remain within the reserved ten-token tolerance', async () => {
  const accepted = transport(completion(stage))
  await requestAliyunStructured({
    ...request(accepted.client, cases[0]!.format),
    maxOutputTokens: 790,
  })
  const rejected = transport(completion(stage))
  await expect(
    requestAliyunStructured({
      ...request(rejected.client, cases[0]!.format),
      maxOutputTokens: 789,
    }),
  ).rejects.toThrow('invalid token usage')
})

test('invalid input and cancellation never reach fetch; 429 is not retried', async () => {
  const wire = transport(completion(stage))
  for (const maxOutputTokens of [0, -1, 1.5, Infinity])
    await expect(
      requestAliyunStructured({ ...request(wire.client, cases[0]!.format), maxOutputTokens }),
    ).rejects.toThrow()
  await expect(
    requestAliyunStructured({
      ...request(wire.client, cases[0]!.format),
      imageDataUrl: 'https://example.invalid/photo.png',
    }),
  ).rejects.toThrow('one image data URL')
  await expect(
    requestAliyunStructured({
      ...request(wire.client, cases[0]!.format),
      signal: AbortSignal.abort(),
    }),
  ).rejects.toThrow()
  expect(wire.fetch).not.toHaveBeenCalled()
  const limited = transport(
    { error: { message: 'synthetic rate limit', type: 'rate_limit_error' } },
    429,
  )
  await expect(requestAliyunStructured(request(limited.client, cases[0]!.format))).rejects.toThrow()
  expect(limited.fetch).toHaveBeenCalledTimes(1)
})
