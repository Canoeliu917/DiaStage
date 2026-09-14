import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { groundLanguage } from '../language-grounding'
import { STAGE_PROPOSAL_CASES, stageProposalEvalContext } from '../stage-proposal-test-fixture'
import { lookupCanonical } from './retrieval'
import { DiaStageProposalSchema } from './stage-proposal'

for (const row of STAGE_PROPOSAL_CASES)
  test(`B. Knowledge / Intent Eval ${row.id}: ${row.input}`, () => {
    const grounded = groundLanguage(row.input, stageProposalEvalContext(row))
    const proposal = DiaStageProposalSchema.parse(grounded?.placement?.knowledgeProposal)
    const conceptIds = proposal.resolvedConcepts.map((concept) => concept.id)
    for (const conceptId of row.expected.conceptIds) expect(conceptIds).toContain(conceptId)
    expect(proposal.actions.map((action) => action.type)).toEqual(row.expected.proposalActions)
    expect(proposal.constraints.map((constraint) => constraint.type)).toEqual(
      row.expected.constraints,
    )
    expect(proposal.status).toBe('preview_only')
    expect(proposal.knowledgeRefs.length).toBeGreaterThan(0)
    expect(JSON.stringify(proposal)).not.toMatch(/"(?:position|rotation|transform|xyz)"\s*:/i)
    for (const action of proposal.actions)
      for (const conceptId of action.knowledgeConceptIds) {
        const concept = proposal.resolvedConcepts.find((candidate) => candidate.id === conceptId)
        expect(concept).toMatchObject({ status: 'ACTIVE', executionEligibility: 'allowed' })
      }
  })

test('B. Knowledge / Intent Eval preserves aliases, authority and execution boundaries', () => {
  const straight = groundLanguage(
    STAGE_PROPOSAL_CASES[1]!.input,
    stageProposalEvalContext(STAGE_PROPOSAL_CASES[1]!),
  )!.placement!.knowledgeProposal!
  expect(straight.resolvedConcepts.map((concept) => concept.id)).toContain('splice')
  expect(straight.resolvedConcepts.map((concept) => concept.id)).not.toContain('connect-edge')

  const stack = groundLanguage(
    STAGE_PROPOSAL_CASES[0]!.input,
    stageProposalEvalContext(STAGE_PROPOSAL_CASES[0]!),
  )!.placement!.knowledgeProposal!
  expect(stack.actions[0]).toMatchObject({
    type: 'stack_on',
    sourceIntent: 'existing_placement:stack_on',
  })
  expect(stack.resolvedConcepts.map((concept) => concept.id)).not.toContain('stack-on')

  const ambiguous = groundLanguage(
    STAGE_PROPOSAL_CASES[8]!.input,
    stageProposalEvalContext(STAGE_PROPOSAL_CASES[8]!),
  )!.placement!.knowledgeProposal!
  expect(ambiguous.ambiguities[0]?.candidates).toEqual([
    'stage-left',
    'audience-left',
    'relative-left',
    'object-left',
  ])

  const stageLeft = groundLanguage(
    STAGE_PROPOSAL_CASES[6]!.input,
    stageProposalEvalContext(STAGE_PROPOSAL_CASES[6]!),
  )!.placement!.knowledgeProposal!.resolvedConcepts.find((concept) => concept.id === 'stage-left')!
  expect(stageLeft.relations).toContainEqual({
    type: 'same_spatial_side_as',
    targetId: 'audience-right',
  })
  expect(stageLeft.tradition).toBe('professional_stagecraft')

  const heuristic = groundLanguage(
    STAGE_PROPOSAL_CASES[9]!.input,
    stageProposalEvalContext(STAGE_PROPOSAL_CASES[9]!),
  )!.placement!.knowledgeProposal!
  expect(heuristic.actions).toEqual([])
  expect(heuristic.resolvedConcepts.find((concept) => concept.id === 'stage-zone')).toMatchObject({
    status: 'OBSERVE',
    executionEligibility: 'proposal_only',
    definitionStatus: 'heuristic',
  })
  expect(heuristic.rationale).toContain('非普遍规律')
  expect(
    heuristic.resolvedConcepts.find((concept) => concept.id === 'stage-zone')?.disputedNotes[0],
  ).toContain('不是普遍规律')
})

test('B. Knowledge / Intent Eval gives theory and FUTURE language no StageAction', () => {
  const context = stageProposalEvalContext(STAGE_PROPOSAL_CASES[9]!)
  for (const input of ['最高任务是什么', '帮我训练独白重音']) {
    const grounded = groundLanguage(input, context)
    expect(grounded?.placement).toBeUndefined()
  }
})

test('B. schema rejects unrelated action authority and knowledge-only constraints', () => {
  const straight = structuredClone(
    groundLanguage(
      STAGE_PROPOSAL_CASES[1]!.input,
      stageProposalEvalContext(STAGE_PROPOSAL_CASES[1]!),
    )!.placement!.knowledgeProposal!,
  )
  straight.actions[0]!.knowledgeConceptIds = ['scenic-flat']
  const unrelated = DiaStageProposalSchema.safeParse(straight)
  expect(unrelated.success).toBe(false)
  if (!unrelated.success)
    expect(unrelated.error.issues.some((issue) => issue.message.includes('executableIntent'))).toBe(
      true,
    )

  const constrained = structuredClone(
    groundLanguage(
      STAGE_PROPOSAL_CASES[5]!.input,
      stageProposalEvalContext(STAGE_PROPOSAL_CASES[5]!),
    )!.placement!.knowledgeProposal!,
  )
  const future = lookupCanonical('monologue-training')!
  constrained.resolvedConcepts.push({
    id: future.id,
    canonicalLabel: future.canonicalLabel,
    conceptKind: future.conceptKind,
    status: future.status,
    executionEligibility: future.executionEligibility,
    authorityTier: future.authorityTier,
    definitionStatus: future.definitionStatus,
    tradition: future.tradition,
    disputedNotes: [...future.disputedNotes],
    relations: future.relations.map((relation) => ({ ...relation })),
    executableIntents: [...future.executableIntents],
    sourceRefs: future.sourceRefs.map((reference) => ({ ...reference })),
  })
  constrained.constraints[0]!.knowledgeConceptIds = [future.id]
  const knowledgeOnly = DiaStageProposalSchema.safeParse(constrained)
  expect(knowledgeOnly.success).toBe(false)
  if (!knowledgeOnly.success)
    expect(
      knowledgeOnly.error.issues.some((issue) => issue.message.includes('knowledge_only')),
    ).toBe(true)
})

test('B. Knowledge adapter has no Scene mutation dependency', () => {
  const source = readFileSync(resolve(import.meta.dir, 'stage-proposal.ts'), 'utf8')
  expect(source).not.toContain('@pascal-app/core')
  for (const mutation of [
    'useScene',
    'setScene',
    'updateNode',
    'applyNodeChanges',
    'executeStageCommands',
    'runAsSingleSceneHistoryStep',
  ])
    expect(source).not.toContain(mutation)
})
