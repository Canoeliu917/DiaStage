import { describe, expect, test } from 'bun:test'
import { parseStageText, type StagePlan, StagePlanSchema } from '@pascal-app/core/stage'
import { AVAILABLE_STAGE_SCENERY } from '../stage/prop-assets'
import { planFromPassages, type ScriptModelPlanner } from './script-planner'
import {
  chunkStagePassages,
  mergeStageFacts,
  type Passage,
  resolveScriptQuestions,
  selectStagePassages,
} from './stage-facts'

const context = { documentVersion: 0, venue: null, objects: [], selectedObjectIds: [] }
const text =
  '建立一个宽8米、深6米的镜框式舞台。舞台中区放一个双人沙发，沙发台右30厘米放一块窗景片，窗景片台右紧邻一块门景片。'
const passage = (content = text, id = 'p1', page: number | null = 1): Passage => ({
  id,
  page,
  paragraph: 1,
  text: content,
})
const signal = () => new AbortController().signal
const noModel: ScriptModelPlanner = async () => {
  throw new Error('This exact spatial description must work offline')
}

function oneSofa(): StagePlan {
  const plan = parseStageText('建立宽8米深6米的舞台。舞台中区放双人沙发', context)
  if (!plan) throw new Error('Invalid fixture')
  plan.source = 'script'
  plan.evidence = [
    { id: 'p1:0', page: 1, paragraph: 1, excerpt: '舞台中央摆着双人沙发', certainty: 'stated' },
  ]
  plan.items = plan.items.map((item) => ({ ...item, certainty: 'stated', evidenceIds: ['p1:0'] }))
  return plan
}

describe('script physical fact selection and merge', () => {
  test('retains physical clauses and their original location, removes light, psychology and small props', () => {
    const source = passage(
      '舞台宽8米、深6米。舞台中区放沙发，灯光变暗；她感到悲伤。窗景片在台右0.3米，桌上的信封被拿走。',
    )
    const result = selectStagePassages([source])
    expect(result.map((entry) => entry.text)).toEqual([
      '舞台宽8米、深6米',
      '舞台中区放沙发',
      '窗景片在台右0.3米',
    ])
    for (const entry of result) {
      expect(source.text.includes(entry.text)).toBe(true)
      expect(entry.page).toBe(1)
      expect(entry.paragraph).toBe(1)
    }
    expect(selectStagePassages([source])).toEqual(result)
    expect(
      selectStagePassages([passage('舞台中区放沙发并且灯光变暗')]).map((entry) => entry.text),
    ).toEqual(['舞台中区放沙发'])
  })

  test('chunks have bounded size, overlap and retain every candidate; excessive input fails explicitly', () => {
    const candidates = Array.from({ length: 6 }, (_, index) =>
      passage(`舞台${'中'.repeat(2800)}`, `p${index}`),
    )
    const chunks = chunkStagePassages(candidates)
    expect(chunks[0]?.at(-1)?.id).toBe(chunks[1]?.[0]?.id)
    expect(new Set(chunks.flat().map((entry) => entry.id)).size).toBe(6)
    for (const chunk of chunks)
      expect(chunk.reduce((sum, item) => sum + JSON.stringify(item).length, 0)).toBeLessThanOrEqual(
        8000,
      )
    expect(() =>
      chunkStagePassages(
        Array.from({ length: 30 }, (_, index) => passage('舞台'.repeat(1900), `x${index}`)),
      ),
    ).toThrow('没有删去后文')
    expect(() => selectStagePassages([passage('舞台'.repeat(150_001))])).toThrow('300,000')
    expect(() => selectStagePassages([passage(), passage()])).toThrow('位置索引无效')
  })

  test('deduplicates identical name, kind, dimensions and position while preserving evidence and assumptions', () => {
    const first = oneSofa(),
      second = structuredClone(first)
    second.evidence[0] = { ...second.evidence[0]!, id: 'p2:0', page: 2 }
    second.items[0]!.evidenceIds = ['p2:0']
    const result = mergeStageFacts([first, second])
    expect(result.source).toBe('script')
    expect(result.items).toHaveLength(1)
    expect(result.evidence).toHaveLength(2)
    expect(result.items[0]?.evidenceIds).toHaveLength(2)
    expect(result.items[0]?.assumptionIds.length).toBeGreaterThan(0)
    expect(result.relations).toHaveLength(1)
    expect(StagePlanSchema.safeParse(result).success).toBe(true)
  })

  test('conflicting physical states cannot overwrite one another and need an explicit choice', () => {
    const first = oneSofa(),
      second = structuredClone(first)
    second.items[0]!.dimensionsMeters.width = 3
    const merged = mergeStageFacts([first, second])
    expect(merged.items).toHaveLength(2)
    expect(merged.questions).toHaveLength(1)
    expect(merged.questions[0]?.options).toHaveLength(3)
    const questionId = merged.questions[0]!.id
    const resolved = resolveScriptQuestions(merged, [{ questionId, answer: '采用前一处描述' }])
    expect(resolved.questions).toHaveLength(0)
    expect(resolved.items).toHaveLength(1)
    expect(resolved.items[0]?.dimensionsMeters.width).toBe(first.items[0]!.dimensionsMeters.width)
    expect(merged.items).toHaveLength(2)
  })

  test('conflicting stage sizes require valid explicit dimensions', () => {
    const first = oneSofa(),
      second = oneSofa()
    second.venue!.widthMeters = 10
    const merged = mergeStageFacts([first, second])
    expect(merged.questions).toHaveLength(1)
    const id = merged.questions[0]!.id
    expect(
      resolveScriptQuestions(merged, [{ questionId: id, answer: '随便' }]).questions,
    ).toHaveLength(1)
    const answered = resolveScriptQuestions(merged, [{ questionId: id, answer: '宽10米深6米' }])
    expect(answered.questions).toHaveLength(0)
    expect(answered.venue?.widthMeters).toBe(10)
  })
})

