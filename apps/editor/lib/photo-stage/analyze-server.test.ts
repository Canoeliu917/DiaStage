import { afterEach, expect, test } from 'bun:test'
import OpenAI from 'openai'
import { handleAiRequest } from '../ai/api'
import { AVAILABLE_STAGE_SCENERY } from '../stage/prop-assets'
import { SCENERY_ASSEMBLY_RULES } from '../stage/scenery-assembly-rules'
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
        assetId: 'SCN-CUBE-045',
        position: { x: 1, z: 1 },
        support: { type: 'floor', objectId: null, bottomHeightMeters: null },
        yawDegrees: 0,
        color: null,
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

test('passes the uploaded image to vision with 21 selectable assets and strict structured output', async () => {
  const signal = new AbortController().signal
  const plan = await analyzePhotoStage(
    { imageDataUrl, name: '此次照片', note: '  台右保留一米通道。\n ' },
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
      expect(context.note).toBe('台右保留一米通道。')
      expect(context.availableSceneryLibrary).toHaveLength(21)
      expect(JSON.stringify(context.availableSceneryLibrary)).not.toContain('unknown-stage-asset')
      expect(JSON.stringify(input.text.format)).not.toContain('unknown-stage-asset')
      expect(
        context.availableSceneryLibrary.map((asset: { assetId: string }) => asset.assetId),
      ).toEqual(AVAILABLE_STAGE_SCENERY.map(({ asset }) => asset.id))
      for (const asset of context.availableSceneryLibrary) expect(asset.dimensions).toHaveLength(3)
      expect(input.instructions).toContain('原点在舞台地面中心')
      expect(input.instructions).toContain('Z 正向为台前和观众方向')
      expect(input.instructions).toContain('X 正向为观众看照片的画面右侧')
      expect(input.instructions).toContain('保留目录标准尺寸与原生比例')
      expect(input.instructions).toContain('不把圆桌拉成椭圆')
      expect(input.instructions).toContain('桌子落地不是桌高的一半')
      expect(input.instructions).toContain('yawDegrees仅表示绕世界竖直Y轴')
      expect(input.instructions).toContain('台后半区 -stage.depth/2<z<0')
      expect(input.instructions).toContain('台前半区 0<z<stage.depth/2')
      expect(input.instructions).toContain('每个模块独立输出')
      expect(input.instructions).toContain('组合台面中引用其下方确有接触的模块')
      expect(input.instructions).toContain('不可信')
      expect(input.instructions).toContain('不是照片可见性或实测尺寸的证据')
      expect(input.instructions).toContain(SCENERY_ASSEMBLY_RULES)
      expect(input.text.format.strict).toBe(true)
      expect(JSON.stringify(input.text.format)).not.toContain('prefixItems')
      return modelPlan()
    },
  )
  expect(plan.objects).toHaveLength(1)
  expect(plan.objects[0]!.assetId).toBe('SCN-CUBE-045')
  expect(plan.objects[0]).not.toHaveProperty('color')
  expect(plan.uncertainties).toContain('场地为估算，请核对尺寸与摆位。')
  expect(plan.objects[0]!.kind).toBe('neutral-block')
  expect(plan.objects[0]!.dimensions).toEqual({ width: 0.45, height: 0.45, depth: 0.45 })
  expect(plan.objects[0]!.position).toEqual([1, 0, 1])
  expect(plan.objects[0]).not.toHaveProperty('support')
  expect(plan.objects[0]).not.toHaveProperty('yawDegrees')
})

