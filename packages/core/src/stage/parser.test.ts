import { describe, expect, test } from 'bun:test'
import { parseStageLength, parseStageNumber, parseStageText } from './parser'
import { compileStagePlan } from './plan'
import { type SceneContextSummary, StagePlanSchema } from './schema'

const empty: SceneContextSummary = {
  documentVersion: 0,
  venue: null,
  objects: [],
  selectedObjectIds: [],
}
const context: SceneContextSummary = {
  documentVersion: 2,
  venue: { type: 'proscenium', widthMeters: 8, depthMeters: 6, heightMeters: 4 },
  objects: [
    {
      id: 'chair-1',
      name: '椅子',
      kind: 'chair',
      dimensionsMeters: { width: 0.5, height: 0.85, depth: 0.5 },
      transform: { position: { x: 1, y: 0, z: 2 }, rotationDegrees: { x: 0, y: 10, z: 0 } },
    },
    {
      id: 'table-1',
      name: '圆桌',
      kind: 'table',
      dimensionsMeters: { width: 1.2, height: 0.75, depth: 1.2 },
      transform: { position: { x: 0, y: 0, z: 3 }, rotationDegrees: { x: 0, y: 0, z: 0 } },
    },
    {
      id: 'door-1',
      name: '门景片',
      kind: 'door-flat',
      dimensionsMeters: { width: 0.9, height: 2.1, depth: 0.15 },
      transform: { position: { x: 3, y: 0, z: 4 }, rotationDegrees: { x: 0, y: 0, z: 0 } },
    },
  ],
  selectedObjectIds: ['chair-1'],
}
const sample =
  '建立一个宽8米、深6米的镜框式舞台。舞台中区放一个双人沙发，沙发台右30厘米放一块窗景片，窗景片台右紧邻一块单门景片。'
const transaction = { transactionId: 'test', issuedAt: '2026-09-10T00:00:00Z' }

