import { ACTIVE_DIMENSIONS, ONTOLOGY_VERSION, PROMPT_VERSION } from './dimensions'
import { validateContext, validateEvidence, validateProposal } from './proposal-validator'
import { AgentOutputSchema, InteractionSchema } from './schema'

export function createInteraction(input: unknown, output: unknown, modelVersion: string) {
  const context = validateContext(input),
    result = AgentOutputSchema.parse(output)
  for (const state of result.dramaticState) {
    if (!context.performers.some((p) => p.id === state.character))
      throw new Error('分析引用了不存在的人物')
    validateEvidence(context, state.evidence)
  }
  const metadata = {
    modelVersion,
    ontologyVersion: ONTOLOGY_VERSION,
    promptVersion: PROMPT_VERSION,
    activeDimensions: [...ACTIVE_DIMENSIONS],
  }
  return InteractionSchema.parse({
    interactionId: crypto.randomUUID(),
    sceneId: context.sceneId,
    createdAt: new Date().toISOString(),
    ...metadata,
    inputContext: context,
    dramaticState: result.dramaticState,
    proposals: result.proposals.map((proposal) =>
      validateProposal(context, { ...proposal, ...metadata, proposalId: crypto.randomUUID() }),
    ),
    privateProjectData: true,
    trainingAuthorized: false,
  })
}
