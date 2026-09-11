import { z } from 'zod'

const id = z.string().min(1).max(160)
const coordinate = z.number().finite().min(-100_000).max(100_000)
const position = z.tuple([coordinate, coordinate, coordinate])
const performer = z.strictObject({ id, name: z.string().max(100), position })
const path = z.strictObject({ performerId: id, points: z.array(position).max(64) })

export const RemoteDiaStateSchema = z.enum([
  'idle',
  'understanding',
  'proposing',
  'proposal-ready',
  'compiling',
  'ghost-ready',
  'waiting-human',
  'applying',
  'applied',
  'rejected',
  'stale',
  'failed',
])

// This is a display projection, never a scene document or an editable scene payload.
export const RemoteDiaSnapshotSchema = z
  .strictObject({
    version: z.literal(1),
    sceneId: id,
    sceneVersion: id,
    thread: z
      .strictObject({
        threadId: id,
        messages: z
          .array(
            z.strictObject({
              messageId: id,
              role: z.enum(['user', 'dia', 'system-state']),
              content: z.string().max(2000),
              createdAt: z.string().datetime(),
            }),
          )
          .max(12),
      })
      .nullable(),
    interactionId: id.nullable(),
    proposals: z
      .array(
        z.strictObject({
          proposalId: id,
          title: z.string().max(200),
          intention: z.string().max(500),
          rationale: z.string().max(1500),
          changes: z.array(z.string().max(500)).max(24),
          alternatives: z.array(z.string().max(500)).max(8),
        }),
      )
      .max(3),
    selectedProposalId: id.nullable(),
    state: RemoteDiaStateSchema,
    statusText: z.string().max(500),
    decision: z.enum(['none', 'adopt', 'partial', 'edit', 'reject', 'manual-edit']),
    synthetic: z.boolean(),
    stage: z.strictObject({
      width: z.number().positive().max(100_000),
      depth: z.number().positive().max(100_000),
      origin: position,
      performers: z.array(performer).max(24),
      paths: z.array(path).max(24),
    }),
    ghost: z
      .strictObject({
        proposalId: id,
        performers: z.array(performer).max(24),
        paths: z.array(path).max(24),
      })
      .nullable(),
  })
  .superRefine((value, ctx) => {
    const ids = value.proposals.map((proposal) => proposal.proposalId)
    if (
      new Set(ids).size !== ids.length ||
      (value.proposals.length > 0 && !value.interactionId) ||
      (value.selectedProposalId && !ids.includes(value.selectedProposalId)) ||
      (value.ghost &&
        (value.ghost.proposalId !== value.selectedProposalId ||
          !['ghost-ready', 'waiting-human'].includes(value.state)))
    ) {
      ctx.addIssue({ code: 'custom', message: 'Interaction projection is inconsistent.' })
    }
  })
export type RemoteDiaSnapshot = z.infer<typeof RemoteDiaSnapshotSchema>

const commandBase = {
  requestId: z.string().uuid(),
  sequence: z.number().int().positive(),
  sceneVersion: id,
}
export const RemoteDiaCommandInputSchema = z.discriminatedUnion('type', [
  z.strictObject({
    ...commandBase,
    type: z.literal('message'),
    content: z.string().trim().min(1).max(2000),
  }),
  z.strictObject({ ...commandBase, type: z.literal('select'), interactionId: id, proposalId: id }),
  z.strictObject({ ...commandBase, type: z.literal('preview'), interactionId: id, proposalId: id }),
  z.strictObject({ ...commandBase, type: z.literal('reject'), interactionId: id, proposalId: id }),
  z.strictObject({ ...commandBase, type: z.literal('cancel') }),
])
export type RemoteDiaCommandInput = z.infer<typeof RemoteDiaCommandInputSchema>
const timestamp = { createdAt: z.string().datetime() }
export const RemoteDiaCommandSchema = z.discriminatedUnion('type', [
  RemoteDiaCommandInputSchema.options[0].extend(timestamp),
  RemoteDiaCommandInputSchema.options[1].extend(timestamp),
  RemoteDiaCommandInputSchema.options[2].extend(timestamp),
  RemoteDiaCommandInputSchema.options[3].extend(timestamp),
  RemoteDiaCommandInputSchema.options[4].extend(timestamp),
])
export type RemoteDiaCommand = z.infer<typeof RemoteDiaCommandSchema>
export const RemoteDiaDispositionSchema = z.enum(['received', 'rejected', 'failed'])
export const RemoteDiaPatchSchema = z
  .strictObject({
    snapshot: RemoteDiaSnapshotSchema.optional(),
    acknowledgement: z
      .strictObject({
        sequence: z.number().int().positive(),
        disposition: RemoteDiaDispositionSchema,
        summary: z.string().max(300).optional(),
      })
      .optional(),
  })
  .refine((value) => value.snapshot !== undefined || value.acknowledgement !== undefined)

const statusBase = {
  sceneId: id.nullable(),
  expiresAt: z.string().datetime(),
  snapshot: RemoteDiaSnapshotSchema.nullable(),
  publishedAt: z.string().datetime().nullable(),
  nextSequence: z.number().int().positive(),
  lastAcknowledgedSequence: z.number().int().nonnegative(),
  lastAcknowledgedDisposition: RemoteDiaDispositionSchema.nullable(),
  summary: z.string().max(300).nullable(),
}

export const OwnerDiaResponseSchema = z.strictObject({
  role: z.literal('owner'),
  status: z.strictObject({
    ...statusBase,
    paired: z.boolean(),
    pendingCommand: RemoteDiaCommandSchema.nullable(),
  }),
})
export const RemoteDiaResponseSchema = z.strictObject({
  role: z.literal('remote'),
  status: z.strictObject({
    ...statusBase,
    ownerOnline: z.boolean(),
    pendingSequence: z.number().int().positive().nullable(),
  }),
})
export const SentDiaResponseSchema = z.strictObject({ command: RemoteDiaCommandSchema })
export type RemoteDiaStatus = z.infer<typeof RemoteDiaResponseSchema>['status']
