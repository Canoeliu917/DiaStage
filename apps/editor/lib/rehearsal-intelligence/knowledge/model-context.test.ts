import { expect, test } from 'bun:test'
import { OPEN_CONCEPTS } from '../open-language'
import { THEATRE_KNOWLEDGE_LIMITS, theatreKnowledgeForInput } from './model-context'
import { DIA_KNOWLEDGE, lookupCanonical } from './retrieval'

const ids = (text: string) => theatreKnowledgeForInput(text).concepts.map((concept) => concept.id)

test('longest terminology wins without swallowing an independently mentioned shorter term', () => {
  expect(ids('舞台行动是什么？')[0]).toBe('dramatic-action')
  expect(ids('舞台行动是什么？')).not.toContain('action')
  expect(ids('舞台行动和行动分别是什么？')).toContain('action')
  expect(ids('侧幕和边幕是什么？').filter((id) => id === 'wing-curtain')).toHaveLength(1)
})

test('Latin terms match whole words and related theories retain their distinction', () => {
  expect(ids('什么是 BLOCKING？')).toContain('blocking')
  expect(ids('什么是 BLOCKING？')).toContain('mise-en-scene')
  expect(ids('unblocking the browser')).not.toContain('blocking')
  expect(ids('解释一下规定情境')).toEqual(['given-circumstances', 'dramatic-situation'])
})

test('entry and exit terminology does not invent an upstage or downstage equivalence', () => {
  for (const [phrase, conceptId, distinction] of [
    ['上场口在哪里？', 'entrance-portal', 'upstage'],
    ['下场口在哪里？', 'exit-portal', 'downstage'],
  ] as const) {
    const result = theatreKnowledgeForInput(phrase).concepts
    expect(result[0]!.id).toBe(conceptId)
    expect(result[0]!.relations).toContainEqual({ type: 'distinct_from', targetId: distinction })
    expect(result.map((concept) => concept.id)).not.toContain('entrance')
  }
  expect(ids('上下场是什么意思？')).not.toContain('upstage')
  expect(ids('上下场是什么意思？')).not.toContain('downstage')
  for (const phrase of ['上下场口有什么用？', '上下場口有什麼用？'])
    expect(ids(phrase).slice(0, 2).sort()).toEqual(['entrance-portal', 'exit-portal'])
  expect(ids('入口是什么意思？')).toContain('entrance')
  expect(ids('台后是什么意思？')).toContain('upstage')
})

test('two explicitly requested theatre terms fit before one-hop contrast references', () => {
  for (const [phrase, directIds] of [
    ['侧台和侧幕有什么区别？', ['stage-wings', 'wing-curtain']],
    ['台口和上场口有什么区别？', ['proscenium-opening', 'entrance-portal']],
    ['最高任务和人物动机怎么理解？', ['super-objective', 'character-motivation']],
  ] as const)
    expect(ids(phrase).slice(0, 2).sort()).toEqual([...directIds].sort())
  for (const concept of DIA_KNOWLEDGE.concepts)
    expect(ids(concept.label), concept.label).toContain(concept.id)
})

test('model evidence preserves catalog authority, examples and source titles without private paths', () => {
  const context = theatreKnowledgeForInput('台左和规定情境是什么意思？')
  for (const reference of context.concepts) {
    const source = lookupCanonical(reference.id)!
    expect(reference.definition).toBe(source.definition)
    expect(reference.authorityRefs).toEqual(source.authorityRefs)
    expect(reference.disputedNotes).toEqual(source.disputedNotes)
    expect(reference.positiveExamples).toEqual(source.positiveExamples)
    expect(reference.contrastExamples).toEqual(source.contrastExamples)
    expect(reference.status).toBe(source.status)
    expect(reference.executionEligibility).toBe(source.executionEligibility)
    for (const ref of reference.sourceRefs)
      expect(ref.title).toBe(
        DIA_KNOWLEDGE.sources.find((item) => item.sourceId === ref.sourceId)!.title,
      )
  }
  expect(context.concepts.find((concept) => concept.id === 'given-circumstances')).toMatchObject({
    authorityTier: 'exam_notes',
    definitionStatus: 'tradition_specific',
    tradition: 'stanislavski_system',
  })
  expect(JSON.stringify(context)).not.toContain('localFileRef')
  expect(JSON.stringify(context)).not.toContain('executableIntents')
  expect(JSON.stringify(context)).not.toContain('D:/Obsidian')
})

test('many or repeated terms stay within the reference budget and do not expand action authority', () => {
  const before = structuredClone(OPEN_CONCEPTS)
  const context = theatreKnowledgeForInput(
    DIA_KNOWLEDGE.concepts.map((concept) => concept.label).join('、'),
  )
  expect(context.concepts.length).toBeGreaterThan(0)
  expect(context.concepts.length).toBeLessThanOrEqual(THEATRE_KNOWLEDGE_LIMITS.concepts)
  expect(new TextEncoder().encode(JSON.stringify(context)).byteLength).toBeLessThanOrEqual(
    THEATRE_KNOWLEDGE_LIMITS.bytes,
  )
  expect(ids('规定情境'.repeat(200))).toEqual(['given-circumstances', 'dramatic-situation'])
  expect(theatreKnowledgeForInput('你好').concepts).toEqual([])
  expect(theatreKnowledgeForInput('你好').truncated).toBe(false)
  expect(theatreKnowledgeForInput('规定情境是什么？').truncated).toBe(false)
  expect(OPEN_CONCEPTS).toEqual(before)
})

test('six explicit terms disclose byte-budget omissions instead of claiming complete evidence', () => {
  const context = theatreKnowledgeForInput(
    '侧幕、台左、《黑奴吁天录》、舞台调度、场面调度、间离效果分别是什么意思？',
  )
  expect(context.concepts.length).toBeLessThan(6)
  expect(context.truncated).toBe(true)
  expect(context.concepts.map((concept) => concept.id)).not.toContain('stage-left')
  expect(new TextEncoder().encode(JSON.stringify(context)).byteLength).toBeLessThanOrEqual(
    THEATRE_KNOWLEDGE_LIMITS.bytes,
  )
})

test('more than six matching concepts disclose the item limit', () => {
  const context = theatreKnowledgeForInput(
    '椅子、桌子、长凳、阶梯、台块、门景片、窗景片分别是什么意思？',
  )
  expect(context.concepts).toHaveLength(THEATRE_KNOWLEDGE_LIMITS.concepts)
  expect(context.truncated).toBe(true)
  expect(new TextEncoder().encode(JSON.stringify(context)).byteLength).toBeLessThanOrEqual(
    THEATRE_KNOWLEDGE_LIMITS.bytes,
  )
})
