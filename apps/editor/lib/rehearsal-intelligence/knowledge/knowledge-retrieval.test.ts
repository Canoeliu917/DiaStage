import 'fake-indexeddb/auto'
import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { clearSceneHistory, subscribeSceneCommits, useScene } from '@pascal-app/core'
import { createManualStageGraph } from '../../stage/initial-stage'
import {
  DIA_KNOWLEDGE,
  explainConcept,
  filterByDomain,
  getExecutableIntents,
  type KnowledgeExplanation,
  lookupAlias,
  lookupCanonical,
  lookupRelations,
  lookupSource,
} from './retrieval'
import type {
  KnowledgeDefinitionStatus,
  KnowledgeDomain,
  KnowledgeExecutionEligibility,
  KnowledgeRelation,
  KnowledgeStatus,
} from './schema'

type KnowledgeEvalRow = {
  id: string
  query: {
    kind: 'canonical' | 'alias' | 'domain' | 'relation' | 'source' | 'executable' | 'explain'
    value: string
    status?: KnowledgeStatus
    relationType?: KnowledgeRelation['type']
  }
  expected: {
    result: 'match' | 'ambiguous' | 'not_found' | 'list' | 'source' | 'explanation'
    conceptIds?: string[]
    count?: number
    values?: string[]
    conceptCount?: number
    exampleCount?: number
    containsConceptId?: string
    clarificationRequired?: boolean
    definitionStatus?: KnowledgeDefinitionStatus
    executionEligibility?: KnowledgeExecutionEligibility
    qualification?: KnowledgeExplanation['qualification']
    universal?: false
    containsText?: string
  }
}

const cases = readFileSync(
  resolve(
    import.meta.dir,
    '../../../../../.agents/skills/dia-language-trainer/evals/knowledge-retrieval.jsonl',
  ),
  'utf8',
)
  .trim()
  .split('\n')
  .map((line) => JSON.parse(line) as KnowledgeEvalRow)

test('knowledge retrieval eval contains exactly 55 distinct cases', () => {
  expect(cases).toHaveLength(55)
  expect(new Set(cases.map((row) => row.id)).size).toBe(55)
})

for (const row of cases)
  test(`${row.id}: ${row.query.kind} ${row.query.value}`, () => {
    const expected = row.expected
    if (row.query.kind === 'canonical') {
      const concept = lookupCanonical(row.query.value)
      expect(concept ? 'match' : 'not_found').toBe(expected.result)
      if (expected.conceptIds) expect(concept ? [concept.id] : []).toEqual(expected.conceptIds)
      if (expected.definitionStatus)
        expect(concept?.definitionStatus).toBe(expected.definitionStatus)
      if (expected.executionEligibility)
        expect(concept?.executionEligibility).toBe(expected.executionEligibility)
      return
    }

    if (row.query.kind === 'alias') {
      const result = lookupAlias(row.query.value)
      expect(String(result.kind)).toBe(expected.result)
      const conceptIds =
        result.kind === 'match' ? [result.concept.id] : result.candidates.map((item) => item.id)
      if (expected.conceptIds) expect(conceptIds).toEqual(expected.conceptIds)
      if (expected.clarificationRequired !== undefined) {
        expect(result.kind === 'ambiguous' && result.clarificationRequired).toBe(
          expected.clarificationRequired,
        )
        if (result.kind === 'ambiguous') expect(result.clarification.length).toBeGreaterThan(0)
      }
      return
    }

    if (row.query.kind === 'domain') {
      const concepts = filterByDomain(row.query.value as KnowledgeDomain, row.query.status)
      expect(expected.result).toBe('list')
      if (expected.count !== undefined) expect(concepts).toHaveLength(expected.count)
      if (expected.conceptIds) expect(concepts.map((item) => item.id)).toEqual(expected.conceptIds)
      return
    }

    if (row.query.kind === 'relation') {
      const relations = lookupRelations(row.query.value, row.query.relationType)
      expect(expected.result).toBe('list')
      if (expected.conceptIds)
        expect(relations.map((item) => item.target.id)).toEqual(expected.conceptIds)
      return
    }

    if (row.query.kind === 'source') {
      const result = lookupSource(row.query.value)
      expect(result ? 'source' : 'not_found').toBe(expected.result)
      if (!result) return
      if (expected.conceptCount !== undefined)
        expect(result.concepts).toHaveLength(expected.conceptCount)
      if (expected.exampleCount !== undefined)
        expect(result.examples).toHaveLength(expected.exampleCount)
      if (expected.containsConceptId)
        expect(result.concepts.map((item) => item.id)).toContain(expected.containsConceptId)
      return
    }

    if (row.query.kind === 'executable') {
      expect(expected.result).toBe('list')
      expect(getExecutableIntents(row.query.value)).toEqual(expected.values ?? [])
      return
    }

    const explanation = explainConcept(row.query.value)
    expect(explanation ? 'explanation' : 'not_found').toBe(expected.result)
    if (!explanation) return
    if (expected.conceptIds) expect([explanation.concept.id]).toEqual(expected.conceptIds)
    if (expected.definitionStatus)
      expect(explanation.definitionStatus).toBe(expected.definitionStatus)
    if (expected.qualification) expect(explanation.qualification).toBe(expected.qualification)
    if (expected.universal !== undefined) expect(explanation.universal).toBe(expected.universal)
    if (expected.containsText) expect(explanation.statement).toContain(expected.containsText)
  })

