import { proposalActionSignature, sceneFactsVersion } from './conversation'
import { ACTIVE_DIMENSIONS } from './dimensions'
import { compileProposal } from './proposal-compiler'
import {
  InteractionSchema,
  type RehearsalContext,
  RehearsalContextSchema,
  RehearsalProposalSchema,
} from './schema'

export function validateContext(raw: unknown): RehearsalContext {
  const context = RehearsalContextSchema.parse(raw)
  const ids = context.performers.map((p) => p.id)
  if (
    new Set(ids).size !== ids.length ||
    (context.selectedPerformerId && !ids.includes(context.selectedPerformerId))
  )
    throw new Error('人物引用无效，请重新选择人物')
  if (JSON.stringify(context.activeDimensions) !== JSON.stringify(ACTIVE_DIMENSIONS))
    throw new Error('排演维度版本不匹配，请刷新页面')
  for (const path of context.paths)
    if (!ids.includes(path.performerId)) throw new Error('路线引用了不存在的人物')
  for (const obstacle of context.obstacles)
    if (obstacle.min.some((x, axis) => x > obstacle.max[axis]!)) throw new Error('布景边界无效')
  if (new Set(context.obstacles.map((obstacle) => obstacle.id)).size !== context.obstacles.length)
    throw new Error('布景编号重复，请检查目标物件')
  if (context.sceneVersion && context.sceneVersion !== sceneFactsVersion(context))
    throw new Error('舞台版本与当前事实不匹配，请重新生成')
  const conversation = context.conversation
  if (conversation) {
    if (conversation.sceneId !== context.sceneId) throw new Error('对话属于其他场景')
    const message = conversation.recentMessages.find(
      (m) => m.messageId === conversation.requestMessageId,
    )
    if (message?.role !== 'user' || message.content !== context.intention)
      throw new Error('当前对话消息与排演意图不匹配')
    if (message.sceneVersion !== sceneFactsVersion(context))
      throw new Error('舞台已经变化，请重新生成')
    if (
      new Set(conversation.recentMessages.map((m) => m.messageId)).size !==
      conversation.recentMessages.length
    )
      throw new Error('对话消息编号重复')
    const previous = conversation.previousInteraction?.proposals ?? []
    if (
      new Set(previous.map((p) => p.proposalId)).size !== previous.length ||
      (conversation.selectedProposalId &&
        !previous.some((p) => p.proposalId === conversation.selectedProposalId))
    )
      throw new Error('上一轮方案引用无效')
    if (
      new Set(conversation.heldPerformerIds).size !== conversation.heldPerformerIds.length ||
      conversation.heldPerformerIds.some(
        (id) => !context.performers.some((p) => p.id === id && p.visible),
      )
    )
      throw new Error('要求保持位置的人物已不存在，请重新确认')
  }
  return context
}

export function validateEvidence(
  context: RehearsalContext,
  evidence: { source: 'script' | 'intention' | 'director'; quote: string }[],
) {
  const sources = {
    script: context.script,
    intention: context.intention,
    director: context.directorIntention,
  }
  if (evidence.some((e) => !sources[e.source].includes(e.quote)))
    throw new Error('建议引用了未提供的文字，请重新生成')
}

export function validateProposal(context: RehearsalContext, raw: unknown) {
  const proposal = RehearsalProposalSchema.parse(raw)
  if (JSON.stringify(proposal.activeDimensions) !== JSON.stringify(ACTIVE_DIMENSIONS))
    throw new Error('建议维度不匹配')
  if (new Set(proposal.suggestions.map((s) => s.id)).size !== proposal.suggestions.length)
    throw new Error('建议编号重复')
  if (proposal.sceneVersion && proposal.sceneVersion !== sceneFactsVersion(context))
    throw new Error('舞台已经变化，请重新生成')
  validateEvidence(context, proposal.evidence)
  if (
    /唯一正确|必须这样演|唯一答案|only correct|only right/i.test(
      `${proposal.title} ${proposal.rationale} ${proposal.intention}`,
    )
  )
    throw new Error('建议不能替导演决定唯一答案')
  compileProposal(context, proposal)
  return proposal
}

export function validateConversationProposal(
  context: RehearsalContext,
  proposal: ReturnType<typeof validateProposal>,
) {
  const conversation = context.conversation
  if (!conversation) return proposal
  const parent = conversation.previousInteraction?.proposals.find(
    (entry) => entry.proposalId === conversation.selectedProposalId,
  )
  const revision = proposal.revision
  if (
    !revision ||
    revision.proposalId !== proposal.proposalId ||
    revision.humanMessageId !== conversation.requestMessageId ||
    revision.instruction !== context.intention ||
    revision.sceneVersion !== sceneFactsVersion(context) ||
    proposal.sceneVersion !== revision.sceneVersion ||
    revision.parentProposalId !== (parent?.proposalId ?? null) ||
    revision.parentInteractionId !==
      (parent ? conversation.previousInteraction!.interactionId : null) ||
    revision.rootProposalId !==
      (parent?.revision?.rootProposalId ?? parent?.proposalId ?? proposal.proposalId) ||
    revision.revisionNumber !== (parent ? (parent.revision?.revisionNumber ?? 0) + 1 : 0) ||
    JSON.stringify(revision.heldPerformerIds) !== JSON.stringify(conversation.heldPerformerIds)
  )
    throw new Error('方案修订与当前对话血缘不匹配，请重新生成')
  if (
    conversation.heldPerformerIds.some(
      (id) => !proposal.suggestions.some((s) => s.performerId === id && s.movement === 'hold'),
    )
  )
    throw new Error('建议没有保留你要求不动的人物，请重新生成')
  if (conversation.rejectedProposalSignatures.includes(proposalActionSignature(proposal)))
    throw new Error('这与已拒绝的行动方案相同，请换一个方向')
  return proposal
}

export function validateInteraction(raw: unknown) {
  const interaction = InteractionSchema.parse(raw)
  const context = validateContext(interaction.inputContext)
  if (
    interaction.sceneId !== context.sceneId ||
    (interaction.sceneVersion && interaction.sceneVersion !== sceneFactsVersion(context))
  )
    throw new Error('响应与当前场景版本不匹配')
  for (const state of interaction.dramaticState) {
    if (!context.performers.some((p) => p.id === state.character))
      throw new Error('分析引用了不存在的人物')
    validateEvidence(context, state.evidence)
  }
  for (const proposal of interaction.proposals)
    validateConversationProposal(context, validateProposal(context, proposal))
  return interaction
}
