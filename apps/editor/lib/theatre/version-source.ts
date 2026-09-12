import { z } from 'zod'
import { InteractionEnvelopeSchema } from '../rehearsal-intelligence/interaction-envelope'

const id = z.string().min(1).max(160)
export const VERSION_SOURCE_KEY = 'diastageVersionSource'
export const VersionSourceSchema = z.enum([
  'manual',
  'dia-build',
  'dia-rehearse',
  'dia-remount',
  'restore',
])
export const VersionSourceLinkSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    source: VersionSourceSchema,
    sceneId: id,
    resultSceneVersion: id,
    resultContentVersion: id.optional(),
    interactionId: id.optional(),
    envelope: InteractionEnvelopeSchema.optional(),
    sourceVersion: id.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.source.startsWith('dia-')) {
      if (
        value.envelope?.status !== 'applied' ||
        value.interactionId !== value.envelope.interactionId ||
        value.sceneId !== value.envelope.sceneId ||
        value.source !== `dia-${value.envelope.capability}`
      )
        ctx.addIssue({ code: 'custom', message: 'Dia 版本来源必须引用同场景的正式交互回执' })
    } else if (value.interactionId || value.envelope)
      ctx.addIssue({ code: 'custom', message: '手动或恢复版本不得冒用 Dia 交互来源' })
    if (value.source === 'restore' && !value.sourceVersion)
      ctx.addIssue({ code: 'custom', message: '恢复来源缺少原版本引用' })
  })
export type VersionSourceLink = z.infer<typeof VersionSourceLinkSchema>

export function makeVersionSource(
  input: Omit<VersionSourceLink, 'schemaVersion' | 'interactionId'>,
) {
  return VersionSourceLinkSchema.parse({
    ...input,
    schemaVersion: 1,
    ...(input.envelope ? { interactionId: input.envelope.interactionId } : {}),
  })
}

/** A receipt from an older formal result is history, not attribution for a newly edited version. */
export function readVersionSource(
  raw: unknown,
  current: Pick<VersionSourceLink, 'sceneId' | 'resultSceneVersion' | 'resultContentVersion'>,
): VersionSourceLink | null {
  if (raw === undefined) return null
  const source = VersionSourceLinkSchema.parse(raw)
  return source.sceneId === current.sceneId &&
    source.resultSceneVersion === current.resultSceneVersion &&
    (!source.resultContentVersion || source.resultContentVersion === current.resultContentVersion)
    ? source
    : null
}
