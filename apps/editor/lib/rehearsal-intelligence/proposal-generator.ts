import { sceneFactsVersion } from './conversation'
import { ACTIVE_DIMENSIONS, ONTOLOGY_VERSION, PROMPT_VERSION } from './dimensions'
import {
  validateContext,
  validateConversationProposal,
  validateEvidence,
  validateProposal,
} from './proposal-validator'
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
    sceneVersion: context.sceneVersion ?? sceneFactsVersion(context),
  }
  const createdAt = new Date().toISOString()
  const conversation = context.conversation
  const parent = conversation?.previousInteraction?.proposals.find(
    (proposal) => proposal.proposalId === conversation.selectedProposalId,
  )
  const interactionId = crypto.randomUUID()
  return InteractionSchema.parse({
    interactionId,
    sceneId: context.sceneId,
    createdAt,
    envelope: {
      schemaVersion: 1,
      interactionId,
      sceneId: context.sceneId,
      capability: 'rehearse',
      sceneVersion: metadata.sceneVersion,
      status: 'proposed',
      createdAt,
      parentInteractionId: parent ? conversation!.previousInteraction!.interactionId : null,
    },
    ...metadata,
    inputContext: context,
    dramaticState: result.dramaticState,
    proposals: result.proposals.map((content) => {
      const proposalId = crypto.randomUUID()
      const revision = conversation
        ? {
            schemaVersion: 1 as const,
            revisionId: crypto.randomUUID(),
            proposalId,
            rootProposalId: parent?.revision?.rootProposalId ?? parent?.proposalId ?? proposalId,
            parentProposalId: parent?.proposalId ?? null,
            parentInteractionId: parent ? conversation.previousInteraction!.interactionId : null,
            revisionNumber: parent ? (parent.revision?.revisionNumber ?? 0) + 1 : 0,
            humanMessageId: conversation.requestMessageId,
            instruction: context.intention,
            heldPerformerIds: conversation.heldPerformerIds,
            sceneVersion: metadata.sceneVersion,
            createdAt,
          }
        : undefined
      return validateConversationProposal(
        context,
        validateProposal(context, {
          ...content,
          ...metadata,
          proposalId,
          ...(revision ? { revision } : {}),
        }),
      )
    }),
    privateProjectData: true,
    trainingAuthorized: false,
    rightsStatus: context.rightsStatus ?? 'unknown',
    trainingEligible: false,
  })
}
