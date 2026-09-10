import { expect, test } from 'bun:test'
import { type SceneContextSummary, type StagePlan, StagePlanSchema } from '@pascal-app/core/stage'
import { zodTextFormat } from 'openai/helpers/zod'
import { AiError } from './api'
import { type ModelPlanner, type PlanRequest, planStageRequest } from './stage-planner'

const context: SceneContextSummary = {
  documentVersion: 7,
  venue: { type: 'proscenium', widthMeters: 8, depthMeters: 6, heightMeters: 4 },
  objects: [],
  selectedObjectIds: [],
}
const request: PlanRequest = {
  source: 'typed-command',
  input: '我希望在台后放一张尺寸为一米见方的桌子',
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
      existingNodeId: null,
      kind: 'table',
      displayName: '桌子',
      libraryAssetId: null,
      dimensionsMeters: { width: 1, height: 0.75, depth: 1 },
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
  const plan = await planStageRequest({ ...request, input: '添加桌子' }, signal(), neverCall)
  expect(plan.items[0]?.kind).toBe('table')
  expect(plan.items[0]?.transform.position.z).toBe(3)
  const unclear = await planStageRequest({ ...request, input: '门在窗旁边' }, signal(), neverCall)
  expect(unclear.questions.length).toBeGreaterThan(0)
  const forbidden = await planStageRequest(
    { ...request, input: '添加舞台灯光' },
    signal(),
    neverCall,
  )
  expect(forbidden.items).toEqual([])
  expect(forbidden.questions[0]?.id).toBe('unsupported-domain')
})

test('SDK strict schema rejects unknown fields and is serializable', () => {
  const format = zodTextFormat(StagePlanSchema, 'stage_plan')
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
  collision.items.push({ ...structuredClone(collision.items[0]!), proposalId: 'other' })
  expect(
    (await planStageRequest(request, signal(), async () => collision)).warnings.some(
      (warning) => warning.code === 'collision',
    ),
  ).toBe(true)
  const reference = sample()
  reference.items[0]!.existingNodeId = 'missing'
  expect(
    (await planStageRequest(request, signal(), async () => reference)).warnings.some(
      (warning) => warning.code === 'missing-reference',
    ),
  ).toBe(true)
  expect(context.objects).toEqual([])
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
