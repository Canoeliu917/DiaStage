import { expect, test } from 'bun:test'
import {
  compileStagePlan,
  parseStageText,
  type SceneContextSummary,
  StagePlanSchema,
} from '@pascal-app/core/stage'
import { buildRelevantSceneContext } from '../stage/relevant-context'
import { AI_TOKEN_LIMITS, THEATRE_TRANSCRIPTION_PROMPT } from './config'
import { aiRequestContext, readAiUsage, recordAiUsage, trackAiCall } from './usage'

const context: SceneContextSummary = {
  documentVersion: 1,
  venue: { type: 'proscenium', widthMeters: 1000, depthMeters: 1000, heightMeters: 4 },
  selectedObjectIds: ['object-999'],
  objects: Array.from({ length: 1000 }, (_, n) => ({
    id: `object-${n}`,
    name: `景片[${n}]`,
    kind: 'scenic-flat',
    dimensionsMeters: { width: 1, height: 2, depth: 0.1 },
    transform: {
      position: { x: (n % 30) * 5 - 100, y: 0, z: Math.floor(n / 30) * 5 + 2 },
      rotationDegrees: { x: 0, y: 0, z: 0 },
    },
  })),
}

test('context is deterministic, selected/name/doors first, remaining objects are index only', () => {
  const input = structuredClone(context)
  input.objects[0]!.kind = 'door-flat'
  const result = buildRelevantSceneContext(input, '移动景片[900]')
  expect(result.objects[0]!.id).toBe('object-999')
  expect(result.objects[1]!.id).toBe('object-900')
  expect(result.objects[2]!.id).toBe('object-0')
  expect(result.objects.length).toBeLessThanOrEqual(100)
  expect(result.objectIndex.length + result.objects.length).toBe(1000)
  expect(
    result.objectIndex.every((object) => Object.keys(object).sort().join() === 'id,kind,name'),
  ).toBe(true)
  expect(result).toEqual(
    buildRelevantSceneContext({ ...input, objects: [...input.objects].reverse() }, '移动景片[900]'),
  )
  expect(input.objects).toHaveLength(1000)
})

test('mandatory context overflow asks to narrow rather than silently discard selection', () => {
  expect(() =>
    buildRelevantSceneContext(
      {
        ...context,
        selectedObjectIds: context.objects.slice(0, 101).map((object) => object.id),
      },
      '移动它们',
    ),
  ).toThrow('缩小')
})

test('configured output budgets and theatre transcription vocabulary', () => {
  expect(AI_TOKEN_LIMITS.commandOutput).toBeLessThanOrEqual(8000)
  expect(AI_TOKEN_LIMITS.scriptChunkOutput).toBeLessThanOrEqual(12000)
  expect(AI_TOKEN_LIMITS.scriptChunkOutput).toBeGreaterThanOrEqual(8000)
  for (const word of [
    '台口',
    '台左',
    '台右',
    '上场口',
    '下场口',
    '门景片',
    '窗景片',
    '复台',
    '厘米',
  ])
    expect(THEATRE_TRANSCRIPTION_PROMPT).toContain(word)
})

test('usage uses provider counts, correlates requests, and never preserves arbitrary source fields', async () => {
  const requestId = crypto.randomUUID()
  await aiRequestContext.run({ requestId }, () =>
    trackAiCall(
      'stage-command',
      'gpt-5.6-luna',
      new AbortController().signal,
      async () => ({
        input_tokens: 42,
        output_tokens: 8,
        input_tokens_details: { cached_tokens: 12 },
      }),
      (usage) => usage,
    ),
  )
  const entry = readAiUsage().find((record) => record.requestId === requestId)!
  expect(entry.inputTokens).toBe(42)
  expect(entry.cachedInputTokens).toBe(12)
  recordAiUsage({
    ...entry,
    ...{ transcript: 'PRIVATE TEXT', prompt: 'PRIVATE SCRIPT', audio: [1, 2] },
  })
  expect(JSON.stringify(readAiUsage())).not.toContain('PRIVATE')
  const controller = new AbortController()
  controller.abort()
  await expect(
    trackAiCall(
      'stage-command',
      'local-parser',
      controller.signal,
      async () => 1,
      () => null,
    ),
  ).rejects.toThrow()
  expect(readAiUsage().at(-1)?.status).toBe('cancelled')
})

// Synthetic, privacy-safe golden texts; these are not actor recordings or paid-model measurements.
export const GOLDEN_COMMANDS = [
  { text: '建立宽8米深6米的舞台', outcome: 'valid' },
  { text: '建立宽八米深六米的舞台', outcome: 'valid' },
  { text: '添加沙发', outcome: 'valid' },
  { text: '添加圆桌', outcome: 'valid' },
  { text: '门在窗旁边', outcome: 'question' },
  { text: '把它向台右移半米', outcome: 'question' },
  { text: '添加灯光', outcome: 'question' },
  { text: '创建厨房', outcome: 'question' },
  { text: '分析人物心理', outcome: 'question' },
] as const

test.each(GOLDEN_COMMANDS)('synthetic golden command: $text', ({ text, outcome }) => {
  const empty = {
    ...context,
    objects: [],
    selectedObjectIds: [],
    venue: { ...context.venue!, widthMeters: 8, depthMeters: 6 },
  }
  const local = parseStageText(text, empty)!
  expect(local).not.toBeNull()
  const fromStructuredOutput = StagePlanSchema.parse(JSON.parse(JSON.stringify(local)))
  const transaction = { transactionId: 'golden', issuedAt: new Date().toISOString() }
  const a = compileStagePlan(local, empty, transaction)
  const b = compileStagePlan(fromStructuredOutput, empty, transaction)
  expect(a).toEqual(b)
  expect(a.ok).toBe(outcome === 'valid')
})
