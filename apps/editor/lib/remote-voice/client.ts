import { z } from 'zod'

const CommandSchema = z.strictObject({
  requestId: z.string().uuid(),
  sequence: z.number().int().positive(),
  transcript: z.string().trim().min(1).max(10_000),
  createdAt: z.string().min(1),
})

export const CreatedRemoteVoiceSessionSchema = z.strictObject({
  sceneId: z.string().nullable(),
  id: z.string().uuid(),
  pairingCode: z.string().regex(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/),
  ownerToken: z.string().min(32).max(100),
  expiresAt: z.string().min(1),
})

export const CreatedRemoteVoiceResponseSchema = z.strictObject({
  session: CreatedRemoteVoiceSessionSchema,
  remotePath: z.literal('/remote-voice'),
})

export const JoinedRemoteVoiceSessionSchema = z.strictObject({
  sceneId: z.string().nullable(),
  id: z.string().uuid(),
  remoteToken: z.string().min(32).max(100),
  label: z.string().max(100).nullable(),
  expiresAt: z.string().min(1),
})

export const JoinedRemoteVoiceResponseSchema = z.strictObject({
  session: JoinedRemoteVoiceSessionSchema,
})

export const OwnerRemoteVoiceResponseSchema = z.strictObject({
  role: z.literal('owner'),
  status: z.strictObject({
    progress: z.enum(['received', 'processing', 'waiting-confirmation']).nullable(),
    paired: z.boolean(),
    connectedAt: z.string().nullable(),
    expiresAt: z.string().min(1),
    pendingCommand: CommandSchema.nullable(),
    lastAcknowledgedSequence: z.number().int().nonnegative(),
    lastAcknowledgedDisposition: z.enum(['applied', 'rejected', 'failed']).nullable(),
  }),
})

export const RemoteRemoteVoiceResponseSchema = z.strictObject({
  role: z.literal('remote'),
  status: z.strictObject({
    progress: z.enum(['received', 'processing', 'waiting-confirmation']).nullable(),
    mode: z.enum(['suggest', 'create', 'draft']),
    summary: z.string().max(300).nullable(),
    expiresAt: z.string().min(1),
    pendingSequence: z.number().int().positive().nullable(),
    lastAcknowledgedSequence: z.number().int().nonnegative(),
    lastAcknowledgedDisposition: z.enum(['applied', 'rejected', 'failed']).nullable(),
  }),
})

export const SentRemoteVoiceResponseSchema = z.strictObject({
  command: CommandSchema,
})

export type CreatedRemoteVoiceSession = z.infer<typeof CreatedRemoteVoiceResponseSchema>['session']
export type JoinedRemoteVoiceSession = z.infer<typeof JoinedRemoteVoiceResponseSchema>['session']
export type RemoteVoiceCommand = z.infer<typeof CommandSchema>
export type RemoteVoiceDisposition =
  | 'received'
  | 'processing'
  | 'waiting-confirmation'
  | 'applied'
  | 'rejected'
  | 'failed'

const ErrorResponseSchema = z.object({
  error: z.union([
    z.string(),
    z.object({ code: z.string().optional(), message: z.string().optional() }),
  ]),
})

export async function readRemoteVoiceResponse<T>(
  response: Response,
  schema: z.ZodType<T>,
  fallback: string,
): Promise<T> {
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new Error(fallback)
  }
  if (!response.ok) {
    const parsedError = ErrorResponseSchema.safeParse(body)
    const message = parsedError.success
      ? typeof parsedError.data.error === 'string'
        ? parsedError.data.error
        : parsedError.data.error.message
      : null
    throw new Error(message || fallback)
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) throw new Error(fallback)
  return parsed.data
}
