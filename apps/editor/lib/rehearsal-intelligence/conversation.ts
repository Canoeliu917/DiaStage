import { discussionDirection } from './dia-backbone'
import {
  type ConversationContext,
  ConversationContextSchema,
  type Interaction,
  type RecentDecision,
  type RehearsalContext,
  type RehearsalProposal,
  type RehearsalThread,
  RehearsalThreadSchema,
  type ThreadMessage,
  ThreadMessageSchema,
} from './schema'

export {
  type ConversationContext,
  ConversationContextSchema,
  type DiaStatus,
  DiaStatusSchema,
  type ProposalRevision,
  ProposalRevisionSchema,
  type RecentDecision,
  type RehearsalThread,
  RehearsalThreadSchema,
  type ThreadMessage,
  ThreadMessageSchema,
} from './schema'

export function sceneFactsVersion(
  context: Pick<
    RehearsalContext,
    'sceneId' | 'productionId' | 'venue' | 'performers' | 'paths' | 'durationSeconds' | 'obstacles'
  >,
) {
  const ordered = <T extends { id: string }>(items: T[]) =>
    [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const facts = JSON.stringify({
    sceneId: context.sceneId,
    productionId: context.productionId,
    venue: [
      context.venue.id,
      context.venue.name,
      context.venue.type,
      context.venue.origin,
      context.venue.width,
      context.venue.depth,
      context.venue.height,
    ],
    performers: ordered(context.performers).map((p) => [
      p.id,
      p.name,
      p.color,
      p.position,
      p.facing,
      p.visible,
    ]),
    paths: ordered(context.paths).map((p) => [
      p.id,
      p.performerId,
      p.points,
      p.durationSeconds,
      p.visible,
    ]),
    durationSeconds: context.durationSeconds,
    obstacles: ordered(context.obstacles).map((o) => [o.id, o.name, o.min, o.max]),
  })
  // This checksum labels facts; adoption still compares the complete current context.
  let hash = 14695981039346656037n
  for (let i = 0; i < facts.length; i++)
    hash = BigInt.asUintN(64, (hash ^ BigInt(facts.charCodeAt(i))) * 1099511628211n)
  return `scene-v1-${hash.toString(16).padStart(16, '0')}`
}

export function createRehearsalThread(sceneId: string, sceneVersion: string): RehearsalThread {
  const now = new Date().toISOString()
  return RehearsalThreadSchema.parse({
    schemaVersion: 1,
    threadId: crypto.randomUUID(),
    sceneId,
    createdAt: now,
    updatedAt: now,
    messages: [],
    activeInteractionId: null,
    selectedProposalId: null,
    sceneVersion,
    status: 'idle',
  })
}

export function proposalActionSignature(proposal: Pick<RehearsalProposal, 'suggestions'>) {
  return JSON.stringify(
    [...proposal.suggestions]
      .sort((a, b) => (a.performerId < b.performerId ? -1 : a.performerId > b.performerId ? 1 : 0))
      .map((suggestion) =>
        suggestion.movement === 'hold'
          ? [suggestion.performerId, 'hold']
          : [
              suggestion.performerId,
              suggestion.movement,
              suggestion.targetPerformerId,
              suggestion.zone,
              suggestion.extent,
              suggestion.pace,
              ...(suggestion.targetObjectId ? [suggestion.targetObjectId] : []),
            ],
      ),
  )
}

export function heldPerformersForMessage(
  content: string,
  performers: RehearsalContext['performers'],
) {
  const heldPerformerIds: string[] = []
  const names = new Map<string, string>()
  const escapePattern = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  for (const performer of performers) {
    for (const name of new Set([performer.id, performer.name])) {
      const pattern = new RegExp(
        `(?<![A-Za-z0-9_])${escapePattern(name)}(?![A-Za-z0-9_])\\s*(?:(?:先|暂时|这轮)\\s*)?(?:(?:不要|别|不)(?:再)?(?:动|走|移动)|保持(?:现在的)?(?:位置|原位|不动))`,
        'i',
      )
      if (!pattern.test(content)) continue
      const previous = names.get(name.toLowerCase())
      if (previous && previous !== performer.id)
        throw new Error('人物名称重复，请明确要保持位置的人物')
      names.set(name.toLowerCase(), performer.id)
      if (!heldPerformerIds.includes(performer.id)) heldPerformerIds.push(performer.id)
    }
  }
  return heldPerformerIds
}

export function conversationContext(
  rawThread: RehearsalThread,
  interaction: Interaction | null,
  selectedProposalId: string | null,
  rawMessage: ThreadMessage,
  recentDecision?: RecentDecision,
  currentPerformers?: RehearsalContext['performers'],
): ConversationContext {
  const thread = RehearsalThreadSchema.parse(rawThread)
  const userMessage = ThreadMessageSchema.parse(rawMessage)
  if (userMessage.role !== 'user' || userMessage.content.length > 2000)
    throw new Error('请发送不超过2000字的当前排演想法')
  if (userMessage.sceneVersion !== thread.sceneVersion) throw new Error('舞台已经变化，请重新发送')
  if (interaction && interaction.sceneId !== thread.sceneId)
    throw new Error('上轮排演属于其他场景，请重新生成')
  const proposals = interaction?.proposals ?? []
  const ordinals = [
    ...userMessage.content.matchAll(
      /(?:第\s*([一二三123])\s*(?:个|种|套|条)|方案\s*([一二三123]))/g,
    ),
  ].map((match) => {
    const value = (match[1] ?? match[2])!
    return '一二三'.indexOf(value) + 1 || Number(value)
  })
  if (new Set(ordinals).size > 1) throw new Error('请明确本轮要修改哪一个方案')
  if (
    ordinals.length &&
    !(
      !interaction && discussionDirection(userMessage.content, thread.messages, thread.sceneVersion)
    )
  ) {
    const selected = proposals[ordinals[0]! - 1]
    if (!selected) throw new Error('上一轮没有这个方案，请重新选择')
    selectedProposalId = selected.proposalId
  }
  if (
    selectedProposalId &&
    !proposals.some((proposal) => proposal.proposalId === selectedProposalId)
  )
    throw new Error('没有找到选中的上一轮方案')
  const heldPerformerIds = heldPerformersForMessage(
    userMessage.content,
    currentPerformers ?? interaction?.inputContext.performers ?? [],
  )
  const recentMessages = [
    ...thread.messages.filter((message) => message.messageId !== userMessage.messageId),
    userMessage,
  ]
    .filter((message) => message.status !== 'stale' && message.status !== 'failed')
    .slice(-8)
  while (recentMessages.reduce((total, message) => total + message.content.length, 0) > 6000)
    recentMessages.shift()
  return ConversationContextSchema.parse({
    schemaVersion: 1,
    threadId: thread.threadId,
    sceneId: thread.sceneId,
    requestMessageId: userMessage.messageId,
    recentMessages,
    previousInteraction: interaction
      ? {
          interactionId: interaction.interactionId,
          sceneVersion:
            interaction.sceneVersion ??
            interaction.inputContext.sceneVersion ??
            sceneFactsVersion(interaction.inputContext),
          proposals,
        }
      : null,
    selectedProposalId,
    heldPerformerIds,
    rejectedProposalSignatures: thread.rejectedProposalSignatures,
    recentDecision: recentDecision ?? null,
  })
}