describe('script planner', () => {
  test('equivalent PDF page and DOCX paragraph text yield the same offline stage with truthful evidence', async () => {
    const pdf = await planFromPassages([passage()], signal(), { note: ' \n ' }, noModel)
    const docx = await planFromPassages([passage(text, 'paragraph1', null)], signal(), {}, noModel)
    const geometry = (plan: StagePlan) =>
      plan.items.map(({ kind, dimensionsMeters, transform }) => ({
        kind,
        dimensionsMeters,
        transform,
      }))
    expect(geometry(pdf)).toEqual(geometry(docx))
    expect(pdf.venue?.widthMeters).toBe(8)
    for (const [index, x] of [0, 1.825].entries())
      expect(pdf.items[index]?.transform.position.x).toBeCloseTo(x, 8)
    expect(pdf.questions).toMatchObject([{ id: 'kind-3', options: ['单门景片', '双门景片'] }])
    const answered = await planFromPassages(
      [passage()],
      signal(),
      { priorAnswers: [{ questionId: 'kind-3', answer: '单门景片' }] },
      noModel,
    )
    expect(answered.items).toHaveLength(3)
    expect(answered.items[2]!.transform.position.x).toBeCloseTo(3.125, 8)
    expect(answered.questions).toHaveLength(0)
    for (const item of pdf.items) {
      const installed = AVAILABLE_STAGE_SCENERY.find(
        ({ asset }) => asset.id === item.libraryAssetId,
      )!
      expect(item.dimensionsMeters).toEqual({
        width: installed.asset.dimensions![0],
        height: installed.asset.dimensions![1],
        depth: installed.asset.dimensions![2],
      })
    }
    expect(
      pdf.items.every(
        (item) =>
          item.certainty === 'stated' &&
          item.assumptionIds.length > 0 &&
          item.evidenceIds.length > 0,
      ),
    ).toBe(true)
    expect(pdf.evidence.every((entry) => text.includes(entry.excerpt))).toBe(true)
    expect(docx.evidence.every((entry) => entry.page === null && entry.paragraph === 1)).toBe(true)
  })

  test('script can use an existing stage and answer missing venue dimensions without an API key', async () => {
    const input = [passage('舞台中区放双人沙发')]
    const first = await planFromPassages(input, signal(), {}, noModel)
    expect(first.questions.map((question) => question.id)).toEqual(['venue-宽', 'venue-深'])
    const answered = await planFromPassages(
      input,
      signal(),
      {
        priorAnswers: [
          { questionId: 'venue-宽', answer: '8' },
          { questionId: 'venue-深', answer: '6' },
        ],
      },
      noModel,
    )
    expect(answered.venue?.depthMeters).toBe(6)
    expect(answered.questions).toHaveLength(0)
    const existing = await planFromPassages(
      input,
      signal(),
      { sceneContext: { ...context, venue: answered.venue } },
      noModel,
    )
    expect(existing.venue).toBeNull()
    expect(existing.items[0]?.transform.position.z).toBe(3)
  })

  test('complex prose is bounded and verified before model facts become a plan; defaults remain assumptions', async () => {
    let calls = 0
    const plan = await planFromPassages(
      [passage('舞台中央摆着双人沙发')],
      signal(),
      {},
      async (request) => {
        calls++
        expect(request.passages.map((entry) => entry.text)).toEqual(['舞台中央摆着双人沙发'])
        const result = oneSofa()
        result.items[0]!.assumptionIds = []
        result.assumptions = []
        return result
      },
    )
    expect(calls).toBe(1)
    expect(plan.items[0]?.certainty).toBe('stated')
    expect(
      plan.assumptions.some((assumption) => assumption.message.includes('尺寸未在引用原文中写明')),
    ).toBe(true)
  })

  test('fabricated evidence and unknown executable fields are rejected after one repair attempt', async () => {
    let calls = 0
    await expect(
      planFromPassages([passage('舞台中央摆着双人沙发')], signal(), {}, async () => {
        calls++
        const result = oneSofa()
        result.evidence[0]!.excerpt = '编造的原文'
        return result
      }),
    ).rejects.toThrow('可靠原文证据')
    expect(calls).toBe(2)
    await expect(
      planFromPassages([passage('舞台中央摆着双人沙发')], signal(), {}, async () => ({
        ...oneSofa(),
        execute: 'deleteScene()',
      })),
    ).rejects.toThrow('可靠原文证据')
  })

  test('nonempty notes reach the model even for locally parseable scripts and remain separate from passages', async () => {
    const input = passage('建立宽8米深6米的舞台。舞台中区放双人沙发')
    let calls = 0
    for (const note of [' \n 沙发向台右移动一米。\n ', ` ${'注'.repeat(2000)} `]) {
      const plan = await planFromPassages([input], signal(), { note }, async (request) => {
        calls++
        expect(request.note).toBe(note.trim())
        expect(request.passages.every((entry) => input.text.includes(entry.text))).toBe(true)
        expect(request.passages.some((entry) => entry.text.includes(note.trim()))).toBe(false)
        const result = oneSofa()
        const source = request.passages.find((entry) => entry.text.includes('双人沙发'))!
        result.evidence[0] = {
          id: source.id,
          page: source.page,
          paragraph: source.paragraph,
          excerpt: source.text,
          certainty: 'stated',
        }
        result.items[0]!.evidenceIds = [source.id]
        return result
      })
      expect(plan.items).toHaveLength(1)
      expect(plan.evidence.every((entry) => input.text.includes(entry.excerpt))).toBe(true)
    }
    expect(calls).toBe(2)
  })

  test('oversized notes fail before local parsing or a provider, and cannot become script evidence', async () => {
    let calls = 0
    await expect(
      planFromPassages([passage()], signal(), { note: '注'.repeat(2001) }, async () => {
        calls++
        return oneSofa()
      }),
    ).rejects.toMatchObject({ code: 'PLAN_INVALID' })
    expect(calls).toBe(0)
    const note = '沙发向台右移动一米。'
    await expect(
      planFromPassages([passage('舞台中央摆着双人沙发')], signal(), { note }, async () => {
        calls++
        const result = oneSofa()
        result.evidence[0]!.excerpt = note
        return result
      }),
    ).rejects.toThrow('可靠原文证据')
    expect(calls).toBe(2)
  })

  test('only installed assets matching the proposed object and standard dimensions pass evidence validation', async () => {
    for (const mutate of [
      (plan: StagePlan) => {
        plan.items[0]!.libraryAssetId = 'invented-asset'
      },
      (plan: StagePlan) => {
        plan.items[0]!.libraryAssetId = 'SCN-SOFA-090'
      },
      (plan: StagePlan) => {
        plan.items[0]!.kind = 'chair'
      },
      (plan: StagePlan) => {
        plan.items[0]!.displayName = '圆桌'
      },
      (plan: StagePlan) => {
        plan.items[0]!.dimensionsMeters.width += 1
      },
    ]) {
      let calls = 0
      await expect(
        planFromPassages([passage('舞台中央摆着双人沙发')], signal(), {}, async () => {
          calls++
          const plan = oneSofa()
          mutate(plan)
          return plan
        }),
      ).rejects.toThrow('可靠原文证据')
      expect(calls).toBe(2)
    }
    const plan = await planFromPassages([passage('舞台中央摆着双人沙发')], signal(), {}, async () =>
      oneSofa(),
    )
    expect(plan.items[0]!.libraryAssetId).toBe('SCN-SOFA-175')
  })

  test('canceled work, forbidden-only scripts and unrelated prose produce no guessed stage', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(planFromPassages([passage()], controller.signal, {}, noModel)).rejects.toThrow()
    await expect(
      planFromPassages([passage('灯光亮起。人物充满悲伤。酒杯被打碎。')], signal(), {}, noModel),
    ).rejects.toThrow('没有找到舞台空间')
    await expect(
      planFromPassages([passage('这是作者介绍。远方传来回忆。')], signal(), {}, noModel),
    ).rejects.toThrow('没有找到舞台空间')
  })
})
