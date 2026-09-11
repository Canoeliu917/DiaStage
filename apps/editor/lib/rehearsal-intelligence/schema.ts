import { z } from 'zod'
import { Vec3Schema, VenueSchema } from '../theatre/schema'
import {
  PerformerMarkerSchema,
  RehearsalPathSchema,
  RehearsalSimulationSchema,
} from '../theatre/simulation'
import { DimensionIdSchema, ONTOLOGY_VERSION, PROMPT_VERSION } from './dimensions'

const id = z.string().min(1).max(160)
const sentence = z.string().trim().min(1).max(600)
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
  movement: z.enum(['hold', 'approach', 'withdraw', 'toward-zone']),
  targetPerformerId: id.nullable(),
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
export const RehearsalProposalSchema = ProposalContentSchema.extend({
  proposalId: id,
  activeDimensions: z.array(DimensionIdSchema).length(8),
  modelVersion: id,
  promptVersion: z.literal(PROMPT_VERSION),
  ontologyVersion: z.literal(ONTOLOGY_VERSION),
})
export const AgentOutputSchema = z.strictObject({
  dramaticState: z.array(DramaticStateSchema).max(24),
  proposals: z.array(ProposalContentSchema).min(1).max(3),
})
export const ObstacleSchema = z.strictObject({ id, name: id, min: Vec3Schema, max: Vec3Schema })
export const RehearsalContextSchema = z.strictObject({
  sceneId: id,
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
export const InteractionSchema = z.strictObject({
  interactionId: id,
  sceneId: id,
  createdAt: z.iso.datetime(),
  modelVersion: id,
  promptVersion: z.literal(PROMPT_VERSION),
  ontologyVersion: z.literal(ONTOLOGY_VERSION),
  activeDimensions: z.array(DimensionIdSchema).length(8),
  inputContext: RehearsalContextSchema,
  dramaticState: z.array(DramaticStateSchema).max(24),
  proposals: z.array(RehearsalProposalSchema).min(1).max(3),
  privateProjectData: z.literal(true),
  trainingAuthorized: z.boolean(),
})
export const FeedbackSchema = z.strictObject({
  eventId: id,
  interactionId: id,
  proposalId: id,
  sceneId: id,
  createdAt: z.iso.datetime(),
  previewed: z.boolean(),
  decision: z.enum(['preview', 'adopt', 'partial', 'edit', 'reject', 'manual-edit']),
  originalProposal: RehearsalProposalSchema,
  humanEdit: z.array(SuggestionSchema).max(12).nullable(),
  finalResult: RehearsalSimulationSchema.nullable(),
  reasonTags: z
    .array(z.enum(['intention', 'space', 'too-prescriptive', 'unsupported', 'other']))
    .max(5),
  optionalUserNote: z.string().max(1000),
  status: z.enum(['recorded', 'prepared', 'applied', 'failed']),
})
export type RehearsalContext = z.infer<typeof RehearsalContextSchema>
export type RehearsalProposal = z.infer<typeof RehearsalProposalSchema>
export type Suggestion = z.infer<typeof SuggestionSchema>
export type Interaction = z.infer<typeof InteractionSchema>
export type Feedback = z.infer<typeof FeedbackSchema>
