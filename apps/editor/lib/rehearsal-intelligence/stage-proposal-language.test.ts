import { expect, test } from 'bun:test'
import { groundLanguage } from './language-grounding'
import { mapStagePlacementIntent } from './stage-placement-actions'
import { parseStagePlacementIntent } from './stage-placement-intents'
import { STAGE_PROPOSAL_CASES, stageProposalEvalContext } from './stage-proposal-test-fixture'

test('A. Language Eval contains the 10 requested acceptance phrases', () => {
  expect(STAGE_PROPOSAL_CASES).toHaveLength(10)
  expect(new Set(STAGE_PROPOSAL_CASES.map((row) => row.id)).size).toBe(10)
})

for (const row of STAGE_PROPOSAL_CASES)
  test(`A. Language Eval ${row.id}: ${row.input}`, () => {
    const context = stageProposalEvalContext(row)
    const intent = parseStagePlacementIntent(row.input)
    expect(intent?.kind).toBe(row.expected.intent)
    const placement = mapStagePlacementIntent(intent!, context)
    expect(placement.status).toBe(row.expected.placementStatus)
    expect(placement.actions.map((action) => action.type)).toEqual(row.expected.stageActions)

    const grounded = groundLanguage(row.input, context)
    expect(grounded?.placement?.intent.kind).toBe(row.expected.intent)
    expect(grounded?.plan).toBeUndefined()
  })

test('A. Language Eval keeps underspecified scenic operations as clarification', () => {
  const context = stageProposalEvalContext(STAGE_PROPOSAL_CASES[1]!)
  for (const input of ['把景片拼起来', '三联景片收一点']) {
    const grounded = groundLanguage(input, { ...context, selectedObjectIds: [] })
    expect(grounded?.placement?.knowledgeProposal?.actions.every((action) => !action.target)).toBe(
      true,
    )
    expect(grounded?.placement?.knowledgeProposal?.ambiguities.length).toBeGreaterThan(0)
  }
})