for (const fixture of [
  {
    name: 'positive: a rear window stays behind the centred origin',
    patch: { assetId: 'SCN-WIN-130', position: { x: -1, z: -2 }, yawDegrees: 0 },
    position: [-1, 0, -2],
    yaw: 0,
  },
  {
    name: 'positive: a front chair turns around Y instead of rolling sideways',
    patch: { assetId: 'SCN-CHAIR-045', position: { x: 1, z: 2 }, yawDegrees: 90 },
    position: [1, 0, 2],
    yaw: Math.PI / 2,
  },
  {
    name: 'contrast: a legacy Euler roll is not a new model heading',
    patch: { rotation: [0, 0, Math.PI / 2] },
    error: '格式无效',
  },
  {
    name: 'contrast: stage-front-origin coordinates do not fit the centred stage',
    patch: { position: { x: 0, z: 4.5 } },
    error: '不可用',
  },
  {
    name: 'paraphrase: turning toward image-left preserves position and native size',
    patch: { position: { x: 0.5, z: -1 }, yawDegrees: -90 },
    position: [0.5, 0, -1],
    yaw: -Math.PI / 2,
  },
  {
    name: 'ambiguous: hidden support requires clarification instead of a second request',
    patch: { support: { type: 'uncertain', objectId: null, bottomHeightMeters: null } },
    error: '不确定',
  },
])
  test(`photo placement semantics: ${fixture.name}`, async () => {
    const source = {
      ...modelPlan(),
      objects: [{ ...modelPlan().objects[0]!, ...fixture.patch }],
    }
    const before = JSON.stringify(source)
    let calls = 0
    const result = analyzePhotoStage({ imageDataUrl }, new AbortController().signal, async () => {
      calls++
      return source
    })
    if (typeof fixture.error === 'string') {
      await expect(result).rejects.toMatchObject({
        code: 'PLAN_INVALID',
        status: 422,
        message: expect.stringContaining(fixture.error),
      })
    } else {
      const plan = await result
      expect(plan.objects[0]!.position).toEqual(fixture.position)
      expect(plan.objects[0]!.rotation).toEqual([0, fixture.yaw, 0])
      const { compilePhotoStagePlan } = await import('./compile')
      const item = Object.values(compilePhotoStagePlan(plan).nodes).find(
        (node) => node.type === 'item',
      )!
      expect(item.scale).toEqual([1, 1, 1])
      expect(item.rotation).toEqual([0, fixture.yaw, 0])
    }
    expect(calls).toBe(1)
    expect(JSON.stringify(source)).toBe(before)
  })

test('photo replacements keep all 21 native assets at standard dimensions through compilation', async () => {
  const { compilePhotoStagePlan } = await import('./compile')
  const source = {
    ...modelPlan(),
    stage: { width: 30, depth: 30 },
    objects: AVAILABLE_STAGE_SCENERY.map(({ asset }, index) => ({
      ...modelPlan().objects[0]!,
      id: `prop-${index}`,
      name: asset.id === 'SCN-DESK-120' ? '钢琴（替身：三屉桌）' : asset.name,
      assetId: asset.id,
      position: { x: (index % 6) * 3 - 8, z: Math.floor(index / 6) * 3 - 5 },
    })),
  }
  const before = JSON.stringify(source)
  const plan = await analyzePhotoStage(
    { imageDataUrl },
    new AbortController().signal,
    async () => source,
  )
  const graph = compilePhotoStagePlan(plan)
  const items = Object.values(graph.nodes).filter((node) => node.type === 'item')
  expect(items).toHaveLength(21)
  for (const { kind, asset } of AVAILABLE_STAGE_SCENERY) {
    const object = plan.objects.find((entry) => entry.assetId === asset.id)!
    expect(object.kind).toBe(kind)
    expect(object.dimensions).toEqual({
      width: asset.dimensions![0],
      height: asset.dimensions![1],
      depth: asset.dimensions![2],
    })
    expect(items.find((node) => node.asset.id === asset.id)!.scale).toEqual([1, 1, 1])
  }
  expect(JSON.stringify(source)).toBe(before)
})

test('places a table on its declared riser without converting the riser height to a centre height', async () => {
  const source = {
    ...modelPlan(),
    objects: [
      {
        ...modelPlan().objects[0]!,
        id: 'table',
        name: '圆桌',
        assetId: 'SCN-TABLE-090',
        position: { x: 0, z: 0 },
        support: { type: 'object', objectId: 'riser', bottomHeightMeters: null },
      },
      {
        ...modelPlan().objects[0]!,
        id: 'riser',
        name: '台块',
        assetId: 'SCN-RISER-01',
        position: { x: 0, z: 0 },
      },
    ],
  }
  const plan = await analyzePhotoStage(
    { imageDataUrl },
    new AbortController().signal,
    async () => source,
  )
  expect(plan.objects[1]!.position[1]).toBe(0)
  expect(plan.objects[0]!.position[1]).toBeCloseTo(plan.objects[1]!.dimensions.height, 8)
})