test('theory concepts expose no executable intents and have no StageAction adapter', () => {
  const theoryConcepts = DIA_KNOWLEDGE.concepts.filter(
    (concept) => concept.conceptKind === 'theory_concept',
  )
  expect(theoryConcepts.length).toBeGreaterThan(0)
  for (const concept of theoryConcepts) {
    expect(concept.executionEligibility).not.toBe('allowed')
    expect(getExecutableIntents(concept.id)).toEqual([])
  }
})

test('example sources cannot replace canonical theory definitions', () => {
  const exampleSourceIds = new Set(
    DIA_KNOWLEDGE.sources
      .filter((source) => source.sourceType === 'example_source')
      .map((source) => source.sourceId),
  )
  for (const concept of DIA_KNOWLEDGE.concepts)
    expect(concept.sourceRefs.every((ref) => !exampleSourceIds.has(ref.sourceId))).toBe(true)
  for (const sourceId of exampleSourceIds) {
    const result = lookupSource(sourceId)
    expect(result?.concepts).toEqual([])
    expect(result?.examples.length).toBeGreaterThan(0)
  }
})

test('retrieval has no Formal Scene mutation dependency', () => {
  const source = readFileSync(resolve(import.meta.dir, 'retrieval.ts'), 'utf8')
  expect(source).not.toContain('@pascal-app/core')
  for (const mutationApi of [
    'useScene',
    'setScene',
    'applyNodeChanges',
    'createNode',
    'stage-placement-actions',
    'mapStagePlacementIntent',
    'StageAction',
  ])
    expect(source).not.toContain(mutationApi)
})

test('retrieval returns frozen knowledge rather than a mutable scene authority object', () => {
  const concept = lookupCanonical('stage-left')
  expect(Object.isFrozen(DIA_KNOWLEDGE)).toBe(true)
  expect(Object.isFrozen(concept)).toBe(true)
  expect(Object.isFrozen(concept?.relations)).toBe(true)
})

test('all retrieval paths leave Formal Scene and scene history unchanged', () => {
  const graph = createManualStageGraph({
    type: 'black-box',
    widthMeters: 8,
    depthMeters: 6,
    heightMeters: 3,
  })
  useScene.getState().setScene(graph.nodes, graph.rootNodeIds, graph)
  useScene.getState().setReadOnly(false)
  clearSceneHistory()
  const before = useScene.getState()
  const snapshot = {
    nodes: before.nodes,
    rootNodeIds: before.rootNodeIds,
    collections: before.collections,
    materials: before.materials,
    installedPlugins: before.installedPlugins,
  }
  let commits = 0
  const stop = subscribeSceneCommits(() => {
    commits++
  })
  try {
    lookupCanonical('stage-left')
    lookupAlias('左边')
    filterByDomain('spatial_directing', 'ACTIVE')
    lookupRelations('fold-flat', 'distinct_from')
    lookupSource('dia-src-seagull-cn-v1')
    getExecutableIntents('stage-event')
    explainConcept('stage-zone')

    const after = useScene.getState()
    expect(after.nodes).toBe(snapshot.nodes)
    expect(after.rootNodeIds).toEqual(snapshot.rootNodeIds)
    expect(after.collections).toEqual(snapshot.collections)
    expect(after.materials).toEqual(snapshot.materials)
    expect(after.installedPlugins).toEqual(snapshot.installedPlugins)
    expect(useScene.temporal.getState().pastStates).toHaveLength(0)
    expect(commits).toBe(0)
  } finally {
    stop()
    useScene.getState().unloadScene()
    clearSceneHistory()
  }
})
