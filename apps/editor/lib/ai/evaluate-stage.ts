// Synthetic regression corpus, not recordings or measurements of a paid model.
// Run: bun apps/editor/lib/ai/evaluate-stage.ts
import {
  compileStagePlan,
  parseStageText,
  type SceneContextSummary,
  type StagePlan,
} from '@pascal-app/core/stage'
import { estimateAudioCostCny, estimateTextCostCny } from './model-pricing'

const empty: SceneContextSummary = {
  documentVersion: 1,
  venue: { type: 'proscenium', widthMeters: 8, depthMeters: 6, heightMeters: 4 },
  objects: [],
  selectedObjectIds: [],
}
const chair: SceneContextSummary['objects'][number] = {
  id: 'chair',
  name: '椅子',
  kind: 'chair',
  dimensionsMeters: { width: 0.5, height: 0.85, depth: 0.5 },
  transform: { position: { x: 0, y: 0, z: 3 }, rotationDegrees: { x: 0, y: 0, z: 0 } },
}
const selected = { ...empty, objects: [chair], selectedObjectIds: ['chair'] }
type Case = {
  text: string
  context?: SceneContextSummary
  category: 'valid' | 'ambiguous' | 'forbidden' | 'blocked'
  fields?: (plan: StagePlan) => boolean[]
}
export const cases: Case[] = [
  {
    text: '建立宽八米深六米的舞台',
    category: 'valid',
    fields: (p) => [p.venue?.widthMeters === 8, p.venue?.depthMeters === 6],
  },
  {
    text: '建立宽800厘米深6.5米的舞台',
    category: 'valid',
    fields: (p) => [p.venue?.widthMeters === 8, p.venue?.depthMeters === 6.5],
  },
  {
    text: '在舞台中区放一个双人沙发',
    category: 'valid',
    fields: (p) => [p.items[0]?.kind === 'sofa', p.items[0]?.transform.position.z === 3],
  },
  ...(['台左', '台右', '台前', '台后'] as const).map(
    (direction): Case => ({
      text: `把它向${direction}移半米`,
      context: selected,
      category: 'valid',
      fields: (p) => [
        p.items[0]?.existingNodeId === 'chair',
        p.items[0]?.transform.position.x ===
          (direction === '台左' ? -0.5 : direction === '台右' ? 0.5 : 0),
        p.items[0]?.transform.position.z ===
          (direction === '台前' ? 2.5 : direction === '台后' ? 3.5 : 3),
      ],
    }),
  ),
  {
    text: '窗景片台右30厘米放门景片',
    context: {
      ...empty,
      objects: [{ ...chair, id: 'window', name: '窗景片', kind: 'window-flat' }],
    },
    category: 'valid',
    fields: (p) => [p.relations[0]?.gapMeters === 0.3, p.items[0]?.kind === 'door-flat'],
  },
  { text: '把它向台右移半米', category: 'ambiguous' },
  { text: '门在窗旁边', category: 'ambiguous' },
  {
    text: '把椅子向台后移半米',
    context: { ...empty, objects: [chair, { ...chair, id: 'chair-2' }] },
    category: 'ambiguous',
  },
  { text: '把椅子向台右移100米', context: selected, category: 'blocked' },
  { text: '添加椅子', context: selected, category: 'blocked' },
  {
    text: '添加椅子',
    context: {
      ...empty,
      objects: [
        {
          ...chair,
          id: 'door',
          name: '门',
          kind: 'door-flat',
          transform: { ...chair.transform, position: { x: 0, y: 0, z: 3.5 } },
          dimensionsMeters: { width: 0.9, height: 2.1, depth: 0.1 },
        },
      ],
    },
    category: 'blocked',
  },
  ...['添加灯光', '创建厨房', '添加屋顶', '分析人物心理'].map(
    (text): Case => ({ text, category: 'forbidden' }),
  ),
]

const results = cases.map((item) => {
  const start = performance.now()
  const context = item.context ?? empty
  const plan = parseStageText(item.text, context)
  const compiled =
    plan &&
    compileStagePlan(plan, context, {
      transactionId: 'evaluation',
      issuedAt: '2026-09-10T00:00:00.000Z',
    })
  const fields = plan && item.fields ? item.fields(plan) : []
  const passed =
    Boolean(
      plan &&
        (item.category === 'valid'
          ? compiled?.ok
          : item.category === 'blocked'
            ? !compiled?.ok && !plan.questions.length
            : plan.questions.length > 0),
    ) && fields.every(Boolean)
  return {
    category: item.category,
    input: item.text,
    localHit: plan !== null,
    passed,
    fields,
    latencyMs: performance.now() - start,
  }
})
const latencies = results.map((result) => result.latencyMs).sort((a, b) => a - b)
const rate = (category: Case['category']) => {
  const entries = results.filter((result) => result.category === category)
  return entries.filter((result) => result.passed).length / entries.length
}
const fields = results.flatMap((result) => result.fields)
console.log(
  JSON.stringify(
    {
      provenance: '人工编写合成口令；无真实录音、无真实模型调用、无实机测量',
      total: results.length,
      passed: results.filter((result) => result.passed).length,
      failedSamples: results.filter((result) => !result.passed),
      syntheticMetrics: {
        localParserHitRate: results.filter((result) => result.localHit).length / results.length,
        checkedFieldAccuracy: fields.filter(Boolean).length / fields.length,
        checkedFields: fields.length,
        ambiguityRecall: rate('ambiguous'),
        forbiddenRejectionRate: rate('forbidden'),
        knownSpatialErrorPassRate: 1 - rate('blocked'),
        p50Ms: latencies[Math.floor(latencies.length * 0.5)],
        p95Ms: latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))],
        paidCostCny: 0,
      },
      realMeasurements: {
        status: '未实测',
        theatreTranscriptionAccuracy: null,
        paidModelFieldAccuracy: null,
        iPhoneLatency: null,
        averageFeatureCostCny: null,
      },
      transactionMetrics:
        '请运行 ai-controls.test.ts、creation-policy.test.ts、command-executor.test.ts 和 session-store.test.ts；本脚本不执行场景写入，不推断真实越权或部分写入率。',
      referenceExamplesCny: {
        text: estimateTextCostCny('gpt-5.6-luna', 3000, 0, 800),
        audio30Seconds: estimateAudioCostCny(30),
        tenScriptChunks: estimateTextCostCny('gpt-5.6-luna', 8000, 0, 1500) * 10,
      },
    },
    null,
    2,
  ),
)
if (results.some((result) => !result.passed)) process.exitCode = 1
