import { SceneContextSummarySchema, StagePlanSchema } from '@pascal-app/core/stage'
import { z } from 'zod'
import { InteractionEnvelopeSchema } from './interaction-envelope'
import { RehearsalContextSchema, type ThreadMessage } from './schema'

export const DiaBuildProposalSchema = z
  .strictObject({
    id: z.string().uuid(),
    sceneId: z.string().min(1).optional(),
    envelope: InteractionEnvelopeSchema.optional(),
    parentId: z.string().uuid().nullable(),
    createdAt: z.iso.datetime(),
    input: z.string().min(1).max(2000),
    sceneVersion: z.string().min(1),
    sourceContentVersion: z.string().optional(),
    context: SceneContextSummarySchema,
    plan: StagePlanSchema,
    originalPlan: StagePlanSchema,
    previewedPlan: StagePlanSchema.nullable(),
    status: z.enum(['proposed', 'previewed', 'prepared', 'applied', 'rejected']),
    finalSceneVersion: z.string().nullable(),
    privateProjectData: z.literal(true),
    trainingAuthorized: z.literal(false),
  })
  .superRefine((proposal, ctx) => {
    const envelope = proposal.envelope
    if (
      envelope &&
      (envelope.capability !== 'build' ||
        envelope.interactionId !== proposal.id ||
        envelope.sceneId !== proposal.sceneId ||
        envelope.sceneVersion !== proposal.sceneVersion ||
        envelope.status !== proposal.status ||
        envelope.createdAt !== proposal.createdAt ||
        (envelope.parentInteractionId ?? null) !== proposal.parentId)
    )
      ctx.addIssue({ code: 'custom', message: '搭台建议与交互引用不一致，原记录已保留' })
  })
export type DiaBuildProposal = z.infer<typeof DiaBuildProposalSchema>

export const BuildFeedbackSchema = z
  .strictObject({
    eventId: z.string().min(1),
    sceneId: z.string().min(1),
    interactionId: z.string().uuid(),
    createdAt: z.iso.datetime(),
    kind: z.enum([
      'proposal',
      'revision',
      'edit',
      'preview',
      'adopt',
      'undo',
      'redo',
      'manual-edit',
      'final-state',
      'version-link',
      'reject',
    ]),
    status: z.enum(['recorded', 'prepared', 'applied']),
    proposal: DiaBuildProposalSchema,
    envelope: InteractionEnvelopeSchema,
    resultSceneVersion: z.string().optional(),
    resultContentVersion: z.string().optional(),
    journalSequence: z.number().int().nonnegative().optional(),
    finalState: z.enum(['applied', 'undone', 'modified']).optional(),
    finalContext: RehearsalContextSchema.extend({
      performers: RehearsalContextSchema.shape.performers.element.array().max(24),
    }).optional(),
    versionId: z.string().optional(),
    privateProjectData: z.literal(true),
    trainingAuthorized: z.literal(false),
    trainingEligible: z.literal(false),
  })
  .superRefine((event, ctx) => {
    if (
      event.interactionId !== event.proposal.id ||
      (event.kind === 'adopt' && event.eventId !== event.interactionId) ||
      event.envelope.interactionId !== event.interactionId ||
      event.envelope.sceneId !== event.sceneId ||
      event.proposal.sceneId !== event.sceneId ||
      event.envelope.capability !== 'build' ||
      event.envelope.sceneVersion !== event.proposal.sceneVersion ||
      event.envelope.status !==
        (event.kind === 'adopt' || event.status === 'applied'
          ? event.status
          : event.proposal.status)
    )
      ctx.addIssue({ code: 'custom', message: '搭台反馈与交互引用不一致，原记录已保留' })
  })
export type BuildFeedback = z.infer<typeof BuildFeedbackSchema>

/** Routing selects a controlled capability; it never grants scene-write authority. */
export function diaIntent(text: string, hasBuildDraft = false, performerNames: string[] = []) {
  if (/复台|换.*场地|(?:版本|第[一二三四五六七八九十\d]+版).*(?:放到|带到|搬到)/.test(text))
    return 'remount'
  if (/版本|第[一二三四五六七八九十\d]+版/.test(text)) return 'version'
  if (/为什么|为何|感觉.*平|这里不好|这段不好|还是不对|怎么理解|讨论/.test(text)) return 'reflect'
  const scenery = /桌|椅|门|景片|平台|台阶|踏步|体块|布景|沙发|舞台.*(?:宽|深)|选中.*对齐/.test(
    text,
  )
  const actor =
    /(?:^|[，,。\s])(?:[A-Z]|人物[^，,。\s]{0,6})(?:站|靠|走|到|在)|人物|角色|路线/.test(text) ||
    text.split(/[，,。；;\n]/).some((clause) => {
      const content = clause.trim().replace(/^(?:请)?(?:让)?/, '')
      return performerNames.some(
        (name) =>
          content.startsWith(name) &&
          /^(?:站|靠|走|到|在|别|不要)/.test(content.slice(name.length).trim()),
      )
    })
  if (actor) {
    const buildClause = text
      .split(/[，,。；;\n]/)
      .some(
        (clause) =>
          /桌|椅|门|景片|平台|台阶|踏步|体块|布景/.test(clause) &&
          /给我|添加|增加|放一|放两|一张|两把|一扇|移动.*(?:桌|椅|门)/.test(clause),
      )
    return buildClause ? 'mixed' : 'rehearse'
  }
  if (scenery || (hasBuildDraft && /它|这个|一点|往|调整|改/.test(text))) return 'build'
  return 'rehearse'
}

const DISCUSSION_CHOICES =
  '1. 保持一个人不动，让另一个人尝试靠近；2. 让两个人拉开距离，看看目标是否更清楚。'

export function discussionDirection(text: string, messages: ThreadMessage[], sceneVersion: string) {
  const last = [...messages].reverse().find((message) => message.role === 'dia')
  if (last?.sceneVersion !== sceneVersion || !last.content.includes(DISCUSSION_CHOICES)) return null
  const choice = text.match(/^\s*第([一二12])个(?:方向)?(?:试试|试一下|继续|好)?[。！!\s]*$/)
  return choice ? (choice[1] === '一' || choice[1] === '1' ? 1 : 2) : null
}

export function discussStage(performerNames: string[], pathCount: number) {
  const facts = performerNames.length
    ? `当前舞台有 ${performerNames.join('、')}，记录了 ${pathCount} 条行动路线。`
    : '当前场地还没有人物，可以先搭台，或手动添加人物。'
  return `${facts}现在还不足以判断处理是否成立。你更在意人物关系、行动节奏，还是空间没有变化？可以试两个方向：${DISCUSSION_CHOICES}也可以保留现在的处理。告诉我想试的方向，我再生成预演；这次讨论没有修改舞台。`
}
