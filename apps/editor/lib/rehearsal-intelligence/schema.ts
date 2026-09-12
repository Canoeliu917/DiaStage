import { z } from 'zod'
import { Vec3Schema, VenueSchema } from '../theatre/schema'
import {
  PerformerMarkerSchema,
  RehearsalPathSchema,
  RehearsalSimulationSchema,
} from '../theatre/simulation'
import { DimensionIdSchema, ONTOLOGY_VERSION, PROMPT_VERSION } from './dimensions'
import { InteractionEnvelopeSchema } from './interaction-envelope'

const id = z.string().min(1).max(160)
const sentence = z.string().trim().min(1).max(600)
const promptVersion = z.enum(['rehearsal-partner-0.1', PROMPT_VERSION])
export const RightsStatusSchema = z.enum(['unknown', 'cleared', 'restricted'])
export const DiaStatusSchema = z.enum([
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
export const EvidenceSchema = z.strictObject({
  source: z.enum(['script', 'intention', 'director']),
  quote: sentence,
})
export const DramaticStateSchema = z.strictObject({
  character: id,
  objective: sentence,
  relationship: sentence,
  action: sentence,
  tactic: sentence,
  conflict: sentence,
  spatialRelationship: sentence,
  stateChange: sentence,
  confidence: z.number().min(0).max(1),
  evidence: z.array(EvidenceSchema).max(8),
})
export const RehearsalIntelligenceSchema = z.strictObject({
  ontologyVersion: z.literal(ONTOLOGY_VERSION),
  activeDimensions: z.array(DimensionIdSchema).length(8),
  dramaticState: z.array(DramaticStateSchema).max(24),
})
export const SuggestionSchema = z.strictObject({
  id,
  performerId: id,
  intention: sentence,
  movement: z.enum(['hold', 'approach', 'withdraw', 'toward-zone', 'stand-near-object']),
  targetPerformerId: id.nullable(),
  targetObjectId: id.nullable().optional(),
  zone: z.enum(['center', 'stage-left', 'stage-right', 'upstage', 'downstage']).nullable(),
  extent: z.enum(['small', 'medium']),
  pace: z.enum(['slow', 'natural']),
})
export const ProposalContentSchema = z.strictObject({
  title: z.string().trim().min(1).max(100),
  intention: sentence,
  rationale: sentence,
  suggestions: z.array(SuggestionSchema).min(1).max(12),
  alternatives: z.array(sentence).max(3),
  evidence: z.array(EvidenceSchema).max(8),
  confidence: z.number().min(0).max(1),
})
export const ProposalRevisionSchema = z.strictObject({
  schemaVersion: z.literal(1),
  revisionId: id,
  proposalId: id,
  rootProposalId: id,
  parentProposalId: id.nullable(),
  parentInteractionId: id.nullable(),
  revisionNumber: z.number().int().nonnegative(),
  humanMessageId: id,
  instruction: z.string().trim().min(1).max(2000),
  heldPerformerIds: z.array(id).max(24),
  sceneVersion: id,
  createdAt: z.iso.datetime(),
})
export const RehearsalProposalSchema = ProposalContentSchema.extend({
  proposalId: id,
  activeDimensions: z.array(DimensionIdSchema).length(8),
  modelVersion: id,
  promptVersion,
  ontologyVersion: z.literal(ONTOLOGY_VERSION),
  sceneVersion: id.optional(),
  revision: ProposalRevisionSchema.optional(),
})
export const ThreadMessageSchema = z.strictObject({
  messageId: id,
  role: z.enum(['user', 'dia', 'system-state']),
  content: z.string().trim().min(1).max(4000),
  createdAt: z.iso.datetime(),
  sceneVersion: id,
  interactionId: id.optional(),
  proposalIds: z.array(id).max(3).optional(),
  status: DiaStatusSchema.optional(),
})
export const RehearsalThreadSchema = z.strictObject({
  schemaVersion: z.literal(1),
  threadId: id,
  sceneId: id,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  messages: z.array(ThreadMessageSchema).max(600),
  activeInteractionId: id.nullable(),
  selectedProposalId: id.nullable(),
  sceneVersion: id,
  status: DiaStatusSchema,
  rejectedProposalSignatures: z.array(z.string().max(6000)).max(8).default([]),
  privateProjectData: z.literal(true).default(true),
  trainingAuthorized: z.boolean().default(false),
  rightsStatus: RightsStatusSchema.default('unknown'),
  trainingEligible: z.literal(false).default(false),
})
export const RecentDecisionSchema = z.strictObject({
  decision: z.enum(['preview', 'adopt', 'partial', 'edit', 'reject', 'manual-edit']),
  proposalId: id,
  sceneVersion: id,
  note: z.string().max(1000),
})
export const ConversationContextSchema = z.strictObject({
  schemaVersion: z.literal(1),
  threadId: id,
  sceneId: id,
  requestMessageId: id,
  recentMessages: z
    .array(ThreadMessageSchema)
    .max(8)
    .refine(
      (messages) => messages.reduce((total, message) => total + message.content.length, 0) <= 6000,
      '最近对话超出上下文限制',
    ),
  previousInteraction: z
    .strictObject({
      interactionId: id,
      sceneVersion: id,
      proposals: z.array(RehearsalProposalSchema).min(1).max(3),
    })
    .nullable(),
  selectedProposalId: id.nullable(),
  heldPerformerIds: z.array(id).max(24),
  rejectedProposalSignatures: z.array(z.string().max(6000)).max(8),
  recentDecision: RecentDecisionSchema.nullable().default(null),
})
export const AgentOutputSchema = z.strictObject({
  dramaticState: z.array(DramaticStateSchema).max(24),
  proposals: z.array(ProposalContentSchema).min(1).max(3),
})
export const ObstacleSchema = z.strictObject({ id, name: id, min: Vec3Schema, max: Vec3Schema })
export const RehearsalContextSchema = z.strictObject({
  sceneId: id,
  sceneVersion: id.optional(),
  conversation: ConversationContextSchema.optional(),
  rightsStatus: RightsStatusSchema.optional(),
  productionId: id,
  script: z.string().max(12000),
  intention: z.string().trim().min(1).max(2000),
  directorIntention: z.string().max(2000),
  selectedPerformerId: id.nullable(),
  venue: VenueSchema,
  performers: z.array(PerformerMarkerSchema).min(1).max(24),
  paths: z
    .array(RehearsalPathSchema.extend({ points: z.array(Vec3Schema).min(2).max(64) }))
    .max(24),
  durationSeconds: z.number().finite().positive().max(3600),
  obstacles: z.array(ObstacleSchema).max(128),
  activeDimensions: z.array(DimensionIdSchema).length(8),
})
export const InteractionSchema = z
  .strictObject({
    interactionId: id,
    sceneId: id,
    sceneVersion: id.optional(),
    envelope: InteractionEnvelopeSchema.optional(),
    createdAt: z.iso.datetime(),
    modelVersion: id,
    promptVersion,
    ontologyVersion: z.literal(ONTOLOGY_VERSION),
    activeDimensions: z.array(DimensionIdSchema).length(8),
    inputContext: RehearsalContextSchema,
    dramaticState: z.array(DramaticStateSchema).max(24),
    proposals: z.array(RehearsalProposalSchema).min(1).max(3),
    privateProjectData: z.literal(true),
    trainingAuthorized: z.boolean(),
    rightsStatus: RightsStatusSchema.default('unknown'),
    trainingEligible: z.literal(false).default(false),
  })
  .refine(
    (value) =>
      !value.envelope ||
      (value.envelope.interactionId === value.interactionId &&
        value.envelope.sceneId === value.sceneId &&
        value.envelope.capability === 'rehearse' &&
        value.envelope.createdAt === value.createdAt &&
        (!value.sceneVersion || value.envelope.sceneVersion === value.sceneVersion)),
    '排演交互的公共引用与原记录不一致',
  )
export const FeedbackSchema = z
  .strictObject({
    eventId: id,
    interactionId: id,
    proposalId: id,
    sceneId: id,
    envelope: InteractionEnvelopeSchema.optional(),
    createdAt: z.iso.datetime(),
    previewed: z.boolean(),
    decision: z.enum(['preview', 'adopt', 'partial', 'edit', 'reject', 'manual-edit']),
    originalProposal: RehearsalProposalSchema,
    // Old local records did not retain the exact preview; absence must not invent one.
    previewedProposal: RehearsalProposalSchema.nullable().default(null),
    privateProjectData: z.literal(true).default(true),
    trainingAuthorized: z.boolean().default(false),
    rightsStatus: RightsStatusSchema.default('unknown'),
    trainingEligible: z.literal(false).default(false),
    humanEdit: z.array(SuggestionSchema).max(12).nullable(),
    finalResult: RehearsalSimulationSchema.nullable(),
    reasonTags: z
      .array(z.enum(['intention', 'space', 'too-prescriptive', 'unsupported', 'other']))
      .max(5),
    optionalUserNote: z.string().max(1000),
    status: z.enum(['recorded', 'prepared', 'applied', 'failed']),
  })
  .refine(
    (value) =>
      !value.envelope ||
      (value.envelope.interactionId === value.interactionId &&
        value.envelope.sceneId === value.sceneId &&
        value.envelope.capability === 'rehearse'),
    '反馈的公共引用与排演交互不一致',
  )
export type RehearsalContext = z.infer<typeof RehearsalContextSchema>
export type RehearsalProposal = z.infer<typeof RehearsalProposalSchema>
export type Suggestion = z.infer<typeof SuggestionSchema>
export type Interaction = z.infer<typeof InteractionSchema>
export type Feedback = z.infer<typeof FeedbackSchema>
export type DiaStatus = z.infer<typeof DiaStatusSchema>
export type ThreadMessage = z.infer<typeof ThreadMessageSchema>
export type RehearsalThread = z.infer<typeof RehearsalThreadSchema>
export type ProposalRevision = z.infer<typeof ProposalRevisionSchema>
export type ConversationContext = z.infer<typeof ConversationContextSchema>
export type RecentDecision = z.infer<typeof RecentDecisionSchema>
