import { expect, test } from 'bun:test'
import { SOURCE_IDS } from './catalog'
import {
  DIA_KNOWLEDGE,
  getExecutableIntents,
  lookupAlias,
  lookupCanonical,
  lookupRelations,
  lookupSource,
} from './retrieval'

const vocabulary = [
  ['台口', 'proscenium-opening'],
  ['臺口', 'proscenium-opening'],
  ['台唇', 'apron'],
  ['侧台', 'stage-wings'],
  ['側舞臺', 'stage-wings'],
  ['上场门', 'entrance-portal'],
  ['上場口', 'entrance-portal'],
  ['下场门', 'exit-portal'],
  ['下場口', 'exit-portal'],
  ['后台', 'backstage'],
  ['前台', 'front-of-house'],
  ['镜框式舞台', 'proscenium-stage'],
  ['伸展式舞台', 'thrust-stage'],
  ['环形舞台', 'arena-stage'],
  ['黑盒子', 'black-box-theatre'],
  ['大幕', 'main-curtain'],
  ['天幕', 'cyclorama'],
  ['紗幕', 'scrim'],
  ['二道幕', 'act-curtain'],
  ['舞美', 'stage-art'],
  ['布景设计', 'set-design'],
  ['舞台平面图', 'ground-plan'],
  ['舞监', 'stage-manager'],
  ['cue', 'performance-cue'],
  ['第四面墙', 'fourth-wall'],
  ['角色动机', 'character-motivation'],
]

for (const [phrase, id] of vocabulary)
  test(`published theatre term: ${phrase}`, () => {
    expect(lookupAlias(phrase!)).toMatchObject({
      kind: 'match',
      concept: { id, status: 'OBSERVE', executionEligibility: 'knowledge_only' },
    })
    expect(getExecutableIntents(id!)).toEqual([])
  })

for (const phrase of ['上下场口', '上下場口'])
  test(`combined portal phrase retains both concepts: ${phrase}`, () => {
    const result = lookupAlias(phrase)
    expect(result.kind).toBe('ambiguous')
    if (result.kind !== 'ambiguous') throw new Error('combined portal phrase lost a concept')
    expect(result.clarificationRequired).toBe(true)
    expect(result.candidates.map((item) => item.id)).toEqual(['entrance-portal', 'exit-portal'])
    expect(result.candidates.every((item) => item.executionEligibility === 'knowledge_only')).toBe(
      true,
    )
  })

test('published terminology has precise provenance and retains interpretation boundaries', () => {
  const ids = [...new Set(vocabulary.map(([, id]) => id!))]
  expect(ids).toHaveLength(22)
  for (const id of ids) {
    const concept = lookupCanonical(id)!
    expect(concept.authorityRefs.length).toBeGreaterThan(0)
    expect(concept.positiveExamples.length).toBeGreaterThan(0)
    expect(concept.contrastExamples.length).toBeGreaterThan(0)
    expect(concept.disputedNotes.length).toBeGreaterThan(0)
    expect(concept.executableIntents).toEqual([])
    for (const ref of concept.sourceRefs) expect(lookupSource(ref.sourceId)).toBeDefined()
  }
  expect(lookupSource(SOURCE_IDS.stageDirections)?.source.ingestionStatus).toBe('partial')
  expect(
    DIA_KNOWLEDGE.concepts.filter((item) => item.executionEligibility === 'allowed'),
  ).toHaveLength(43)
})

test('entrance and exit portals are not upstage and downstage', () => {
  expect(lookupAlias('upstage')).toMatchObject({ kind: 'match', concept: { id: 'upstage' } })
  expect(lookupAlias('downstage')).toMatchObject({ kind: 'match', concept: { id: 'downstage' } })
  expect(lookupAlias('上场口方向').kind).toBe('not_found')
  expect(lookupAlias('前台方向').kind).toBe('not_found')
  expect(
    lookupRelations('entrance-portal', 'distinct_from').map((item) => item.target.id),
  ).toContain('upstage')
  expect(lookupRelations('exit-portal', 'distinct_from').map((item) => item.target.id)).toContain(
    'downstage',
  )
  for (const id of ['entrance-portal', 'exit-portal']) {
    expect(lookupCanonical(id)?.definition).toContain('镜框式')
    expect(lookupCanonical(id)?.tradition).toBe('chinese_stagecraft_direction_convention')
  }
})

test('space, curtain and ambiguous mixed wording remain distinct', () => {
  expect(lookupAlias('边幕')).toMatchObject({ kind: 'match', concept: { id: 'wing-curtain' } })
  expect(lookupAlias('翼幕')).toMatchObject({ kind: 'match', concept: { id: 'wing-curtain' } })
  expect(lookupAlias('侧幕台').kind).toBe('not_found')
  expect(lookupRelations('stage-wings', 'distinct_from').map((item) => item.target.id)).toEqual([
    'wing-curtain',
  ])
  expect(lookupRelations('backstage', 'distinct_from').map((item) => item.target.id)).toEqual([
    'upstage',
  ])
  expect(lookupRelations('front-of-house', 'distinct_from').map((item) => item.target.id)).toEqual([
    'backstage',
    'downstage',
  ])
})

test('theory words do not introduce scenery or execution permissions', () => {
  expect(getExecutableIntents('fourth-wall')).toEqual([])
  expect(lookupCanonical('fourth-wall')?.disputedNotes.join('')).toContain('不是实体景片')
  expect(lookupRelations('act-curtain', 'distinct_from').map((item) => item.target.id)).toEqual([
    'double-fold-flat',
  ])
  expect(
    lookupRelations('character-motivation', 'distinct_from').map((item) => item.target.id),
  ).toEqual(['character-objective'])
  expect(lookupAlias('剧场心理诊断').kind).toBe('not_found')
})
