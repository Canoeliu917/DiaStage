import { ACTIVE_DIMENSIONS } from './dimensions'
import { compileProposal } from './proposal-compiler'
import { type RehearsalContext, RehearsalContextSchema, RehearsalProposalSchema } from './schema'

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
