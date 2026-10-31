import { Database } from 'bun:sqlite'
import { afterAll, beforeEach, expect, mock, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'

if (process.env.DIASTAGE_STRUCTURED_TEST_CHILD !== '1') {
  test('production structured callers run in an isolated offline process', () => {
    const result = Bun.spawnSync([process.execPath, '--no-env-file', 'test', import.meta.path], {
      env: {
        PATH: process.env.PATH ?? '',
        SystemRoot: process.env.SystemRoot ?? '',
        TEMP: tmpdir(),
        TMP: tmpdir(),
        DIASTAGE_STRUCTURED_TEST_CHILD: '1',
      },
      timeout: 20_000,
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const output = result.stdout.toString() + result.stderr.toString()
    expect(result.exitCode, output).toBe(0)
    console.info(
      output
        .split('\n')
        .filter((line) => /\d+ pass|\d+ fail|expect\(\) calls/.test(line))
        .join('\n'),
    )
  }, 25_000)
} else {
  const directory = mkdtempSync(join(tmpdir(), 'diastage-structured-offline-'))
  process.env.DIASTAGE_AI_LEDGER_PATH = join(directory, 'usage.db')
  process.env.DIASTAGE_AI_PROVIDER = 'aliyun'
  process.env.DASHSCOPE_API_KEY = 'synthetic-offline-key'
  process.env.DASHSCOPE_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
  process.env.DIASTAGE_AI_BETA_USER_IDS = 'structured-test-user'
  process.env.DIASTAGE_USD_CNY_REFERENCE = 'not-used-for-CNY-models'
  delete process.env.OPENAI_API_KEY
  const originalFetch = globalThis.fetch
  mock.module('server-only', () => ({}))
  const { generateStagePlan } = await import('./openai-server')
  const { groundOpenLanguageWithModel } = await import(
    '../rehearsal-intelligence/open-language-server'
  )
  const { requestRehearsalOutput } = await import('../rehearsal-intelligence/openai-server')
  const { analyzePhotoStage } = await import('../photo-stage/analyze-server')
  const { planFromPassages } = await import('../scripts/script-planner')
  const { ACTIVE_DIMENSIONS } = await import('../rehearsal-intelligence/dimensions')
  const { aiRequestContext } = await import('./usage')
  const { usageLedger } = await import('./usage-ledger')
  const { estimateCall } = await import('./model-budget')
  const { estimateTextCostCny, QWEN_IMAGE_INPUT_TOKENS, QWEN_TRIAL_MODEL } = await import(
    './model-pricing'
  )
  const ledger = usageLedger()
  await ledger.summary()
  const db = new Database(process.env.DIASTAGE_AI_LEDGER_PATH)
  const imageDataUrl =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='
  const sceneContext = {
    documentVersion: 1,
    venue: { type: 'black-box' as const, widthMeters: 8, depthMeters: 6, heightMeters: 4 },
    objects: [],
    selectedObjectIds: [],
  }
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
  const script = {
    ...stage,
    source: 'script',
    items: [{ ...stage.items[0], libraryAssetId: 'SCN-TABLE-090', evidenceIds: ['p1:0'] }],
    evidence: [
      { id: 'p1:0', page: 1, paragraph: 1, excerpt: '舞台中央摆着圆桌', certainty: 'stated' },
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
  const photo = {
    name: '照片合成测试',
    summary: '按照片比例估算的方台。',
    stage: { width: 8, depth: 6 },
    uncertainties: [],
    objects: [
      {
        id: 'cube',
        name: '方台',
        assetId: 'SCN-CUBE-045',
        position: { x: 0, z: 0 },
        support: { type: 'floor', objectId: null, bottomHeightMeters: null },
        yawDegrees: 0,
        color: null,
        hingeAngles: null,
      },
    ],
  }
  const replies: Record<string, unknown> = {
    stage_plan: stage,
    script_stage_plan: script,
    dia_structured_grounding: grounding,
    rehearsal_possibilities: rehearsal,
    photo_stage_plan: photo,
  }
  type Wire = {
    model: string
    messages: {
      role: string
      content: string | { type: string; text?: string; image_url?: { url: string } }[]
    }[]
    response_format: {
      type: string
      json_schema: { name: string; strict: boolean; schema: unknown }
    }
    enable_thinking: boolean
    stream: boolean
    max_completion_tokens: number
    vl_high_resolution_images?: boolean
  }
  const requests: Wire[] = []
  let forbiddenRequests = 0
  let openAiRequests = 0
  let missingUsage = false
  let reservedCost = 0
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    if (
      process.env.DIASTAGE_AI_PROVIDER === 'openai' &&
      request.url === 'https://api.openai.com/v1/responses'
    ) {
      openAiRequests++
      expect(await request.json()).toMatchObject({ model: 'gpt-5.6-luna', store: false })
      return Response.json({
        id: 'synthetic-response',
        object: 'response',
        created_at: 0,
        model: 'gpt-5.6-luna',
        status: 'completed',
        output: [
          {
            id: 'synthetic-message',
            type: 'message',
            role: 'assistant',
            status: 'completed',
            content: [{ type: 'output_text', text: '{invalid', annotations: [] }],
          },
        ],
        usage: {
          input_tokens: 42,
          output_tokens: 8,
          total_tokens: 50,
          input_tokens_details: { cached_tokens: 0 },
          output_tokens_details: { reasoning_tokens: 0 },
        },
      })
    }
    if (request.url !== 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions') {
      forbiddenRequests++
      throw new Error('Unexpected network is forbidden')
    }
    expect(request.method).toBe('POST')
    const body = (await request.json()) as Wire
    requests.push(body)
    expect(body).toMatchObject({ model: QWEN_TRIAL_MODEL, enable_thinking: false, stream: false })
    expect(body.response_format.type).toBe('json_schema')
    expect(body.response_format.json_schema.strict).toBe(true)
    expect(body.max_completion_tokens).toBeGreaterThan(0)
    expect(body).not.toHaveProperty('tools')
    const { name, strict, schema } = body.response_format.json_schema
    expect(replies).toHaveProperty(name)
    const row = db.query('SELECT cost_units FROM ai_usage WHERE record IS NULL').get() as {
      cost_units: number
    }
    reservedCost = row.cost_units / 100_000_000
    if (name === 'photo_stage_plan') {
      expect(body.vl_high_resolution_images).toBe(true)
      const content = body.messages[1]!.content as {
        type: string
        text?: string
        image_url?: { url: string }
      }[]
      expect(content).toEqual([
        { type: 'text', text: expect.any(String) },
        { type: 'image_url', image_url: { url: imageDataUrl } },
      ])
      const payload =
        body.messages[0]!.content +
        content[0]!.text! +
        JSON.stringify({ type: 'json_schema', name, strict, schema })
      expect(QWEN_IMAGE_INPUT_TOKENS).toBe(16384)
      expect(reservedCost).toBeCloseTo(
        estimateCall('photo-stage-plan', QWEN_TRIAL_MODEL, payload, null),
        8,
      )
      expect(reservedCost).toBeGreaterThan(
        estimateCall('stage-command', QWEN_TRIAL_MODEL, payload, null),
      )
    } else expect(body).not.toHaveProperty('vl_high_resolution_images')
    if (name === 'script_stage_plan') {
      const payload = JSON.parse(body.messages[1]!.content as string)
      expect(payload.note).toBe('圆桌台右留出通道')
      expect(payload.coordinateFrame).toEqual({
        units: 'meters',
        origin: 'proscenium-center-at-floor',
        xPositive: 'performer-right-facing-audience',
        zPositive: 'upstage',
        bounds: { x: [-4, 4], y: [0, 4], z: [0, 6] },
      })
      expect(payload.availableSceneryLibrary).toHaveLength(21)
      expect(
        payload.availableSceneryLibrary.find(
          (item: { libraryAssetId: string }) => item.libraryAssetId === 'SCN-SOFA-175',
        ),
      ).toMatchObject({
        nativeBoundsCenterMeters: [0, 0.425, 0],
        localCollisionBoundsMeters: { x: [-0.875, 0.875], y: [0, 0.85], z: [-0.4, 0.4] },
        groundedPositionY: 0,
      })
      expect(JSON.stringify(schema)).not.toContain('collisionGeometry')
      expect(schema).toMatchObject({
        properties: {
          items: {
            items: {
              properties: {
                libraryAssetId: { enum: expect.arrayContaining(['SCN-TABLE-090']) },
                transform: {
                  properties: {
                    rotationDegrees: {
                      properties: {
                        x: { const: 0 },
                        y: { minimum: -180, maximum: 180 },
                        z: { const: 0 },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      })
    }
    const inputTokens = name === 'photo_stage_plan' ? 19384 : 3000
    return Response.json({
      id: 'synthetic-completion',
      object: 'chat.completion',
      created: 0,
      model: QWEN_TRIAL_MODEL,
      choices: [
        {
          index: 0,
          finish_reason: 'stop',
          message: { role: 'assistant', content: JSON.stringify(replies[name]), refusal: null },
        },
      ],
      ...(missingUsage
        ? {}
        : {
            usage: {
              prompt_tokens: inputTokens,
              completion_tokens: 800,
              total_tokens: inputTokens + 800,
              prompt_tokens_details: { cached_tokens: 1000 },
            },
          }),
    })
  }) as unknown as typeof fetch
  const signal = () => new AbortController().signal
  const run = <T>(operation: () => Promise<T>, userId = 'structured-test-user') =>
    aiRequestContext.run({ requestId: crypto.randomUUID(), userId, approvedCny: 0 }, operation)
  const generate = (abortSignal = signal()) =>
    generateStagePlan(
      {
        source: 'typed-command',
        input: 'PRIVATE_SYNTHETIC_STAGE_INPUT',
        sceneContext,
        priorAnswers: [],
      },
      abortSignal,
    )
  const requestRehearsal = () =>
    requestRehearsalOutput(
      {
        sceneId: 'test-scene',
        productionId: 'test-production',
        script: '合成选段',
        intention: '比较站位',
        directorIntention: '',
        selectedPerformerId: 'a',
        venue: {
          id: 'test-stage',
          name: '测试台',
          type: 'black-box',
          width: 8,
          depth: 6,
          height: 4,
          origin: [0, 0, 0],
        },
        performers: [
          { id: 'a', name: '甲', color: '#333333', position: [0, 0, 0], facing: 0, visible: true },
        ],
        paths: [],
        durationSeconds: 30,
        obstacles: [],
        activeDimensions: ACTIVE_DIMENSIONS,
      },
      signal(),
    )

  beforeEach(() => {
    db.exec('DELETE FROM ai_usage')
    requests.length = 0
    missingUsage = false
    openAiRequests = 0
    replies.script_stage_plan = script
    process.env.DIASTAGE_AI_PROVIDER = 'aliyun'
    process.env.DIASTAGE_USD_CNY_REFERENCE = 'not-used-for-CNY-models'
    process.env.DASHSCOPE_API_KEY = 'synthetic-offline-key'
    delete process.env.OPENAI_API_KEY
  })
  afterAll(async () => {
    globalThis.fetch = originalFetch
    db.close()
    await ledger.close()
    expect(dirname(resolve(directory))).toBe(resolve(tmpdir()))
    expect(basename(directory)).toStartWith('diastage-structured-offline-')
    rmSync(directory, { recursive: true, force: true })
    expect(forbiddenRequests).toBe(0)
    mock.restore()
  })

  test('five production callers use fixed Chat schemas, image reservation and real SQLite settlement', async () => {
    expect(await run(() => generate())).toEqual(stage)
    const semantic = await run(() =>
      groundOpenLanguageWithModel(
        {
          rawUtterance: '开放一点',
          context: {
            sceneVersion: 'v1',
            objects: [],
            selectedObjectIds: [],
            lastReferencedIds: [],
            proposal: null,
            app: {
              page: 'stage-editor',
              route: '/scene/test',
              capabilities: [],
              settings: {
                viewMode: '3d',
                activePanel: 'items',
                workspaceMode: 'edit',
                transformMode: 'select',
                rotationAxis: 'y',
                cameraLocked: false,
                placementMode: 'grid',
                gridStepCentimeters: 10,
                gridVisible: true,
                guidesVisible: true,
                displayMode: 'white_model',
                stableMode: true,
                immersiveMode: 'none',
                readOnly: false,
              },
            },
          },
        },
        signal(),
      ),
    )
    expect(semantic).toMatchObject({
      provider: 'aliyun',
      model: QWEN_TRIAL_MODEL,
      grounding: grounding.grounding,
    })
    const performed = await run(requestRehearsal)
    expect(performed).toMatchObject({
      modelVersion: QWEN_TRIAL_MODEL,
      status: 'completed',
      rawStructuredOutput: rehearsal,
    })
    expect(
      (await run(() => analyzePhotoStage({ imageDataUrl, note: '保留方台' }, signal()))).objects[0]
        ?.assetId,
    ).toBe('SCN-CUBE-045')
    const planned = await run(() =>
      planFromPassages([{ id: 'p1', page: 1, paragraph: 1, text: '舞台中央摆着圆桌' }], signal(), {
        sceneContext,
        note: '圆桌台右留出通道',
      }),
    )
    expect(planned.source).toBe('script')
    expect(planned.evidence[0]?.excerpt).toBe('舞台中央摆着圆桌')
    expect(requests.map((request) => request.response_format.json_schema.name)).toEqual([
      'stage_plan',
      'dia_structured_grounding',
      'rehearsal_possibilities',
      'photo_stage_plan',
      'script_stage_plan',
    ])
    const rows = db.query('SELECT user_id, cost_units, record FROM ai_usage').all() as {
      user_id: string
      cost_units: number
      record: string
    }[]
    expect(rows).toHaveLength(5)
    for (const row of rows) {
      expect(row.user_id).toBe('structured-test-user')
      expect(JSON.parse(row.record)).toMatchObject({
        model: QWEN_TRIAL_MODEL,
        status: 'succeeded',
        cachedInputTokens: 1000,
        cacheWriteTokens: 0,
      })
      expect(row.record).not.toContain('PRIVATE_SYNTHETIC')
    }
    expect((await ledger.summary()).costCny).toBeCloseTo(
      4 * estimateTextCostCny(QWEN_TRIAL_MODEL, 3000, 1000, 800) +
        estimateTextCostCny(QWEN_TRIAL_MODEL, 19384, 1000, 800),
      8,
    )
  })

  test('uninvited, unconfigured and pre-cancelled calls make no SDK request or charge', async () => {
    await expect(run(() => generate(), 'stranger')).rejects.toMatchObject({
      code: 'AI_INVITE_REQUIRED',
    })
    delete process.env.DASHSCOPE_API_KEY
    await expect(run(() => generate())).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      status: 503,
    })
    process.env.DASHSCOPE_API_KEY = 'synthetic-offline-key'
    await expect(run(() => generate(AbortSignal.abort()))).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(requests).toHaveLength(0)
    expect((await ledger.summary()).calls).toBe(0)
  })

  test('script production responses use local native geometry despite rounded dimensions and renamed labels', async () => {
    const response = structuredClone(script)
    response.items[0]!.displayName = '圆桌（中间）'
    response.items[0]!.kind = 'table'
    response.items[0]!.dimensionsMeters.width = 0.9001
    replies.script_stage_plan = response
    const before = structuredClone(sceneContext)
    const plan = await run(() =>
      planFromPassages([{ id: 'p1', page: 1, paragraph: 1, text: '舞台中央摆着圆桌' }], signal(), {
        sceneContext,
        note: '圆桌台右留出通道',
      }),
    )
    expect(requests).toHaveLength(1)
    expect(plan.items[0]).toMatchObject({
      displayName: '圆桌',
      kind: 'round-table',
      dimensionsMeters: { width: 0.9, height: 0.75, depth: 0.9 },
      collisionGeometry: expect.any(Array),
    })
    expect(plan.assumptions.some(({ message }) => message.includes('不代表剧本中的实测尺寸'))).toBe(
      true,
    )
    expect(sceneContext).toEqual(before)
  })

  test('script production rejects a side-flipped model response instead of clamping the rotation', async () => {
    const response = structuredClone(script)
    response.items[0]!.transform.rotationDegrees.z = 90
    replies.script_stage_plan = response
    const before = structuredClone(sceneContext)
    await expect(
      run(() =>
        planFromPassages(
          [{ id: 'p1', page: 1, paragraph: 1, text: '舞台中央摆着圆桌' }],
          signal(),
          {
            sceneContext,
            note: '圆桌台右留出通道',
          },
        ),
      ),
    ).rejects.toThrow('invalid structured output')
    expect(requests).toHaveLength(1)
    expect(sceneContext).toEqual(before)
  })

  test('missing usage fails closed and retains the reserved cost without logging input', async () => {
    missingUsage = true
    await expect(run(() => generate())).rejects.toThrow('invalid token usage')
    expect(requests).toHaveLength(1)
    const row = db.query('SELECT cost_units, record FROM ai_usage').get() as {
      cost_units: number
      record: string
    }
    expect(row.cost_units / 100_000_000).toBe(reservedCost)
    expect(JSON.parse(row.record)).toMatchObject({
      model: QWEN_TRIAL_MODEL,
      status: 'failed',
      inputTokens: null,
    })
    expect(row.record).not.toContain('PRIVATE_SYNTHETIC')
  })

  test('legacy OpenAI rehearsal retains malformed JSON for private evaluation instead of strict parsing', async () => {
    process.env.DIASTAGE_AI_PROVIDER = 'openai'
    process.env.OPENAI_API_KEY = 'synthetic-openai-key'
    process.env.DIASTAGE_USD_CNY_REFERENCE = '7'
    const result = await aiRequestContext.run(
      {
        requestId: crypto.randomUUID(),
        userId: 'structured-test-user',
        approvedCny: 1,
      },
      requestRehearsal,
    )
    expect(result).toMatchObject({
      modelVersion: 'gpt-5.6-luna',
      status: 'completed',
      rawStructuredOutput: '{invalid',
    })
    expect(openAiRequests).toBe(1)
    expect(requests).toHaveLength(0)
    expect((await ledger.summary()).calls).toBe(1)
  })
}