test('separate standard riser modules meet at edges and support only their named furniture', async () => {
  const source = {
    ...modelPlan(),
    objects: [-0.9, 0.9].flatMap((x, i) => [
      {
        ...modelPlan().objects[0]!,
        id: `riser-${i}`,
        assetId: 'SCN-RISER-01',
        position: { x, z: 0 },
      },
      {
        ...modelPlan().objects[0]!,
        id: `sofa-${i}`,
        assetId: 'SCN-SOFA-090',
        position: { x, z: 0 },
        support: { type: 'object', objectId: `riser-${i}`, bottomHeightMeters: null },
      },
    ]),
  }
  const before = JSON.stringify(source)
  const plan = await analyzePhotoStage(
    { imageDataUrl },
    new AbortController().signal,
    async () => source,
  )
  expect(plan.objects).toHaveLength(4)
  for (const i of [0, 2]) {
    expect(plan.objects[i]!.position).toEqual([source.objects[i]!.position.x, 0, 0])
    expect(plan.objects[i + 1]!.position[1]).toBeCloseTo(plan.objects[i]!.dimensions.height, 8)
  }
  expect(JSON.stringify(source)).toBe(before)
})

test('analysis rejects legal-schema geometry that overruns the stage or overlaps, without retry or mutation', async () => {
  const cube = { ...modelPlan().objects[0]!, position: { x: 0, z: 0 } }
  for (const objects of [
    [{ ...cube, position: { x: 3.9, z: 0 } }],
    [cube, { ...cube, id: 'overlap', position: { x: 0.2, z: 0 } }],
  ]) {
    const source = { ...modelPlan(), objects }
    const before = JSON.stringify(source)
    let calls = 0
    await expect(
      analyzePhotoStage({ imageDataUrl }, new AbortController().signal, async () => {
        calls++
        return source
      }),
    ).rejects.toMatchObject({ code: 'PLAN_INVALID', status: 422, retryable: true })
    expect(calls).toBe(1)
    expect(JSON.stringify(source)).toBe(before)
  }
})

test('uncertain support stops a photo proposal without another paid request', async () => {
  let calls = 0
  await expect(
    analyzePhotoStage({ imageDataUrl }, new AbortController().signal, async () => {
      calls++
      return {
        ...modelPlan(),
        objects: [
          {
            ...modelPlan().objects[0]!,
            support: { type: 'uncertain', objectId: null, bottomHeightMeters: null },
          },
        ],
      }
    }),
  ).rejects.toMatchObject({
    code: 'PLAN_INVALID',
    status: 422,
    message: expect.stringContaining('不确定'),
  })
  expect(calls).toBe(1)
})

test('notes are optional, omit whitespace and accept the trimmed 2000-character boundary', async () => {
  for (const note of [undefined, ' \n ', `  ${'注'.repeat(2000)}  `]) {
    await analyzePhotoStage({ imageDataUrl, note }, new AbortController().signal, async (input) => {
      const context = JSON.parse(input.input[0]!.content[0]!.text!)
      if (note?.trim()) expect(context.note).toBe(note.trim())
      else expect(context).not.toHaveProperty('note')
      return modelPlan()
    })
  }
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
    { imageDataUrl, note: '注'.repeat(2001) },
    { imageDataUrl, note: 123 },
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
    {
      ...modelPlan(),
      objects: [{ ...modelPlan().objects[0], assetId: 'unknown-stage-asset', kind: 'scenic-flat' }],
    },
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

test('provider details remain private through the shared API error handler', async () => {
  const response = await handleAiRequest(
    request({ imageDataUrl }),
    async ({ signal }) => ({
      plan: await analyzePhotoStage({ imageDataUrl }, signal, async () => {
        throw new Error('private provider body / secret-key')
      }),
    }),
    { skipSceneAuth: true },
  )
  expect(response.status).toBe(500)
  expect(JSON.stringify(await response.json())).not.toContain('secret-key')
})

test('connection failures and timeouts return an actionable 503 without provider details', async () => {
  for (const error of [
    new OpenAI.APIConnectionError({ message: 'secret-key: connection refused' }),
    new OpenAI.APIConnectionTimeoutError({ message: 'secret-key: timeout' }),
  ]) {
    const response = await handleAiRequest(
      request({ imageDataUrl }),
      async ({ signal }) => ({
        plan: await analyzePhotoStage({ imageDataUrl }, signal, async () => {
          throw error
        }),
      }),
      { skipSceneAuth: true },
    )
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
