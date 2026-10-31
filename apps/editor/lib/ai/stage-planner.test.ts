import { expect, test } from 'bun:test'
import { type SceneContextSummary, type StagePlan, StagePlanSchema } from '@pascal-app/core/stage'
import { zodTextFormat } from 'openai/helpers/zod'
import { AiError } from './api'
import { StageModelPlanSchema } from './stage-model-schema'
import { type ModelPlanner, type PlanRequest, planStageRequest } from './stage-planner'

const context: SceneContextSummary = {
  documentVersion: 7,
  venue: { type: 'proscenium', widthMeters: 8, depthMeters: 6, heightMeters: 4 },
  objects: [
    {
      id: 'existing-table',
      name: '圆桌',
      kind: 'round-table',
      dimensionsMeters: { width: 0.9, height: 0.75, depth: 0.9 },
      transform: { position: { x: 0, y: 0, z: 3 }, rotationDegrees: { x: 0, y: 0, z: 0 } },
    },
    {
      id: 'second-table',
      name: '第二张圆桌',
      kind: 'round-table',
      dimensionsMeters: { width: 0.9, height: 0.75, depth: 0.9 },
      transform: { position: { x: 2, y: 0, z: 3 }, rotationDegrees: { x: 0, y: 0, z: 0 } },
    },
  ],
  selectedObjectIds: [],
}
const request: PlanRequest = {
  source: 'typed-command',
  input: '请将当前圆桌移到靠后台的合适位置',
  sceneContext: context,
  priorAnswers: [],
}
const signal = () => new AbortController().signal
const sample = (): StagePlan => ({
  schemaVersion: 1,
  source: 'typed-command',
  venue: null,
  items: [
    {
      proposalId: 'table-1',
      existingNodeId: 'existing-table',
      kind: 'round-table',
      displayName: '圆桌',
      libraryAssetId: null,
      dimensionsMeters: { width: 0.9, height: 0.75, depth: 0.9 },
      transform: { position: { x: 0, y: 0, z: 4 }, rotationDegrees: { x: 0, y: 0, z: 0 } },
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
})

test('simple commands, clarification, and unsupported domains stay offline', async () => {
  const neverCall: ModelPlanner = async () => {
    throw new Error('model must not be called')
  }
  const plan = await planStageRequest(
    { ...request, input: '圆桌往台前移动30厘米' },
    signal(),
    neverCall,
  )
  expect(plan.items[0]?.kind).toBe('round-table')
  expect(plan.items[0]?.transform.position.z).toBe(2.7)
  const ambiguous = await planStageRequest({ ...request, input: '添加桌子' }, signal(), neverCall)
  expect(ambiguous.items).toEqual([])
  expect(ambiguous.questions.length).toBeGreaterThan(0)
  const added = await planStageRequest({ ...request, input: '添加圆桌' }, signal(), neverCall)
  expect(added.items).toHaveLength(1)
  expect(added.items[0]).toMatchObject({
    libraryAssetId: 'SCN-TABLE-090',
    dimensionsMeters: { width: 0.9, height: 0.75, depth: 0.9 },
  })
  expect(added.questions).toEqual([])
  const unclear = await planStageRequest({ ...request, input: '门在窗旁边' }, signal(), neverCall)
  expect(unclear.questions.length).toBeGreaterThan(0)
  const forbidden = await planStageRequest(
    { ...request, input: '添加舞台灯光' },
    signal(),
    neverCall,
  )
  expect(forbidden.items).toEqual([])
  expect(forbidden.questions[0]?.message).toContain('暂未开放灯光')
})

test('production mode sends recognized commands, view requests, and unknown inputs to the model', async () => {
  const inputs = ['添加圆桌', '圆桌往台前移动30厘米', '添加桌子', '从观众席看', '添加舞台灯光']
  const received: PlanRequest[] = []
  const model: ModelPlanner = async (input) => {
    received.push(input)
    return {
      ...sample(),
      items: [],
      questions: [{ id: 'model-question', message: `模型答复：${input.input}`, options: [] }],
    }
  }
  const priorAnswers = [{ questionId: 'side', answer: '观众右侧' }]
  for (const input of inputs) {
    const result = await planStageRequest({ ...request, input, priorAnswers }, signal(), model, {
      forceModel: true,
    })
    expect(result.items).toEqual([])
    expect(result.questions).toEqual([
      { id: 'model-question', message: `模型答复：${input}`, options: [] },
    ])
  }
  expect(received).toEqual(inputs.map((input) => ({ ...request, input, priorAnswers })))
  expect(context.objects[0]!.transform.position).toEqual({ x: 0, y: 0, z: 3 })
})

test('production mode does not replace model failures with local command results', async () => {
  let calls = 0
  const providerError = new Error('provider unavailable')
  await expect(
    planStageRequest(
      { ...request, input: '添加圆桌' },
      signal(),
      async () => {
        calls++
        throw providerError
      },
      { forceModel: true },
    ),
  ).rejects.toBe(providerError)
  expect(calls).toBe(1)
})

test('SDK strict schema rejects unknown fields and is serializable', () => {
  const format = zodTextFormat(StageModelPlanSchema, 'stage_plan')
  expect(format.strict).toBe(true)
  expect(format.schema.additionalProperties).toBe(false)
  expect(() => JSON.stringify(format.schema)).not.toThrow()
  expect(() => StagePlanSchema.parse({ ...sample(), execute: 'eval()' })).toThrow()
})

test('rejects invalid input and full graph before calling a model', async () => {
  let calls = 0
  const model: ModelPlanner = async () => {
    calls++
    return sample()
  }
  for (const invalid of [
    { ...request, input: 'x'.repeat(10_001) },
    { ...request, sceneGraph: {} },
    { ...request, sceneContext: { ...context, nodes: {} } },
    { ...request, priorAnswers: [{ questionId: 'q', answer: '台右', execute: 'code' }] },
    { ...request, source: 'script' },
  ]) {
    await expect(planStageRequest(invalid, signal(), model)).rejects.toBeInstanceOf(AiError)
  }
  expect(calls).toBe(0)
})

test('schema failure retries once; provider failure never retries', async () => {
  let calls = 0
  const model: ModelPlanner = async () => (++calls === 1 ? { ...sample(), extra: true } : sample())
  expect((await planStageRequest(request, signal(), model)).items).toHaveLength(1)
  expect(calls).toBe(2)
  calls = 0
  await expect(
    planStageRequest(request, signal(), async () => {
      calls++
      return {}
    }),
  ).rejects.toMatchObject({ code: 'PLAN_INVALID' })
  expect(calls).toBe(2)
  calls = 0
  const providerError = new Error('network unavailable')
  await expect(
    planStageRequest(request, signal(), async () => {
      calls++
      throw providerError
    }),
  ).rejects.toBe(providerError)
  expect(calls).toBe(1)
})

test('malformed SDK structured output retries once, source or asset injection is rejected', async () => {
  let calls = 0
  const plan = await planStageRequest(request, signal(), async () => {
    if (++calls === 1) throw new SyntaxError('invalid JSON')
    return sample()
  })
  expect(plan.items).toHaveLength(1)
  expect(calls).toBe(2)
  for (const mutate of [
    (plan: StagePlan) => {
      plan.source = 'script'
    },
    (plan: StagePlan) => {
      plan.items[0]!.libraryAssetId = 'https://untrusted/model.glb'
    },
  ]) {
    const output = sample()
    mutate(output)
    await expect(planStageRequest(request, signal(), async () => output)).rejects.toMatchObject({
      code: 'PLAN_INVALID',
    })
  }
})

test('model plans receive deterministic relation, bounds, collision, and reference validation', async () => {
  const output = sample()
  output.items[0]!.transform.position.x = 50
  output.questions.push({ id: 'which', message: '要保留哪个台位？', options: [] })
  const plan = await planStageRequest(request, signal(), async () => output)
  expect(plan.questions).toHaveLength(1)
  expect(
    plan.warnings.some((warning) => warning.code === 'out-of-bounds' && warning.blocking),
  ).toBe(true)
  const collision = sample()
  collision.items.push({
    ...structuredClone(collision.items[0]!),
    proposalId: 'other',
    existingNodeId: 'second-table',
  })
  expect(
    (await planStageRequest(request, signal(), async () => collision)).warnings.some(
      (warning) => warning.code === 'collision',
    ),
  ).toBe(true)
  const reference = sample()
  reference.items[0]!.existingNodeId = 'missing'
  await expect(planStageRequest(request, signal(), async () => reference)).rejects.toMatchObject({
    code: 'PLAN_INVALID',
  })
  expect(context.objects[0]!.transform.position).toEqual({ x: 0, y: 0, z: 3 })
})

test('model revisions preserve existing identity and native size instead of scaling or replacing', async () => {
  for (const change of [
    (item: StagePlan['items'][number]) => {
      item.dimensionsMeters.width *= 2
    },
    (item: StagePlan['items'][number]) => {
      item.kind = 'chair'
    },
    (item: StagePlan['items'][number]) => {
      item.stepCount = 2
    },
    (item: StagePlan['items'][number]) => {
      item.libraryAssetId = 'SCN-CHAIR-045'
    },
  ]) {
    const output = sample()
    change(output.items[0]!)
    await expect(
      planStageRequest(request, signal(), async () => output, { forceModel: true }),
    ).rejects.toMatchObject({ code: 'PLAN_INVALID' })
  }
})

test('a valid model move keeps current collision geometry and permits rotation', async () => {
  const collisionGeometry = [
    {
      vertices: [
        [-0.45, 0, -0.45],
        [0.45, 0, -0.45],
        [0.45, 0, 0.45],
        [-0.45, 0, 0.45],
        [-0.45, 0.75, -0.45],
        [0.45, 0.75, -0.45],
        [0.45, 0.75, 0.45],
        [-0.45, 0.75, 0.45],
      ] as [number, number, number][],
      faces: [
        [0, 3, 2, 1],
        [4, 5, 6, 7],
        [0, 1, 5, 4],
        [1, 2, 6, 5],
        [2, 3, 7, 6],
        [3, 0, 4, 7],
      ],
    },
  ]
  const current = structuredClone(context)
  current.objects[0]!.collisionGeometry = collisionGeometry
  const output = sample()
  output.items[0]!.transform.rotationDegrees.y = 45
  const result = await planStageRequest(
    { ...request, sceneContext: current },
    signal(),
    async () => output,
    { forceModel: true },
  )
  expect(result.items[0]).toMatchObject({
    existingNodeId: 'existing-table',
    dimensionsMeters: current.objects[0]!.dimensionsMeters,
    collisionGeometry,
    transform: {
      position: { x: 0, y: 0, z: 4 },
      rotationDegrees: { x: 0, y: 45, z: 0 },
    },
  })
  expect(current.objects[0]!.transform.position).toEqual({ x: 0, y: 0, z: 3 })
})

test('cancelled model output never returns a usable plan', async () => {
  const controller = new AbortController()
  await expect(
    planStageRequest(request, controller.signal, async (_request, modelSignal) => {
      expect(modelSignal).toBe(controller.signal)
      controller.abort()
      return sample()
    }),
  ).rejects.toMatchObject({ name: 'AbortError' })
})
