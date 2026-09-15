import { expect, test } from 'bun:test'
import type { SceneContextSummary } from '@pascal-app/core/stage'
import { zodTextFormat } from 'openai/helpers/zod'
import { groundLanguage } from './language-grounding'
import {
  emptyGrounding,
  type OpenLanguageContext,
  parseOpenLanguage,
  StructuredGroundingSchema,
  validateOpenGrounding,
} from './open-language'
import { OPEN_LANGUAGE_BOUNDARIES, OPEN_LANGUAGE_CASES } from './open-language-cases'
import { requestOpenGrounding } from './open-language-client'

export function languageContext(kind = 'selection'): OpenLanguageContext {
  const objects: OpenLanguageContext['objects'] = [
    { id: 'chair', name: '椅子', kind: 'chair' },
    { id: 'riser', name: '平台', kind: 'platform' },
    { id: 'door', name: '门', kind: 'door-flat' },
    { id: 'fold', name: '三联景片', kind: 'scenic-flat' },
    ...['a', 'b', 'c'].map((id) => ({ id, name: `景片${id}`, kind: 'scenic-flat' as const })),
  ]
  const selectedObjectIds =
    kind === 'two'
      ? ['a', 'b']
      : kind === 'three' || kind === 'proposal'
        ? ['a', 'b', 'c']
        : kind === 'fold'
          ? ['fold']
          : ['chair']
  return {
    sceneVersion: 'v1',
    objects,
    selectedObjectIds,
    lastReferencedIds: ['chair'],
    proposal:
      kind === 'proposal'
        ? {
            id: 'proposal',
            subjectIds: ['a', 'b', 'c'],
            candidateIds: ['A', 'B'],
            selectedCandidateId: 'A',
            ghostCandidateId: 'A',
            hasEnclosure: true,
            minimumWidthMeters: 0.8,
          }
        : null,
  }
}
const legacyIds: Record<string, string> = {
  stage_left: 'stage-left',
  stage_right: 'stage-right',
  audience_left: 'audience-left',
  audience_right: 'audience-right',
  upstage: 'upstage',
  downstage: 'downstage',
  place_on: 'place-on',
  stack_on: 'stack-on',
  preserve_path: 'preserve-path',
  fold_hinge: 'fold-hinge',
  enclose_with_opening: 'form-enclosure',
}
function oldResult(text: string, context: OpenLanguageContext) {
  const snapshot: SceneContextSummary = {
    documentVersion: 1,
    venue: { type: 'black-box', widthMeters: 12, depthMeters: 8, heightMeters: 5 },
    selectedObjectIds: context.selectedObjectIds,
    objects: context.objects.map((item) => ({
      ...item,
      kind: item.kind as SceneContextSummary['objects'][number]['kind'],
      dimensionsMeters: { width: 1, depth: 1, height: 1 },
      transform: { position: { x: 0, y: 0, z: 2 }, rotationDegrees: { x: 0, y: 0, z: 0 } },
    })),
  }
  const g = groundLanguage(text, snapshot)
  if (g?.view?.type === 'CAMERA_INTENT' && !g.clarificationRequired) return g.view.intents[0]
  const placement = g?.placement
  if (placement?.status !== 'proposal') return null
  if (placement.intent.kind === 'connect_flats')
    return placement.intent.angleDegrees === 90 ? 'corner-angle' : 'align-edges'
  return legacyIds[placement.intent.kind] ?? null
}
let before = 0,
  after = 0
for (const row of OPEN_LANGUAGE_CASES) {
  const context = languageContext(row.context)
  const old = oldResult(row.text, context)
  if (row.clarify ? old === null : old === row.id) before++
  test(`Grounding: ${row.id} / ${row.category}: ${row.text}`, () => {
    const raw = parseOpenLanguage(row.text)
    let actual: ReturnType<typeof validateOpenGrounding> | null = null
    try {
      actual = validateOpenGrounding(raw, row.text, context)
    } catch {}
    const passed = row.clarify
      ? actual === null
      : actual !== null &&
        [...actual.grounding.intents, ...actual.grounding.constraints].includes(row.id)
    if (passed) after++
    expect(passed, JSON.stringify(raw)).toBe(true)
  })
}
for (const text of OPEN_LANGUAGE_BOUNDARIES)
  test(`Grounding boundary: ${text}`, () =>
    expect(() =>
      validateOpenGrounding(parseOpenLanguage(text), text, languageContext('proposal')),
    ).toThrow())
