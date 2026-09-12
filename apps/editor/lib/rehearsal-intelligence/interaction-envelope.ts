import { z } from 'zod'

const id = z.string().min(1).max(160)

export const InteractionEnvelopeSchema = z.strictObject({
  schemaVersion: z.literal(1),
  interactionId: id,
  sceneId: id,
  capability: z.enum(['build', 'rehearse', 'remount']),
  // This is the proposal's input version, never the subsequently adopted scene version.
  sceneVersion: id,
  status: z.enum([
    'proposed',
    'previewed',
    'recorded',
    'prepared',
    'applied',
    'rejected',
    'failed',
    'stale',
  ]),
  createdAt: z.iso.datetime(),
  parentInteractionId: id.nullable().optional(),
})

export type InteractionEnvelope = z.infer<typeof InteractionEnvelopeSchema>

/** Missing legacy envelopes remain missing; malformed new data must remain visible as an error. */
export function readInteractionEnvelope(raw: unknown): InteractionEnvelope | null {
  return raw === undefined ? null : InteractionEnvelopeSchema.parse(raw)
}
