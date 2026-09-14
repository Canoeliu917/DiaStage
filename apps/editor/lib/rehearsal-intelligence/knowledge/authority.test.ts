import { describe, expect, test } from 'bun:test'
import { SOURCE_IDS } from './catalog'
import { DIA_KNOWLEDGE, lookupAlias, lookupRelations, validateKnowledgeCatalog } from './retrieval'

const concept = (id: string) => DIA_KNOWLEDGE.concepts.find((item) => item.id === id)!

describe('Theatre Terminology Authority Review', () => {
  test('catalog passes structural and authority semantic validation', () => {
    expect(validateKnowledgeCatalog()).toBeDefined()
    expect(DIA_KNOWLEDGE.concepts).toHaveLength(124)
    expect(DIA_KNOWLEDGE.sources).toHaveLength(6)
  })

  test('exam sources are candidate, alias or historical evidence, never authority definitions', () => {
    const examSourceIds = new Set([
      SOURCE_IDS.encyclopedia,
      SOURCE_IDS.mindmap,
      SOURCE_IDS.zhongxi,
      SOURCE_IDS.glossary2018,
    ])
    const refs = DIA_KNOWLEDGE.concepts.flatMap((item) => item.sourceRefs)
    expect(
      refs
        .filter((ref) =>
          examSourceIds.has(ref.sourceId as (typeof SOURCE_IDS)[keyof typeof SOURCE_IDS]),
        )
        .every((ref) =>
          ['candidate_definition', 'alias', 'historical_terminology'].includes(ref.role),
        ),
    ).toBe(true)
    expect(
      DIA_KNOWLEDGE.concepts
        .filter((item) => item.definitionStatus === 'canonical')
        .every((item) => item.authorityTier !== 'exam_notes' && item.authorityRefs.length > 0),
    ).toBe(true)
  })

  test('规定情境 and 戏剧情境 stay separate and tradition-scoped', () => {
    expect(concept('given-circumstances')).toMatchObject({
      tradition: 'stanislavski_system',
      definitionStatus: 'tradition_specific',
    })
    expect(concept('dramatic-situation')).toMatchObject({
      tradition: 'chinese_theatre_studies',
      definitionStatus: 'tradition_specific',
    })
    expect(lookupRelations('given-circumstances', 'distinct_from')[0]?.target.id).toBe(
      'dramatic-situation',
    )
  })

  test('最高任务 is scoped to the Stanislavski tradition', () => {
    expect(concept('super-objective')).toMatchObject({
      canonicalLabel: 'super-objective',
      tradition: 'stanislavski_system',
      definitionStatus: 'tradition_specific',
    })
  })

  test('through-action Chinese variants normalize to one concept', () => {
    for (const term of ['贯穿行动', '贯串行动', '贯穿动作', '贯串动作']) {
      const result = lookupAlias(term)
      expect(result.kind).toBe('match')
      if (result.kind === 'match') expect(result.concept.id).toBe('through-action')
    }
  })

  test('physical and psychological action are related, not isolated as a binary', () => {
    expect(lookupRelations('physical-action', 'related_to')[0]?.target.id).toBe(
      'psychological-action',
    )
    expect(lookupRelations('physical-action', 'distinct_from')).toEqual([])
  })

  test('experiencing and representation schools remain historical teaching categories', () => {
    for (const id of ['experiencing-school', 'representation-school']) {
      expect(concept(id)).toMatchObject({
        definitionStatus: 'tradition_specific',
        tradition: 'historical_acting_pedagogy',
      })
      expect(lookupRelations(id, 'broader_than')).toEqual([])
    }
  })

  test('alienation effect keeps translation variants without prohibiting all emotion', () => {
    const item = concept('alienation-effect')
    expect(item.aliases).toContain('陌生化效果')
    expect(item.definitionStatus).toBe('translation_variant')
    expect(item.definition).not.toContain('完全不允许')
  })

  test('blocking and mise-en-scène remain related but distinct concepts', () => {
    expect(lookupAlias('舞台调度')).toMatchObject({ kind: 'match' })
    expect(concept('blocking').id).not.toBe(concept('mise-en-scene').id)
    expect(lookupRelations('blocking', 'distinct_from')[0]?.target.id).toBe('mise-en-scene')
  })

  test('stage-zone ranking is heuristic and stage-event is a directing analysis frame', () => {
    expect(concept('stage-zone')).toMatchObject({ definitionStatus: 'heuristic' })
    expect(concept('stage-event')).toMatchObject({
      definitionStatus: 'tradition_specific',
      tradition: 'director_analysis_pedagogy',
    })
  })

  test('dramaticity definition is scoped to Chinese theatre theory', () => {
    expect(concept('dramaticity')).toMatchObject({
      definitionStatus: 'tradition_specific',
      tradition: 'chinese_theatre_studies',
    })
  })

  test('stage left maps to audience right on the same physical side', () => {
    expect(concept('stage-left')).toMatchObject({
      definitionStatus: 'canonical',
      canonicalLabel: '舞台左',
    })
    expect(lookupRelations('stage-left', 'same_spatial_side_as')[0]?.target.id).toBe(
      'audience-right',
    )
    expect(lookupRelations('stage-left', 'distinct_from')[0]?.target.id).toBe('audience-left')
  })

  test('Black Slave’s Cry to Heaven records adaptation and historical roles separately', () => {
    const item = concept('black-slaves-cry-to-heaven')
    expect(item.definition).toContain('改编和再创造')
    expect(item.historicalAttributions.adapters).toContain('曾孝谷')
    expect(item.historicalAttributions.participants).toContain('春柳社')
    expect(item.historicalAttributions.founders).toEqual([])
    expect(item.historicalAttributions.proposers).toEqual([])
  })
})