test('Grounding corpus inventory: 24 canonical IDs × eight categories + 24 boundaries', () => {
  expect(OPEN_LANGUAGE_CASES).toHaveLength(192)
  expect(OPEN_LANGUAGE_BOUNDARIES).toHaveLength(24)
  console.info(
    JSON.stringify({
      layer: 'natural-language',
      matrixBefore: before,
      matrixAfter: after,
      matrixTotal: 192,
      boundaryTotal: 24,
      provider: 'deterministic; not model accuracy',
    }),
  )
  console.info(
    JSON.stringify({
      boundaryBefore: OPEN_LANGUAGE_BOUNDARIES.filter(
        (text) => oldResult(text, languageContext('proposal')) === null,
      ).length,
      boundaryTotal: 24,
    }),
  )
})
for (const [name, mutate] of [
  [
    'unknown intent',
    (g: any) => {
      g.intents = ['teleport']
    },
  ],
  [
    'unknown constraint',
    (g: any) => {
      g.constraints = ['magic']
    },
  ],
  [
    'unknown concept',
    (g: any) => {
      g.knowledgeConceptIds = ['not-in-catalog']
    },
  ],
  [
    'knowledge-only',
    (g: any) => {
      g.knowledgeConceptIds = ['given-circumstances']
    },
  ],
  [
    'future',
    (g: any) => {
      g.knowledgeConceptIds = ['super-objective']
    },
  ],
  [
    'XYZ',
    (g: any) => {
      g.position = { x: 1, y: 2, z: 3 }
    },
  ],
  [
    'rotation',
    (g: any) => {
      g.angleDegrees = 45
    },
  ],
  [
    'low confidence',
    (g: any) => {
      g.confidence = 0.79
    },
  ],
  [
    'missing subject',
    (g: any) => {
      g.subjects = []
    },
  ],
  [
    'unknown reference',
    (g: any) => {
      g.subjects[0].kind = 'invented'
    },
  ],
  [
    'missing object',
    (g: any) => {
      g.subjects[0] = { kind: 'named', text: '宇宙飞船', count: null, index: null }
    },
  ],
  [
    'invented width',
    (g: any) => {
      g.minimumWidthMeters = 10
    },
  ],
  [
    'wrong utterance',
    (g: any) => {
      g.rawUtterance = '别的口令'
    },
  ],
] as const)
  test(`Validation: high confidence cannot bypass ${name}`, () => {
    const g = parseOpenLanguage('台左')!
    mutate(g)
    expect(() => validateOpenGrounding(g, '台左', languageContext())).toThrow()
  })
test('Validation: last reference resolves only while supplied context is unique', () => {
  expect(
    validateOpenGrounding(
      parseOpenLanguage('刚刚那块放到台左'),
      '刚刚那块放到台左',
      languageContext(),
    ).subjectIds,
  ).toEqual(['chair'])
  expect(() =>
    validateOpenGrounding(parseOpenLanguage('台左'), '台左', {
      ...languageContext(),
      selectedObjectIds: [],
      lastReferencedIds: [],
    }),
  ).toThrow()
  expect(() =>
    validateOpenGrounding(parseOpenLanguage('台左'), '台左', languageContext('two')),
  ).toThrow()
})
test('Validation: distinct audience/stage; fold/corner; followup refs; immutable context', () => {
  const context = languageContext('proposal'),
    before = structuredClone(context)
  for (const text of ['再宽一点', '换另一边', '看第二个', '不要了'])
    validateOpenGrounding(parseOpenLanguage(text), text, context)
  expect(context).toEqual(before)
  expect(parseOpenLanguage('台左')!.intents).not.toEqual(parseOpenLanguage('观众左')!.intents)
  expect(parseOpenLanguage('三联景片折成U型')!.intents).not.toEqual(
    parseOpenLanguage('两块景片拐90度')!.intents,
  )
  expect(() =>
    validateOpenGrounding(parseOpenLanguage('看第二个'), '看第二个', languageContext()),
  ).toThrow()
  expect(() => validateOpenGrounding(emptyGrounding('未知'), '未知', context)).toThrow()
})
test('Validation: widening may keep the current stage-left flat fixed as one bounded revision', () => {
  const text = '入口再宽一点，但左边景片不要动'
  const context = {
    ...languageContext('proposal'),
    proposal: {
      ...languageContext('proposal').proposal!,
      subjectIds: ['a', 'b'],
    },
  }
  expect(validateOpenGrounding(parseOpenLanguage(text), text, context).grounding.modifiers).toEqual(
    ['wider', 'keep_stage_left_fixed'],
  )
})
test('Validation: Structured Outputs format is strict, required, and has no transform tools', () => {
  const format = zodTextFormat(StructuredGroundingSchema, 'dia_structured_grounding')
  expect(format.strict).toBe(true)
  expect(format.schema.additionalProperties).toBe(false)
  expect(format.schema.required).toContain('requiresClarification')
  expect(JSON.stringify(format.schema)).not.toContain('rotationDegrees')
})
for (const text of [
  '三块景片围一个空间，旁边放飞船',
  '三块景片围一个空间并且变成红色',
  '两块景片拐90度并加一个灯',
  '三联景片折成U型再加点压迫感',
  '门口留条路还要建一个桥',
])
  test(`Validation: no partial adoption of unsupported tail: ${text}`, () => {
    expect(() =>
      validateOpenGrounding(parseOpenLanguage(text), text, languageContext('proposal')),
    ).toThrow()
  })
for (const mode of ['valid', 'invented-intent', 'wrong-source', 'unavailable', 'clarify'] as const)
  test(`Validation: provider boundary ${mode}, no coordinates in request`, async () => {
    const original = globalThis.fetch,
      raw = '台左',
      context = languageContext()
    let calls = 0
    globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
      calls++
      expect(url).toBe('/api/dia/ground')
      const payload = JSON.parse(String(init?.body))
      expect(payload.context).toEqual(context)
      expect(JSON.stringify(payload)).not.toContain('position')
      const g: any = parseOpenLanguage(raw)
      if (mode === 'invented-intent') g.intents = ['teleport']
      if (mode === 'wrong-source') g.rawUtterance = '台右'
      if (mode === 'clarify') {
        g.requiresClarification = true
        g.ambiguities = ['请说明对象']
      }
      return Response.json(
        {
          requestId: crypto.randomUUID(),
          grounding: g,
          provider: 'openai',
          model: 'mock-provider-not-live',
        },
        { status: mode === 'unavailable' ? 503 : 200 },
      )
    }) as typeof fetch
    try {
      if (mode === 'valid' || mode === 'clarify')
        expect((await requestOpenGrounding(raw, context, new AbortController().signal)).model).toBe(
          'mock-provider-not-live',
        )
      else
        await expect(
          requestOpenGrounding(raw, context, new AbortController().signal),
        ).rejects.toThrow()
      expect(calls).toBe(1)
    } finally {
      globalThis.fetch = original
    }
  })