describe('deterministic Chinese stage input', () => {
  test('unspecified clearances are zero while explicit distances remain exact', () => {
    const plan = parseStageText('一张圆桌，两把硬椅', { ...context, objects: [] })!
    expect(plan.relations.every((relation) => relation.gapMeters === 0)).toBe(true)
    expect(plan.items[1]!.transform.position.x).toBeCloseTo(-0.675)
    expect(plan.items[2]!.transform.position.x).toBeCloseTo(0.675)
    const edge = parseStageText('台右增加单门景片', { ...context, objects: [] })!
    expect(edge.relations[0]!.gapMeters).toBe(0)
  })
  test('Chinese digits, decimals, half and metres/centimetres stay numeric', () => {
    for (const [input, value] of [
      ['二十', 20],
      ['九十', 90],
      ['一百零五', 105],
      ['二点五', 2.5],
      ['零点三', 0.3],
      ['半', 0.5],
      ['10.25', 10.25],
      ['-2', -2],
    ] as const)
      expect(parseStageNumber(input)).toBe(value)
    for (const [input, value] of [
      ['30厘米', 0.3],
      ['三十厘米', 0.3],
      ['半米', 0.5],
      ['一米半', 1.5],
      ['2.5m', 2.5],
      ['25cm', 0.25],
      ['两米', 2],
      ['零点三米', 0.3],
    ] as const)
      expect(parseStageLength(input)).toBeCloseTo(value, 10)
    for (const input of ['Infinity', 'NaN', '百十百', '一点点', '无穷', '一百三'])
      expect(parseStageNumber(input)).toBeNull()
    expect(parseStageLength('30厘米及灯光')).toBeNull()
  })
  test('full and abbreviated examples compile offline to the same object placement', () => {
    const full = parseStageText(sample, empty)!
    expect(StagePlanSchema.safeParse(full).success).toBe(true)
    expect(full.venue).toEqual({
      type: 'proscenium',
      widthMeters: 8,
      depthMeters: 6,
      heightMeters: null,
    })
    expect(full.items.map((item) => item.kind)).toEqual(['sofa', 'window-flat', 'door-flat'])
    expect(full.items[0]!.dimensionsMeters).toEqual({ width: 1.75, height: 0.85, depth: 0.8 })
    expect(full.items[1]!.dimensionsMeters).toEqual({
      width: 1.3,
      height: 2.4,
      depth: 0.08200000000000002,
    })
    expect(full.items[1]!.transform.position.x).toBeCloseTo(1.825, 10)
    expect(full.items[2]!.transform.position.x).toBeCloseTo(3.125, 10)
    expect(compileStagePlan(full, empty, transaction).ok).toBe(true)
    expect(full.assumptions).toHaveLength(3)
    const short = parseStageText(
      '8×6米舞台，中区双人沙发，沙发台右0.3米为窗景片，窗景片台右紧邻单门景片',
      empty,
    )!
    expect(short.items.map((item) => item.transform)).toEqual(
      full.items.map((item) => item.transform),
    )
    const spoken = parseStageText(
      sample.replace('8米', '八米').replace('6米', '六米').replace('30厘米', '三十厘米'),
      empty,
      [],
      'voice',
    )!
    expect(spoken.source).toBe('voice')
    expect(spoken.items.map((item) => item.transform)).toEqual(
      full.items.map((item) => item.transform),
    )
  })
  test('one selected pronoun moves in all four theatre directions without changing source data', () => {
    const before = structuredClone(context)
    for (const [direction, axis, delta] of [
      ['台后', 'z', 0.5],
      ['台前', 'z', -0.5],
      ['台右', 'x', 0.5],
      ['台左', 'x', -0.5],
    ] as const) {
      const result = parseStageText(`把它向${direction}移半米`, context)!
      expect(result.questions).toHaveLength(0)
      expect(result.items[0]!.existingNodeId).toBe('chair-1')
      expect(result.items[0]!.transform.position[axis]).toBe(
        context.objects[0]!.transform.position[axis] + delta,
      )
    }
    expect(context).toEqual(before)
    const rotation = parseStageText('把门景片旋转九十度', context)!
    expect(rotation.items[0]!.transform.rotationDegrees.y).toBe(90)
    expect(rotation.items[0]!.existingNodeId).toBe('door-1')
  })
  test('ambiguous right side and unselected pronouns require an answer before commands', () => {
    const result = parseStageText('把它向右边移半米', context)!
    expect(result.questions[0]!.id).toBe('direction-0')
    expect(compileStagePlan(result, context, transaction).commands).toEqual([])
    const answered = parseStageText('把它向右边移半米', context, [
      { questionId: 'direction-0', answer: '台右' },
    ])!
    expect(answered.items[0]!.transform.position.x).toBe(1.5)
    const noSelection = parseStageText('把它向台后移半米', { ...context, selectedObjectIds: [] })!
    expect(noSelection.questions).toHaveLength(1)
    expect(noSelection.items).toEqual([])
    const chosen = parseStageText('把它向台后移半米', { ...context, selectedObjectIds: [] }, [
      { questionId: 'object-0', answer: 'chair-1' },
    ])!
    expect(chosen.items[0]!.existingNodeId).toBe('chair-1')
  })
  test('duplicate uses the selected item dimensions and relative position, preserving the original', () => {
    const result = parseStageText('复制这把椅子，放到圆桌台左', context)!
    expect(result.items).toHaveLength(1)
    expect(result.items[0]!.existingNodeId).toBeNull()
    expect(result.items[0]!.dimensionsMeters).toEqual(context.objects[0]!.dimensionsMeters)
    expect(result.items[0]!.displayName).toBe('椅子副本')
    expect(result.items[0]!.transform.position.x).toBeLessThan(-0.85)
    expect(result.items[0]!.transform.position.z).toBe(3)
    expect(result.relations[0]!.direction).toBe('stage-left')
  })
  test('same-name objects ask which one and never silently pick the first', () => {
    const second = { ...structuredClone(context.objects[0]!), id: 'chair-2' }
    const scene = { ...context, objects: [...context.objects, second] }
    const result = parseStageText('把椅子向台前移半米', scene)!
    expect(result.items).toHaveLength(0)
    expect(result.questions[0]!.options).toHaveLength(2)
    const selected = parseStageText('把椅子向台前移半米', scene, [
      { questionId: 'object-0', answer: 'chair-2' },
    ])!
    expect(selected.items[0]!.existingNodeId).toBe('chair-2')
  })
  test('unknown residual clauses, quantities and numbers are not silently dropped', () => {
    for (const input of [
      `${sample}随后把所有物件围成一个心形。`,
      '舞台中区放两把椅子',
      '把它向台后移半米并旋转成螺旋',
    ])
      expect(parseStageText(input, context)).toBeNull()
    for (const input of [
      '建立宽八点点米深六米的舞台',
      '建立宽-8米深6米的舞台',
      '建立宽0米深6米的舞台',
    ]) {
      const invalidNumber = parseStageText(input, context)!
      expect(invalidNumber.questions.some((question) => question.id === 'venue-宽')).toBe(true)
      expect(compileStagePlan(invalidNumber, context, transaction).commands).toEqual([])
    }
    const forbidden = parseStageText(`${sample}添加舞台灯光。`, empty)!
    expect(forbidden.items).toEqual([])
    expect(forbidden.questions[0]!.id).toBe('unsupported-domain')
    expect(compileStagePlan(forbidden, empty, transaction).commands).toEqual([])
  })
  test('missing stage measurements have a deterministic clarification path', () => {
    const result = parseStageText('舞台中区放一把硬椅', empty)!
    expect(result.questions.map((question) => question.id)).toEqual(['venue-宽', 'venue-深'])
    const answered = parseStageText('舞台中区放一把硬椅', empty, [
      { questionId: 'venue-宽', answer: '8米' },
      { questionId: 'venue-深', answer: '六' },
    ])!
    expect(answered.questions).toEqual([])
    expect(answered.venue!.widthMeters).toBe(8)
    expect(answered.items[0]!.transform.position.z).toBe(3)
  })
})
