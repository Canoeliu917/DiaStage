import { describe, expect, test } from 'bun:test'
import {
  DIA_KNOWLEDGE,
  getExecutableIntents,
  lookupAlias,
  validateKnowledgeCatalog,
} from './retrieval'

const concept = (id: string) => DIA_KNOWLEDGE.concepts.find((item) => item.id === id)!

function distribution(
  field: 'conceptKind' | 'definitionStatus' | 'authorityTier' | 'status' | 'executionEligibility',
) {
  return Object.fromEntries(
    Object.entries(
      DIA_KNOWLEDGE.concepts.reduce<Record<string, number>>((counts, item) => {
        counts[item[field]] = (counts[item[field]] ?? 0) + 1
        return counts
      }, {}),
    ).sort(([a], [b]) => a.localeCompare(b)),
  )
}

describe('Dia Knowledge Schema Hygiene V0.1', () => {
  test('classifies all 123 current concepts', () => {
    expect(DIA_KNOWLEDGE.concepts).toHaveLength(123)
    expect(distribution('conceptKind')).toEqual({
      asset: 17,
      historical_entity: 1,
      operation: 7,
      spatial_relation: 13,
      stage_term: 12,
      theory_concept: 73,
    })
  })

  test('retired single flats expose no aliases, relationships or placement intent', () => {
    expect(concept('single-flat')).toBeUndefined()
    expect(lookupAlias('单片景片').kind).toBe('not_found')
    expect(lookupAlias('单联景片').kind).toBe('not_found')
    expect(getExecutableIntents('single-flat')).toEqual([])
    for (const item of DIA_KNOWLEDGE.concepts) {
      expect(item.relations.some((relation) => relation.targetId === 'single-flat')).toBe(false)
      expect(item.executableIntents).not.toContain('place_single_flat')
    }
    for (const id of [
      'scenic-flat',
      'door-flat',
      'window-flat',
      'double-fold-flat',
      'triple-fold-flat',
    ])
      expect(getExecutableIntents(id).length).toBeGreaterThan(0)
  })

  test('uses heuristic only for the actual stage-zone analysis rule', () => {
    expect(distribution('definitionStatus')).toEqual({
      canonical: 6,
      descriptive: 76,
      heuristic: 1,
      operational: 26,
      tradition_specific: 9,
      translation_variant: 5,
    })
    expect(
      DIA_KNOWLEDGE.concepts
        .filter((item) => item.definitionStatus === 'heuristic')
        .map((item) => item.id),
    ).toEqual(['stage-zone'])
    for (const id of [
      'scenic-flat',
      'entrance',
      'passage',
      'fold-flat',
      'join',
      'platform',
      'occlusion',
    ])
      expect(concept(id).definitionStatus).not.toBe('heuristic')
  })

  test('keeps authority and activation independent', () => {
    expect(distribution('authorityTier')).toEqual({
      exam_notes: 113,
      institutional_teaching: 9,
      peer_reviewed: 1,
    })
    expect(distribution('status')).toEqual({ ACTIVE: 49, FUTURE: 33, OBSERVE: 41 })
    expect(
      DIA_KNOWLEDGE.concepts.some(
        (item) => item.status === 'ACTIVE' && item.authorityTier === 'exam_notes',
      ),
    ).toBe(true)
    expect(concept('alienation-effect')).toMatchObject({
      status: 'OBSERVE',
      authorityTier: 'institutional_teaching',
    })
  })

  test('gates execution independently from concept status and authority', () => {
    expect(distribution('executionEligibility')).toEqual({
      allowed: 43,
      knowledge_only: 34,
      proposal_only: 46,
    })
    expect(concept('stage-left')).toMatchObject({
      status: 'ACTIVE',
      executionEligibility: 'allowed',
    })
    expect(concept('stage-object')).toMatchObject({
      status: 'ACTIVE',
      executionEligibility: 'proposal_only',
    })
    expect(
      DIA_KNOWLEDGE.concepts
        .filter((item) => item.conceptKind === 'theory_concept')
        .every((item) => item.executionEligibility !== 'allowed'),
    ).toBe(true)
    expect(getExecutableIntents('stage-left')).toEqual(['place_stage_left'])
    expect(getExecutableIntents('stage-object')).toEqual([])
    expect(getExecutableIntents('super-objective')).toEqual([])
  })

  test('classifies representative stage concepts by kind', () => {
    expect(concept('stage-left').conceptKind).toBe('stage_term')
    expect(concept('scenic-flat').conceptKind).toBe('asset')
    expect(concept('join').conceptKind).toBe('operation')
    expect(concept('near').conceptKind).toBe('spatial_relation')
    expect(concept('given-circumstances').conceptKind).toBe('theory_concept')
    expect(concept('black-slaves-cry-to-heaven')).toMatchObject({
      conceptKind: 'historical_entity',
      definitionStatus: 'descriptive',
      executionEligibility: 'knowledge_only',
    })
  })

  test('marks all script layouts as descriptive, knowledge-only example patterns', () => {
    expect(DIA_KNOWLEDGE.sceneExamples).toHaveLength(9)
    expect(
      DIA_KNOWLEDGE.sceneExamples.every(
        (item) =>
          item.conceptKind === 'example_pattern' &&
          item.definitionStatus === 'descriptive' &&
          item.executionEligibility === 'knowledge_only',
      ),
    ).toBe(true)
  })

  test('maps requested operation examples onto existing concepts without growing the catalog', () => {
    expect(lookupAlias('connect-edge')).toMatchObject({ kind: 'match', concept: { id: 'splice' } })
    expect(lookupAlias('fold-hinge')).toMatchObject({ kind: 'match', concept: { id: 'fold-flat' } })
    expect(lookupAlias('near-object')).toMatchObject({ kind: 'match', concept: { id: 'near' } })
  })

  test('semantic validation rejects type/status misuse', () => {
    const heuristicAsset = structuredClone(DIA_KNOWLEDGE)
    heuristicAsset.concepts.find((item) => item.id === 'scenic-flat')!.definitionStatus =
      'heuristic'
    expect(() => validateKnowledgeCatalog(heuristicAsset)).toThrow('heuristic')

    const executableTheory = structuredClone(DIA_KNOWLEDGE)
    const superObjective = executableTheory.concepts.find((item) => item.id === 'super-objective')!
    superObjective.status = 'ACTIVE'
    superObjective.executionEligibility = 'allowed'
    superObjective.executableIntents = ['mutate_scene']
    expect(() => validateKnowledgeCatalog(executableTheory)).toThrow('theory_concept')

    const proposalWithIntent = structuredClone(DIA_KNOWLEDGE)
    proposalWithIntent.concepts.find((item) => item.id === 'stage-object')!.executableIntents = [
      'mutate_scene',
    ]
    expect(() => validateKnowledgeCatalog(proposalWithIntent)).toThrow('非 allowed')

    const crossCollectionId = structuredClone(DIA_KNOWLEDGE)
    crossCollectionId.sceneExamples[0]!.id = 'stage-left'
    expect(() => validateKnowledgeCatalog(crossCollectionId)).toThrow('跨集合重复')
  })
})
